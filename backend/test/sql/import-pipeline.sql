-- Private resumable parts and final staging run against the actual PostgreSQL functions.
BEGIN;
CREATE FUNCTION pg_temp.assert_pipeline(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'PIPELINE ASSERTION FAILED: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.pipeline_failure(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text; failed boolean:=false; BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN failed:=true;GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;END;
 IF NOT failed OR position(expected IN message)=0 THEN RAISE EXCEPTION 'Expected %, received %',expected,coalesce(message,'success'); END IF;
END $$;
DO $$
DECLARE actor uuid:=gen_random_uuid(); workspace uuid; account uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); old_lease uuid;
 hash text:=encode(digest('pipeline fixture','sha256'),'hex'); rows jsonb; parts jsonb:='[]'; manifest jsonb; payload text; part_hash text; result jsonb; i integer; cleanup_job uuid:=gen_random_uuid(); old_path text;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(actor,actor||'@fixture.invalid',now());
 SELECT id INTO workspace FROM public.workspaces WHERE owner_id=actor AND kind='personal';
 INSERT INTO public.accounts(id,user_id,workspace_id,name,type,balance,balance_date) VALUES(account,actor,workspace,'Pipeline fixture','checking',1000,'2025-12-31');
 PERFORM public.reserve_import_job(actor,job,account,hash,'large.csv','csv',20971520,'{}');
 UPDATE public.imports SET status='processing',lease_token=lease,lease_until=now()+interval '90 seconds',attempts=1 WHERE id=job;
 SELECT jsonb_agg(jsonb_build_object('row_number',n,'date','2026-01-20','description','Pipeline row '||n,'amount_cents','-1',
 'source_identity',encode(digest(hash||':'||n,'sha256'),'hex'),'content_fingerprint',encode(digest('row:'||n,'sha256'),'hex'),'source',jsonb_build_object('line',n+1))) INTO rows FROM generate_series(1,1201) n;
 FOR i IN 1..3 LOOP
  SELECT jsonb_agg(value ORDER BY ordinality)::text INTO payload FROM jsonb_array_elements(rows) WITH ORDINALITY WHERE ordinality BETWEEN (i-1)*500+1 AND i*500;
  parts:=parts||jsonb_build_array(jsonb_build_object('index',i,'hash',encode(digest(payload,'sha256'),'hex'),'rows',jsonb_array_length(payload::jsonb)));
 END LOOP;
 manifest:=jsonb_build_object('version',1,'document_hash',hash,'rows',1201,'sum_cents','-1201','chunks',parts,
 'metadata',jsonb_build_object('document_hash',hash,'row_count',1201,'sum_cents','-1201','format','csv'));
 payload:=manifest::text;
 PERFORM public.begin_import_pipeline(job,lease,payload,encode(digest(payload,'sha256'),'hex'));
 PERFORM public.checkpoint_import_page(job,lease,1,'01/01/2026 Compra -10,00','{"engine":"pdf-text"}');
 PERFORM pg_temp.assert_pipeline((public.read_import_pipeline(job,lease)->'pages'->0->>'text')='01/01/2026 Compra -10,00','page text survives a worker restart');
 FOR i IN 1..2 LOOP
  SELECT jsonb_agg(value ORDER BY ordinality)::text INTO payload FROM jsonb_array_elements(rows) WITH ORDINALITY WHERE ordinality BETWEEN (i-1)*500+1 AND i*500;
  part_hash:=encode(digest(payload,'sha256'),'hex');
  PERFORM public.append_import_chunk(job,lease,i,payload,part_hash);
  PERFORM public.append_import_chunk(job,lease,i,payload,part_hash);
 END LOOP;
 PERFORM pg_temp.assert_pipeline((SELECT count(*)=2 FROM public.import_chunks WHERE import_id=job),'lost response retry is idempotent');
 PERFORM pg_temp.assert_pipeline((SELECT processed_rows=1000 FROM public.imports WHERE id=job),'progress counts durable rows once');
 PERFORM pg_temp.pipeline_failure(format('SELECT public.finish_import_pipeline(%L,%L)',job,lease),'Faltam partes');
 PERFORM pg_temp.assert_pipeline((SELECT count(*)=0 FROM public.import_rows WHERE import_id=job) AND (SELECT count(*)=0 FROM public.transactions WHERE import_id=job),'missing final part exposes no review rows or ledger');
 PERFORM pg_temp.pipeline_failure(format('SELECT public.append_import_chunk(%L,%L,3,%L,%L)',job,lease,'[]',repeat('0',64)),'Parte corrompida');
 old_lease:=lease;lease:=gen_random_uuid();UPDATE public.imports SET lease_token=lease WHERE id=job;
 PERFORM pg_temp.pipeline_failure(format('SELECT public.append_import_chunk(%L,%L,3,%L,%L)',job,old_lease,'[]',repeat('0',64)),'Lease expirado');
 result:=public.read_import_pipeline(job,lease);
 PERFORM pg_temp.assert_pipeline(jsonb_array_length(result->'chunks')=2,'new lease resumes two committed parts');
 SELECT jsonb_agg(value ORDER BY ordinality)::text INTO payload FROM jsonb_array_elements(rows) WITH ORDINALITY WHERE ordinality>1000;
 PERFORM public.append_import_chunk(job,lease,3,payload,encode(digest(payload,'sha256'),'hex'));
 result:=public.finish_import_pipeline(job,lease);
 PERFORM pg_temp.assert_pipeline(result->>'status'='needs_review' AND (SELECT count(*)=1201 FROM public.import_rows WHERE import_id=job),'finalization publishes all 1201 rows together');
 PERFORM pg_temp.assert_pipeline((SELECT count(*)=0 FROM public.transactions WHERE import_id=job),'complete staging still does not post');
 PERFORM pg_temp.assert_pipeline((SELECT count(*)=0 FROM public.import_chunks WHERE import_id=job) AND (SELECT count(*)=0 FROM public.import_extract_pages WHERE import_id=job),'private intermediate copies removed after successful staging');
 result:=public.approve_import_rows(actor,job,(SELECT array_agg(id ORDER BY row_number) FROM public.import_rows WHERE import_id=job),'{"source_confirmed":true,"opening_balance":"1000.00","closing_balance":"987.99","period_start":"2026-01-01","period_end":"2026-01-31"}');
 PERFORM pg_temp.assert_pipeline(result->>'imported'='1201' AND (SELECT sum(amount)=-12.01 FROM public.transactions WHERE import_id=job),'single atomic approval preserves cents over chunks');
 PERFORM pg_temp.assert_pipeline(NOT has_table_privilege('authenticated','public.import_chunks','SELECT') AND NOT has_table_privilege('authenticated','public.import_extract_pages','SELECT'),'intermediate financial data cannot be read by browser role');
 PERFORM pg_temp.assert_pipeline(NOT has_function_privilege('authenticated','public.append_import_chunk(uuid,uuid,integer,text,text)','EXECUTE'),'caller cannot forge a chunk RPC');
 PERFORM pg_temp.pipeline_failure(format('SELECT public.complete_import_source_cleanup(%L,%L)',job,(SELECT storage_path FROM public.imports WHERE id=job)),'Fonte ainda');
 UPDATE public.imports SET source_expires_at=now()-interval '1 minute' WHERE id=job;
 INSERT INTO public.import_chunks(import_id,chunk_index,chunk_hash,payload,row_count) VALUES(job,1,repeat('a',64),'[{}]',1);
 INSERT INTO public.import_extract_pages(import_id,page,text_content,info) VALUES(job,1,'Retained private intermediate','{}');
 PERFORM public.complete_import_source_cleanup(job,(SELECT storage_path FROM public.imports WHERE id=job));
 PERFORM pg_temp.assert_pipeline((SELECT count(*)=0 FROM public.import_chunks WHERE import_id=job) AND (SELECT count(*)=0 FROM public.import_extract_pages WHERE import_id=job),'expired terminal source removes intermediate financial copies');
 PERFORM pg_temp.assert_pipeline((SELECT count(*)=1201 FROM public.import_rows WHERE import_id=job) AND (SELECT count(*)=1201 FROM public.transactions WHERE import_id=job),'retention cleanup preserves reviewed provenance and financial ledger');
 PERFORM public.reserve_import_job(actor,cleanup_job,account,repeat('f',64),'interrupted.csv','csv',100,'{}');
 SELECT storage_path INTO old_path FROM public.imports WHERE id=cleanup_job;
 UPDATE public.imports SET status='failed',last_error_code='UPLOAD_FAILED',source_expires_at=now()-interval '1 minute' WHERE id=cleanup_job;
 result:=public.reserve_import_job(actor,gen_random_uuid(),account,repeat('f',64),'interrupted.csv','csv',100,'{}');
 PERFORM pg_temp.assert_pipeline(result->>'storage_path'<>old_path,'reupload has a new storage object so stale cleanup cannot delete the new source');
 PERFORM pg_temp.assert_pipeline(NOT public.complete_import_source_cleanup(cleanup_job,old_path),'stale cleanup cannot mark a replacement source as deleted');
 PERFORM pg_temp.assert_pipeline((SELECT status='uploading' AND source_deleted_at IS NULL FROM public.imports WHERE id=cleanup_job),'replacement upload remains available after old cleanup callback');
 PERFORM pg_temp.assert_pipeline((SELECT count(*)=1 FROM public.import_retired_sources WHERE import_id=cleanup_job AND storage_path=old_path),'replaced blob remains tracked durably until cleanup');
 PERFORM pg_temp.assert_pipeline(public.complete_retired_import_source_cleanup(cleanup_job,old_path),'expired previous blob pointer can be retired after Storage deletion');
 PERFORM pg_temp.assert_pipeline(NOT has_table_privilege('authenticated','public.import_retired_sources','SELECT'),'retired storage paths remain private');
 RAISE NOTICE 'PASS: durable chunks, exact retry, page checkpoints, missing/corrupt part, old lease, 1201-row atomic review and approval, private storage';
END $$;
ROLLBACK;
