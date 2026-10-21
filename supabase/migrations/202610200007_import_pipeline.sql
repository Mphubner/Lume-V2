-- Additive durable conversion pipeline. Private chunks never change the ledger.
BEGIN;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'queued';
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS processed_rows integer NOT NULL DEFAULT 0 CHECK(processed_rows BETWEEN 0 AND 20000);
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS processed_pages integer NOT NULL DEFAULT 0 CHECK(processed_pages BETWEEN 0 AND 60);
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS pipeline_manifest jsonb;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS pipeline_manifest_hash text;
ALTER TABLE public.import_rows DROP CONSTRAINT IF EXISTS import_rows_row_number_check;
ALTER TABLE public.import_rows ADD CONSTRAINT import_rows_row_number_check CHECK(row_number BETWEEN 1 AND 20000);
ALTER TABLE public.imports DROP CONSTRAINT IF EXISTS imports_file_type_check;
ALTER TABLE public.imports ADD CONSTRAINT imports_file_type_check CHECK(file_type IN ('pdf','csv','ofx','xlsx','txt','png','jpg','jpeg'));
CREATE INDEX IF NOT EXISTS import_row_source_key ON public.import_rows(import_id,source_key);
CREATE TABLE IF NOT EXISTS public.import_chunks(
 import_id uuid NOT NULL REFERENCES public.imports(id) ON DELETE RESTRICT,
 chunk_index integer NOT NULL CHECK(chunk_index BETWEEN 1 AND 40),
 chunk_hash text NOT NULL, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='array' AND jsonb_array_length(payload) BETWEEN 1 AND 500),
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 500),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(import_id,chunk_index)
);
CREATE TABLE IF NOT EXISTS public.import_extract_pages(
 import_id uuid NOT NULL REFERENCES public.imports(id) ON DELETE RESTRICT,
 page integer NOT NULL CHECK(page BETWEEN 1 AND 60),text_content text NOT NULL CHECK(octet_length(text_content)<=128000),
 info jsonb NOT NULL CHECK(jsonb_typeof(info)='object'),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(import_id,page)
);
CREATE TABLE IF NOT EXISTS public.import_retired_sources(
 import_id uuid NOT NULL REFERENCES public.imports(id) ON DELETE RESTRICT, storage_path text PRIMARY KEY,
 expires_at timestamptz NOT NULL,retired_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.import_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_extract_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_retired_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_chunks,public.import_extract_pages FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.import_chunks,public.import_extract_pages TO service_role;
REVOKE ALL ON public.import_retired_sources FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.import_retired_sources TO service_role;
DO $$ BEGIN IF to_regclass('storage.buckets') IS NOT NULL THEN
 UPDATE storage.buckets SET file_size_limit=20971520 WHERE id='financial-imports';
END IF; END $$;
CREATE OR REPLACE FUNCTION public.reserve_import_job(p_actor uuid,p_id uuid,p_account uuid,p_hash text,p_filename text,p_type text,p_size bigint,p_options jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.accounts; job public.imports; BEGIN
 -- Serializes quota and same-document reservation for this actor, even on multiple API instances.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,41));
 SELECT * INTO a FROM public.accounts WHERE id=p_account FOR UPDATE;
 IF a.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,a.workspace_id,true) THEN RAISE EXCEPTION 'Conta indisponível para importação'; END IF;
  IF p_type IS NULL OR p_type NOT IN ('csv','ofx','pdf','xlsx','txt','png','jpg','jpeg') OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 20971520 OR coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Arquivo inválido'; END IF;
 SELECT * INTO job FROM public.imports WHERE account_id=p_account AND document_hash=p_hash;
  IF job.id IS NOT NULL THEN
   IF job.user_id=p_actor AND job.status='failed' AND job.last_error_code IN ('UPLOAD_FAILED','UPLOAD_INTERRUPTED') THEN
    IF job.storage_path IS NOT NULL THEN
     INSERT INTO public.import_retired_sources(import_id,storage_path,expires_at) VALUES(job.id,job.storage_path,job.source_expires_at) ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.imports SET status='uploading',parser_options=p_options,last_error_code=null,error_message=null,
     source_deleted_at=null,source_expires_at=now()+interval '30 days',storage_path=a.workspace_id::text||'/'||job.id::text||'/source-'||gen_random_uuid()::text||'.'||p_type,updated_at=now() WHERE id=job.id RETURNING * INTO job;
    RETURN to_jsonb(job)||jsonb_build_object('existing',false,'reupload',true);
   END IF;
   RETURN to_jsonb(job)||jsonb_build_object('existing',true);
  END IF;
 IF (SELECT count(*) FROM public.imports WHERE user_id=p_actor AND status IN ('uploading','queued','processing','needs_review'))>=5 THEN RAISE EXCEPTION 'Há cinco lotes pendentes. Revise ou cancele antes de importar.'; END IF;
 IF (SELECT count(*) FROM public.imports WHERE user_id=p_actor AND created_at>now()-interval '24 hours')>=20 THEN RAISE EXCEPTION 'Limite de 20 importações em 24 horas atingido'; END IF;
 INSERT INTO public.imports(id,user_id,workspace_id,account_id,filename,file_type,status,document_hash,storage_path,file_size,parser_options)
 VALUES(p_id,p_actor,a.workspace_id,p_account,left(p_filename,240),p_type,'uploading',p_hash,a.workspace_id::text||'/'||p_id::text||'/source.'||p_type,p_size,p_options)
 RETURNING * INTO job;
 RETURN to_jsonb(job)||jsonb_build_object('existing',false);
