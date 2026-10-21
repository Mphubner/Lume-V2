-- Bind hashing to the installed pgcrypto member without changing provider schemas.
-- SQL-standard bodies bind the digest OID at creation and survive schema relocation.
BEGIN;
DO $crypto$
DECLARE crypto_schema text;
BEGIN
 SELECT n.nspname INTO STRICT crypto_schema
 FROM pg_catalog.pg_extension e
 JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
 JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid
 JOIN pg_catalog.pg_depend d ON d.classid='pg_catalog.pg_proc'::pg_catalog.regclass
  AND d.objid=p.oid AND d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass
  AND d.refobjid=e.oid AND d.deptype='e'
 WHERE e.extname='pgcrypto' AND p.proname='digest' AND p.pronargs=2
  AND p.proargtypes[0]='pg_catalog.text'::pg_catalog.regtype
  AND p.proargtypes[1]='pg_catalog.text'::pg_catalog.regtype
  AND p.prorettype='pg_catalog.bytea'::pg_catalog.regtype;
 EXECUTE pg_catalog.format($function$
  CREATE OR REPLACE FUNCTION public.lume_sha256(p_input pg_catalog.text)
  RETURNS pg_catalog.bytea LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SECURITY INVOKER SET search_path=''
  RETURN %I.digest(p_input,'sha256'::pg_catalog.text)
 $function$,crypto_schema);
EXCEPTION WHEN no_data_found THEN
 RAISE EXCEPTION 'pgcrypto digest(text,text) extension member is required';
END
$crypto$;
REVOKE ALL ON FUNCTION public.lume_sha256(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lume_sha256(text) TO service_role;
CREATE OR REPLACE FUNCTION public.stage_import_rows(p_import uuid,p_lease uuid,p_rows jsonb,p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; item jsonb; key text; existing public.transactions; row_count integer:=0; state text; BEGIN
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NULL OR job.status<>'processing' OR job.lease_token IS DISTINCT FROM p_lease OR job.lease_until<=now() THEN RAISE EXCEPTION 'Lease expirado'; END IF;
 IF NOT public.actor_can_access_workspace(job.user_id,job.workspace_id,true) THEN RAISE EXCEPTION 'Acesso revogado'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 20000 OR p_metadata->>'document_hash' IS DISTINCT FROM job.document_hash THEN RAISE EXCEPTION 'Extração inválida'; END IF;
 IF EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=p_import) THEN RAISE EXCEPTION 'Lote já possui linhas'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  row_count:=row_count+1;
  IF (item->>'row_number')::integer IS DISTINCT FROM row_count OR coalesce(item->>'source_identity','') !~ '^[a-f0-9]{64}$'
   OR coalesce(item->>'content_fingerprint','') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(item->'source') IS DISTINCT FROM 'object'
   OR coalesce(item->>'amount_cents','') !~ '^-?[0-9]+$' OR length(coalesce(item->>'external_id',''))>256
   OR (item->>'date')::date NOT BETWEEN '1900-01-01'::date AND '2200-12-31'::date THEN RAISE EXCEPTION 'Proveniência inválida'; END IF;
  key:=CASE WHEN nullif(item->>'external_id','') IS NOT NULL
   THEN 'ext:'||encode(public.lume_sha256(coalesce(p_metadata->>'bank_id','')||':'||coalesce(p_metadata->>'account_reference','')||':'||(item->>'external_id')),'hex')
   ELSE 'doc:'||(item->>'source_identity') END;
  SELECT * INTO existing FROM public.transactions WHERE account_id=job.account_id AND source_key=key;
  IF EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=p_import AND source_key=key) THEN RAISE EXCEPTION 'Identificador bancário repetido no arquivo'; END IF;
  IF existing.id IS NOT NULL AND (existing.date<>(item->>'date')::date OR existing.amount<>((item->>'amount_cents')::bigint::numeric/100) OR existing.ledger_status<>'posted' OR NOT existing.is_reconciled OR existing.legacy_needs_review OR existing.content_fingerprint IS DISTINCT FROM item->>'content_fingerprint') THEN
   RAISE EXCEPTION 'Identificador bancário já existe com conteúdo diferente ou anulado. Revise a origem.';
  END IF;
  state:=CASE WHEN existing.id IS NOT NULL THEN 'duplicate' WHEN EXISTS(
   SELECT 1 FROM public.transactions t WHERE t.account_id=job.account_id AND t.date=(item->>'date')::date AND t.amount=((item->>'amount_cents')::bigint::numeric/100) AND t.ledger_status='posted'
   AND (t.content_fingerprint=item->>'content_fingerprint' OR lower(trim(coalesce(t.raw_description,t.description)))=lower(trim(item->>'description')))
  ) THEN 'potential_duplicate' ELSE 'pending' END;
  INSERT INTO public.import_rows(import_id,workspace_id,account_id,row_number,date,description,amount_cents,external_id,source_identity,source_key,content_fingerprint,source,payment_method,review_state,duplicate_of)
   VALUES(job.id,job.workspace_id,job.account_id,row_count,(item->>'date')::date,item->>'description',(item->>'amount_cents')::bigint,item->>'external_id',item->>'source_identity',key,item->>'content_fingerprint',item->'source',item->>'payment_method',state,existing.id);
 END LOOP;
 IF (p_metadata->>'row_count')::integer IS DISTINCT FROM row_count OR (p_metadata->>'sum_cents')::numeric IS DISTINCT FROM (SELECT sum(amount_cents) FROM public.import_rows WHERE import_id=p_import) THEN RAISE EXCEPTION 'Totais da extração não conferem'; END IF;
 UPDATE public.imports SET status='needs_review',total_transactions=row_count,imported_transactions=0,
  duplicates_skipped=(SELECT count(*) FROM public.import_rows WHERE import_id=p_import AND review_state='duplicate'),
  statement_metadata=p_metadata,lease_token=null,lease_until=null,updated_at=now() WHERE id=p_import;
 RETURN jsonb_build_object('status','needs_review','total_transactions',row_count);
