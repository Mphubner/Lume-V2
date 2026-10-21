-- Run only in the disposable database created by test-sql.mjs.
-- Relocation and the hostile public.digest fixture are rolled back together.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$ BEGIN
 IF (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto')<>'extensions' THEN
  ALTER EXTENSION pgcrypto SET SCHEMA extensions;
 END IF;
END $$;
CREATE FUNCTION public.digest(text,text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT '\x00'::bytea $$;
CREATE FUNCTION pg_temp.assert_crypto(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'CRYPTO ASSERTION FAILED: %',label; END IF; END $$;
DO $$
DECLARE actor uuid:=gen_random_uuid(); workspace uuid; account uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid();
 hash text:=encode(public.lume_sha256('crypto fixture'),'hex'); rows jsonb; metadata jsonb; manifest text; payload text; payload_hash text; result jsonb; failed boolean;
BEGIN
 PERFORM pg_temp.assert_crypto(encode(public.lume_sha256('abc'),'hex')='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','standard SHA-256 vector ignores public.digest shadow');
 PERFORM pg_temp.assert_crypto(public.lume_sha256(null) IS NULL,'null hashing remains strict');
 PERFORM pg_temp.assert_crypto((SELECT prosqlbody IS NOT NULL AND NOT prosecdef AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='public.lume_sha256(text)'::regprocedure),'parsed SQL helper has empty search path and invoker privileges');
 PERFORM pg_temp.assert_crypto(EXISTS(SELECT 1 FROM pg_depend WHERE classid='pg_proc'::regclass AND objid='public.lume_sha256(text)'::regprocedure AND refclassid='pg_proc'::regclass AND refobjid='extensions.digest(text,text)'::regprocedure),'helper retains dependency on actual extension function after relocation');
 PERFORM pg_temp.assert_crypto(NOT has_function_privilege('authenticated','public.lume_sha256(text)','EXECUTE') AND NOT has_function_privilege('anon','public.lume_sha256(text)','EXECUTE'),'helper is unavailable to browser roles');
 PERFORM pg_temp.assert_crypto((SELECT relrowsecurity FROM pg_class WHERE oid='public.lume_schema_migrations'::regclass),'migration metadata has RLS');
 PERFORM pg_temp.assert_crypto(public.application_readiness()->>'schema_version'='202610210009','readiness requires compatibility migration');
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(actor,actor||'@crypto.invalid',now());
 SELECT id INTO workspace FROM public.workspaces WHERE owner_id=actor AND kind='personal';
 INSERT INTO public.accounts(id,user_id,workspace_id,name,type,balance,balance_date) VALUES(account,actor,workspace,'Crypto fixture','checking',100,'2026-01-01');
 PERFORM public.reserve_import_job(actor,job,account,hash,'crypto.csv','csv',100,'{}');
 UPDATE public.imports SET status='processing',lease_token=lease,lease_until=now()+interval '90 seconds',attempts=1 WHERE id=job;
 rows:=jsonb_build_array(jsonb_build_object('row_number',1,'date','2026-01-20','description','Crypto row','amount_cents','-123','external_id','bank-row-1',
  'source_identity',encode(public.lume_sha256('source'),'hex'),'content_fingerprint',encode(public.lume_sha256('content'),'hex'),'source',jsonb_build_object('line',2)));
 metadata:=jsonb_build_object('document_hash',hash,'row_count',1,'sum_cents','-123','bank_id','bank','account_reference','account');
 payload:=rows::text;payload_hash:=encode(public.lume_sha256(payload),'hex');
 manifest:=jsonb_build_object('version',1,'document_hash',hash,'rows',1,'sum_cents','-123','metadata',metadata,
  'chunks',jsonb_build_array(jsonb_build_object('index',1,'hash',payload_hash,'rows',1)))::text;
 SET LOCAL ROLE service_role;
 failed:=false;
 BEGIN PERFORM public.begin_import_pipeline(job,lease,manifest,repeat('0',64)); EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'Manifesto corrompido' THEN RAISE; END IF; failed:=true;
 END;
 PERFORM pg_temp.assert_crypto(failed,'manifest checksum is still enforced');
 PERFORM public.begin_import_pipeline(job,lease,manifest,encode(public.lume_sha256(manifest),'hex'));
 failed:=false;
 BEGIN PERFORM public.append_import_chunk(job,lease,1,payload,repeat('0',64)); EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'Parte corrompida' THEN RAISE; END IF; failed:=true;
 END;
 PERFORM pg_temp.assert_crypto(failed,'chunk checksum is still enforced');
 PERFORM public.append_import_chunk(job,lease,1,payload,payload_hash);
 PERFORM public.append_import_chunk(job,lease,1,payload,payload_hash);
 result:=public.finish_import_pipeline(job,lease);
 RESET ROLE;
 PERFORM pg_temp.assert_crypto(result->>'status'='needs_review','begin/append/finish actually stage the external-ID row with pgcrypto in extensions');
 PERFORM pg_temp.assert_crypto((SELECT count(*)=1 AND min(source_key)='ext:'||encode(extensions.digest('bank:account:bank-row-1','sha256'),'hex') FROM public.import_rows WHERE import_id=job),'bank identity hashing uses original pgcrypto digest');
 PERFORM pg_temp.assert_crypto((SELECT count(*)=0 FROM public.transactions WHERE import_id=job),'staging preserves the financial approval boundary');
 RAISE NOTICE 'PASS: pgcrypto namespace compatibility, parse-time binding, shadow resistance, real pipeline RPCs, checksum failures and privileges';
END $$;
ROLLBACK;