END $$;

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
   THEN 'ext:'||encode(digest(coalesce(p_metadata->>'bank_id','')||':'||coalesce(p_metadata->>'account_reference','')||':'||(item->>'external_id'),'sha256'),'hex')
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

CREATE OR REPLACE FUNCTION public.retry_import_job(p_actor uuid,p_import uuid,p_options jsonb DEFAULT '{}')
RETURNS public.imports LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,41));
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,job.workspace_id,true) THEN RAISE EXCEPTION 'Importação indisponível'; END IF;
 IF job.status NOT IN ('failed','cancelled') OR job.source_deleted_at IS NOT NULL OR job.storage_path IS NULL OR job.source_expires_at<=now()
  OR job.last_error_code IN ('UPLOAD_FAILED','UPLOAD_INTERRUPTED') THEN RAISE EXCEPTION 'Arquivo indisponível para retentativa. Envie o arquivo novamente.'; END IF;
 IF (SELECT count(*) FROM public.imports WHERE user_id=job.user_id AND status IN ('uploading','queued','processing','needs_review'))>=5 THEN RAISE EXCEPTION 'Há cinco lotes pendentes. Revise ou cancele antes de retentar.'; END IF;
 IF EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=job.id) THEN
  UPDATE public.imports SET status='needs_review',lease_token=null,lease_until=null,error_message=null,last_error_code=null,updated_at=now() WHERE id=job.id RETURNING * INTO job;
 ELSE
  IF job.attempts>=3 THEN RAISE EXCEPTION 'Três tentativas esgotadas. Revise o erro e exporte novo arquivo.'; END IF;
  IF job.parser_options IS DISTINCT FROM p_options THEN
   DELETE FROM public.import_chunks WHERE import_id=job.id;
   DELETE FROM public.import_extract_pages WHERE import_id=job.id;
   UPDATE public.imports SET pipeline_manifest=null,pipeline_manifest_hash=null,processed_rows=0,pipeline_stage='queued' WHERE id=job.id;
  END IF;
  UPDATE public.imports SET status='queued',parser_options=p_options,lease_token=null,lease_until=null,error_message=null,last_error_code=null,
   next_attempt_at=now(),updated_at=now() WHERE id=job.id RETURNING * INTO job;
 END IF;
 RETURN job;
END $$;

CREATE OR REPLACE FUNCTION public.lock_import_pipeline(p_import uuid,p_lease uuid)
RETURNS public.imports LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; BEGIN
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NULL OR job.status<>'processing' OR job.lease_token IS DISTINCT FROM p_lease OR job.lease_until<=now() THEN RAISE EXCEPTION 'Lease expirado'; END IF;
 IF NOT public.actor_can_access_workspace(job.user_id,job.workspace_id,true) THEN RAISE EXCEPTION 'Acesso revogado'; END IF;
 RETURN job;
END $$;