END $$;

CREATE OR REPLACE FUNCTION public.begin_import_pipeline(p_import uuid,p_lease uuid,p_manifest text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; manifest jsonb; part jsonb; n integer:=0; count_rows integer:=0; BEGIN
 job:=public.lock_import_pipeline(p_import,p_lease);
 IF p_manifest IS NULL OR octet_length(p_manifest)>1000000 OR encode(public.lume_sha256(p_manifest),'hex') IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Manifesto corrompido'; END IF;
 manifest:=p_manifest::jsonb;
 IF manifest->>'version' IS DISTINCT FROM '1' OR manifest->>'document_hash' IS DISTINCT FROM job.document_hash
  OR manifest->'metadata'->>'document_hash' IS DISTINCT FROM job.document_hash
  OR (manifest->>'rows')::integer NOT BETWEEN 1 AND 20000 OR jsonb_typeof(manifest->'chunks') IS DISTINCT FROM 'array'
  OR jsonb_array_length(manifest->'chunks') NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'Manifesto inválido'; END IF;
 FOR part IN SELECT value FROM jsonb_array_elements(manifest->'chunks') LOOP
  n:=n+1;
  IF (part->>'index')::integer IS DISTINCT FROM n OR coalesce(part->>'hash','') !~ '^[a-f0-9]{64}$' OR (part->>'rows')::integer NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Parte inválida'; END IF;
  count_rows:=count_rows+(part->>'rows')::integer;
 END LOOP;
 IF count_rows IS DISTINCT FROM (manifest->>'rows')::integer OR manifest->>'sum_cents' IS DISTINCT FROM manifest->'metadata'->>'sum_cents'
  OR manifest->>'rows' IS DISTINCT FROM manifest->'metadata'->>'row_count' THEN RAISE EXCEPTION 'Totais do manifesto inválidos'; END IF;
 IF job.pipeline_manifest_hash IS NOT NULL AND job.pipeline_manifest_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Extração divergiu da etapa persistida'; END IF;
 UPDATE public.imports SET pipeline_manifest=manifest,pipeline_manifest_hash=p_hash,pipeline_stage='saving_chunks',total_transactions=(manifest->>'rows')::integer,updated_at=now() WHERE id=p_import;
 RETURN jsonb_build_object('chunks',coalesce((SELECT jsonb_agg(chunk_index ORDER BY chunk_index) FROM public.import_chunks WHERE import_id=p_import),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.append_import_chunk(p_import uuid,p_lease uuid,p_index integer,p_payload text,p_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; expected jsonb; rows jsonb; BEGIN
 job:=public.lock_import_pipeline(p_import,p_lease);
 IF p_index IS NULL OR p_index NOT BETWEEN 1 AND 40 OR p_payload IS NULL OR octet_length(p_payload)>8000000 OR encode(public.lume_sha256(p_payload),'hex') IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Parte corrompida'; END IF;
 expected:=job.pipeline_manifest->'chunks'->(p_index-1);rows:=p_payload::jsonb;
 IF expected IS NULL OR expected->>'hash' IS DISTINCT FROM p_hash OR jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows) IS DISTINCT FROM (expected->>'rows')::integer THEN RAISE EXCEPTION 'Parte fora do manifesto'; END IF;
 IF EXISTS(SELECT 1 FROM public.import_chunks WHERE import_id=p_import AND chunk_index=p_index AND (chunk_hash<>p_hash OR payload<>rows)) THEN RAISE EXCEPTION 'Parte divergiu da etapa persistida'; END IF;
 INSERT INTO public.import_chunks(import_id,chunk_index,chunk_hash,payload,row_count) VALUES(p_import,p_index,p_hash,rows,jsonb_array_length(rows)) ON CONFLICT DO NOTHING;
 UPDATE public.imports SET processed_rows=(SELECT sum(row_count) FROM public.import_chunks WHERE import_id=p_import),updated_at=now() WHERE id=p_import;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.stage_import_rows(uuid,uuid,jsonb,jsonb),public.begin_import_pipeline(uuid,uuid,text,text),public.append_import_chunk(uuid,uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stage_import_rows(uuid,uuid,jsonb,jsonb),public.begin_import_pipeline(uuid,uuid,text,text),public.append_import_chunk(uuid,uuid,integer,text,text) TO service_role;
ALTER TABLE public.lume_schema_migrations ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.application_readiness() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('schema_version','202610210009','workspaces',true,'staging',true,'financial_facts',true,'durable_import_chunks',true,'legacy_privileges_hardened',true,'crypto_schema_compatible',true)
$$;
REVOKE ALL ON FUNCTION public.application_readiness() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.application_readiness() TO service_role;
COMMIT;