CREATE OR REPLACE FUNCTION public.read_import_pipeline(p_import uuid,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; BEGIN
 job:=public.lock_import_pipeline(p_import,p_lease);
 UPDATE public.imports SET pipeline_stage=CASE WHEN pipeline_manifest IS NULL THEN 'extracting' ELSE 'saving_chunks' END,updated_at=now() WHERE id=p_import;
 RETURN jsonb_build_object('manifest',job.pipeline_manifest,
 'chunks',coalesce((SELECT jsonb_agg(chunk_index ORDER BY chunk_index) FROM public.import_chunks WHERE import_id=p_import),'[]'::jsonb),
 'pages',coalesce((SELECT jsonb_agg(jsonb_build_object('page',page,'text',text_content,'info',info) ORDER BY page) FROM public.import_extract_pages WHERE import_id=p_import),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.checkpoint_import_page(p_import uuid,p_lease uuid,p_page integer,p_text text,p_info jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; BEGIN
 job:=public.lock_import_pipeline(p_import,p_lease);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 60 OR p_text IS NULL OR octet_length(p_text)>128000 OR jsonb_typeof(p_info) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Página inválida'; END IF;
 IF EXISTS(SELECT 1 FROM public.import_extract_pages WHERE import_id=p_import AND page=p_page AND (text_content<>p_text OR info<>p_info)) THEN RAISE EXCEPTION 'Página divergiu da etapa persistida'; END IF;
 INSERT INTO public.import_extract_pages(import_id,page,text_content,info) VALUES(p_import,p_page,p_text,p_info) ON CONFLICT DO NOTHING;
 UPDATE public.imports SET processed_pages=(SELECT count(*) FROM public.import_extract_pages WHERE import_id=p_import),updated_at=now() WHERE id=p_import;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.begin_import_pipeline(p_import uuid,p_lease uuid,p_manifest text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; manifest jsonb; part jsonb; n integer:=0; count_rows integer:=0; BEGIN
 job:=public.lock_import_pipeline(p_import,p_lease);
 IF p_manifest IS NULL OR octet_length(p_manifest)>1000000 OR encode(digest(p_manifest,'sha256'),'hex') IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Manifesto corrompido'; END IF;
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
 IF p_index IS NULL OR p_index NOT BETWEEN 1 AND 40 OR p_payload IS NULL OR octet_length(p_payload)>8000000 OR encode(digest(p_payload,'sha256'),'hex') IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Parte corrompida'; END IF;
 expected:=job.pipeline_manifest->'chunks'->(p_index-1);rows:=p_payload::jsonb;
 IF expected IS NULL OR expected->>'hash' IS DISTINCT FROM p_hash OR jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows) IS DISTINCT FROM (expected->>'rows')::integer THEN RAISE EXCEPTION 'Parte fora do manifesto'; END IF;
 IF EXISTS(SELECT 1 FROM public.import_chunks WHERE import_id=p_import AND chunk_index=p_index AND (chunk_hash<>p_hash OR payload<>rows)) THEN RAISE EXCEPTION 'Parte divergiu da etapa persistida'; END IF;
 INSERT INTO public.import_chunks(import_id,chunk_index,chunk_hash,payload,row_count) VALUES(p_import,p_index,p_hash,rows,jsonb_array_length(rows)) ON CONFLICT DO NOTHING;
 UPDATE public.imports SET processed_rows=(SELECT sum(row_count) FROM public.import_chunks WHERE import_id=p_import),updated_at=now() WHERE id=p_import;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.finish_import_pipeline(p_import uuid,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; rows jsonb; result jsonb; BEGIN
 job:=public.lock_import_pipeline(p_import,p_lease);
 IF job.pipeline_manifest IS NULL OR (SELECT count(*) FROM public.import_chunks WHERE import_id=p_import) IS DISTINCT FROM jsonb_array_length(job.pipeline_manifest->'chunks') THEN RAISE EXCEPTION 'Faltam partes do arquivo'; END IF;
 IF EXISTS(SELECT 1 FROM public.import_chunks c WHERE c.import_id=p_import AND c.chunk_hash IS DISTINCT FROM job.pipeline_manifest->'chunks'->(c.chunk_index-1)->>'hash') THEN RAISE EXCEPTION 'Partes divergentes'; END IF;
 SELECT jsonb_agg(r.value ORDER BY c.chunk_index,r.ordinality) INTO rows FROM public.import_chunks c CROSS JOIN LATERAL jsonb_array_elements(c.payload) WITH ORDINALITY r(value,ordinality) WHERE c.import_id=p_import;
 IF jsonb_array_length(rows) IS DISTINCT FROM (job.pipeline_manifest->>'rows')::integer THEN RAISE EXCEPTION 'Contagem final divergente'; END IF;
 UPDATE public.imports SET pipeline_stage='validating' WHERE id=p_import;
 result:=public.stage_import_rows(p_import,p_lease,rows,job.pipeline_manifest->'metadata');
 UPDATE public.imports SET pipeline_stage='ready_for_review',processed_rows=jsonb_array_length(rows),pipeline_manifest=null WHERE id=p_import;
 DELETE FROM public.import_chunks WHERE import_id=p_import;
 DELETE FROM public.import_extract_pages WHERE import_id=p_import;
 RETURN result;
END $$;

-- Called only after the private source blob was removed successfully. Terminal
-- and retention checks share the row lock with claiming/retrying a job.
CREATE OR REPLACE FUNCTION public.complete_import_source_cleanup(p_import uuid,p_storage_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; BEGIN
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NOT NULL AND job.storage_path IS DISTINCT FROM p_storage_path THEN RETURN false; END IF;
 IF job.id IS NULL OR job.status NOT IN ('completed','failed','cancelled','reversed') OR job.source_expires_at>now() THEN RAISE EXCEPTION 'Fonte ainda não pode ser removida'; END IF;
 DELETE FROM public.import_chunks WHERE import_id=p_import;
 DELETE FROM public.import_extract_pages WHERE import_id=p_import;
 UPDATE public.imports SET source_deleted_at=now(),pipeline_manifest=null,updated_at=now() WHERE id=p_import;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.complete_retired_import_source_cleanup(p_import uuid,p_storage_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.imports WHERE id=p_import AND storage_path=p_storage_path) THEN RAISE EXCEPTION 'Fonte atual não pode ser removida como versão anterior'; END IF;
 DELETE FROM public.import_retired_sources WHERE import_id=p_import AND storage_path=p_storage_path AND expires_at<=now();
 RETURN FOUND;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('lock_import_pipeline','read_import_pipeline','checkpoint_import_page','begin_import_pipeline','append_import_chunk','finish_import_pipeline','complete_import_source_cleanup','complete_retired_import_source_cleanup','reserve_import_job','stage_import_rows','retry_import_job') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
