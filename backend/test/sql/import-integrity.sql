-- Synthetic fixtures only. Run after schema.sql and migrations 001-004.
-- Every fixture and temporary helper is rolled back, including on assertion failure.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.expect_failure(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text; failed boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN failed:=true; GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; END;
 IF NOT failed OR position(expected IN message)=0 THEN RAISE EXCEPTION 'Expected failure %, received %',expected,coalesce(message,'success'); END IF;
END $$;
CREATE FUNCTION pg_temp.stage_fixture(actor uuid, account uuid, seed text, rows jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE job uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); hash text:=encode(digest(seed,'sha256'),'hex'); staged jsonb;
BEGIN
 PERFORM public.reserve_import_job(actor,job,account,hash,seed||'.csv','csv',100,'{}');
 UPDATE public.imports SET status='processing',lease_token=lease,lease_until=now()+interval '90 seconds',attempts=1 WHERE id=job;
 SELECT jsonb_agg(value||jsonb_build_object('row_number',ordinality,'source_identity',encode(digest(hash||':'||ordinality,'sha256'),'hex'),
 'content_fingerprint',encode(digest(value->>'date'||':'||(value->>'amount_cents')||':'||(value->>'description'),'sha256'),'hex'),'source',jsonb_build_object('line',ordinality))) INTO staged
 FROM jsonb_array_elements(rows) WITH ORDINALITY;
 PERFORM public.stage_import_rows(job,lease,staged,jsonb_build_object('document_hash',hash,'row_count',jsonb_array_length(rows),'sum_cents',(SELECT sum((value->>'amount_cents')::numeric)::text FROM jsonb_array_elements(rows))));
 RETURN job;
END $$;
CREATE FUNCTION pg_temp.approve_fixture(actor uuid, job uuid, opening numeric, closing numeric) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.approve_import_rows(actor,job,(SELECT array_agg(id ORDER BY row_number) FROM public.import_rows WHERE import_id=job),
 jsonb_build_object('source_confirmed',true,'opening_balance',opening::text,'closing_balance',closing::text,'period_start','2026-01-01','period_end','2026-01-31'))
$$;
DO $$
DECLARE
 u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); w1 uuid; w2 uuid; a1 uuid:=gen_random_uuid(); a2 uuid:=gen_random_uuid(); foreign_account uuid:=gen_random_uuid();
 job uuid; job2 uuid; atomic_job uuid; transfer_job uuid; queue1 uuid; queue2 uuid; queue3 uuid; lease uuid; claimed public.imports; first_lease uuid; posted uuid; row_id uuid; ref uuid:=gen_random_uuid(); result jsonb;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(u1,u1||'@fixture.invalid',now()),(u2,u2||'@fixture.invalid',now());
 SELECT id INTO w1 FROM public.workspaces WHERE owner_id=u1 AND kind='personal';
 SELECT id INTO w2 FROM public.workspaces WHERE owner_id=u2 AND kind='personal';
 INSERT INTO public.accounts(id,user_id,workspace_id,name,type,balance,balance_date) VALUES
 (a1,u1,w1,'Fixture PicPay','wallet',1000,'2025-12-31'),(a2,u1,w1,'Fixture Inter','checking',0,'2025-12-31'),(foreign_account,u2,w2,'Foreign','checking',0,'2025-12-31');

 PERFORM pg_temp.expect_failure(format('SELECT public.reserve_import_job(%L,%L,%L,%L,%L,%L,100,%L)',u2,gen_random_uuid(),a1,repeat('a',64),'denied.csv','csv','{}'),'Conta indisponível');
 PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated','public.approve_import_rows(uuid,uuid,uuid[],jsonb)','EXECUTE'),'public role cannot impersonate actor via approval RPC');
 PERFORM pg_temp.assert_true(NOT has_table_privilege('authenticated','public.import_rows','UPDATE'),'browser cannot bypass staged review');

 job:=pg_temp.stage_fixture(u1,a1,'first','[{"date":"2026-01-02","description":"Recebimento cliente","amount_cents":"10000","external_id":"FITID-A"},{"date":"2026-01-03","description":"Mercado","amount_cents":"-2500","external_id":"FITID-B"}]');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.import_rows WHERE import_id=job),'all source rows staged');
 PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.transactions WHERE import_id=job),'staging never changes ledger');
 PERFORM pg_temp.expect_failure(format('SELECT pg_temp.approve_fixture(%L,%L,1000,999)',u1,job),'difere do fechamento');
 PERFORM pg_temp.assert_true((SELECT status='needs_review' FROM public.imports WHERE id=job),'mismatched balance leaves review pending');
 PERFORM pg_temp.expect_failure(format('SELECT public.approve_import_rows(%L,%L,null,%L)',u1,job,'{}'),'Selecione explicitamente');
 result:=pg_temp.approve_fixture(u1,job,1000,1075);
 PERFORM pg_temp.assert_true(result->>'imported'='2','complete balanced batch posts both rows');
 result:=pg_temp.approve_fixture(u1,job,1000,1075);
 PERFORM pg_temp.assert_true((result->>'idempotent')::boolean AND (SELECT count(*)=2 FROM public.transactions WHERE import_id=job),'approval retry cannot duplicate ledger');

 job2:=pg_temp.stage_fixture(u1,a1,'overlap','[{"date":"2026-01-02","description":"Recebimento cliente","amount_cents":"10000","external_id":"FITID-A"}]');
 PERFORM pg_temp.assert_true((SELECT review_state='duplicate' FROM public.import_rows WHERE import_id=job2),'exact bank identity detected across documents');
 result:=pg_temp.approve_fixture(u1,job2,1000,1100);
 PERFORM pg_temp.assert_true(result->>'duplicates'='1' AND result->>'imported'='0','overlapping document produces no new transaction');
 PERFORM pg_temp.expect_failure(format('SELECT pg_temp.stage_fixture(%L,%L,%L,%L)',u1,a1,'conflicting-id','[{"date":"2026-01-02","description":"Other merchant","amount_cents":"10000","external_id":"FITID-A"}]'),'conteúdo diferente');

 job2:=pg_temp.stage_fixture(u1,a1,'ambiguous','[{"date":"2026-01-03","description":"Mercado","amount_cents":"-2500"}]');
 SELECT id INTO row_id FROM public.import_rows WHERE import_id=job2;
 PERFORM pg_temp.assert_true((SELECT review_state='potential_duplicate' FROM public.import_rows WHERE id=row_id),'same content without identity requires review');
 PERFORM pg_temp.expect_failure(format('SELECT pg_temp.approve_fixture(%L,%L,1000,975)',u1,job2),'possíveis duplicatas');
 PERFORM public.update_import_row(u1,row_id,'{"distinct_confirmed":true}');
 result:=pg_temp.approve_fixture(u1,job2,1000,975);
 PERFORM pg_temp.assert_true(result->>'imported'='1','explicitly confirmed legitimate repeated payment is preserved');

 atomic_job:=pg_temp.stage_fixture(u1,a1,'atomic','[{"date":"2026-01-05","description":"Valid first row","amount_cents":"-1000"},{"date":"2026-01-06","description":"Unlinked refund","amount_cents":"500"}]');
 SELECT id INTO row_id FROM public.import_rows WHERE import_id=atomic_job AND row_number=2;
 PERFORM public.update_import_row(u1,row_id,'{"economic_kind":"refund"}');
 PERFORM pg_temp.expect_failure(format('SELECT pg_temp.approve_fixture(%L,%L,1000,995)',u1,atomic_job),'Estorno exige');
 PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.transactions WHERE import_id=atomic_job),'later failure rolls back earlier inserted row');
 PERFORM pg_temp.assert_true((SELECT bool_and(review_state='pending') FROM public.import_rows WHERE import_id=atomic_job),'rollback preserves every staged row');
 PERFORM pg_temp.expect_failure(format('SELECT public.update_import_row(%L,%L,%L)',u2,row_id,'{"distinct_confirmed":true}'),'Linha indisponível');
 INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES(w1,u2,'viewer');
 PERFORM pg_temp.expect_failure(format('SELECT pg_temp.approve_fixture(%L,%L,1000,995)',u2,atomic_job),'Importação indisponível');
 DELETE FROM public.workspace_members WHERE workspace_id=w1 AND user_id=u2;
 UPDATE public.imports SET status='cancelled' WHERE id=atomic_job;
 SELECT to_jsonb(public.retry_import_job(u1,atomic_job,'{}')) INTO result;
 PERFORM pg_temp.assert_true(result->>'status'='needs_review' AND (SELECT count(*)=2 FROM public.import_rows WHERE import_id=atomic_job),'cancelled staged batch resumes existing review without re-extracting');
 UPDATE public.imports SET status='cancelled' WHERE id=atomic_job;

 INSERT INTO public.transactions(id,user_id,workspace_id,account_id,description,amount,type,economic_kind,date,is_reconciled)
 VALUES(ref,u1,w1,a2,'Pix PicPay to Inter',500,'income','standard','2026-01-10',true);
 transfer_job:=pg_temp.stage_fixture(u1,a1,'transfer','[{"date":"2026-01-10","description":"Pix para Inter","amount_cents":"-50000"}]');
 SELECT id INTO row_id FROM public.import_rows WHERE import_id=transfer_job;
 PERFORM public.update_import_row(u1,row_id,jsonb_build_object('economic_kind','transfer','linked_transaction_id',ref));
 result:=pg_temp.approve_fixture(u1,transfer_job,1000,500);
 SELECT transaction_id INTO posted FROM public.import_rows WHERE id=row_id;
 PERFORM pg_temp.assert_true((SELECT count(*)=2 AND count(DISTINCT transfer_group_id)=1 AND bool_and(transfer_group_id IS NOT NULL) AND sum(amount)=0 FROM public.transactions WHERE id IN(ref,posted)),'imported transfer has atomic group with zero net effect');
 PERFORM pg_temp.assert_true((SELECT linked_transaction_id=ref FROM public.transactions WHERE id=posted) AND (SELECT linked_transaction_id=posted FROM public.transactions WHERE id=ref),'both transfer legs point to each other');
 PERFORM pg_temp.expect_failure(format('SELECT public.reverse_import_job(%L,%L,%L)',u1,transfer_job,'Synthetic reversal'),'Desfaça vínculos');

 job2:=pg_temp.stage_fixture(u2,foreign_account,'foreign-transfer','[{"date":"2026-01-10","description":"Invalid foreign transfer","amount_cents":"50000"}]');
 SELECT id INTO row_id FROM public.import_rows WHERE import_id=job2;
 PERFORM public.update_import_row(u2,row_id,jsonb_build_object('economic_kind','transfer','linked_transaction_id',posted));
 PERFORM pg_temp.expect_failure(format('SELECT pg_temp.approve_fixture(%L,%L,0,500)',u2,job2),'Movimentação interna exige');
 PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.transactions WHERE import_id=job2),'cross-workspace counterpart cannot publish');
 UPDATE public.imports SET status='cancelled' WHERE id=job2;

 PERFORM public.void_transaction(u1,posted);
 result:=public.reverse_import_job(u1,transfer_job,'Pair already voided as correction');
 PERFORM pg_temp.assert_true(result->>'status'='reversed' AND (SELECT bool_and(ledger_status='voided') FROM public.transactions WHERE id IN(ref,posted)),'voided pair permits batch reversal without leaving one live leg');

 result:=public.reverse_import_job(u1,job,'Fixture correction');
 PERFORM pg_temp.assert_true(result->>'voided'='2' AND (SELECT bool_and(ledger_status='voided') FROM public.transactions WHERE import_id=job),'reversal retains original rows and voids their effect');
 result:=public.reverse_import_job(u1,job,'Fixture correction');
 PERFORM pg_temp.assert_true((result->>'idempotent')::boolean,'reversal is idempotent');

 -- Complete staging is one transaction, even if a later row fails a constraint.
 queue1:=gen_random_uuid(); lease:=gen_random_uuid();
 PERFORM public.reserve_import_job(u1,queue1,a1,repeat('e',64),'broken.csv','csv',100,'{}');
 UPDATE public.imports SET status='processing',lease_token=lease,lease_until=now()+interval '90 seconds',attempts=1 WHERE id=queue1;
 PERFORM pg_temp.expect_failure(format('SELECT public.stage_import_rows(%L,%L,%L,%L)',queue1,lease,
 '[{"row_number":1,"date":"2026-01-20","description":"Valid","amount_cents":"100","source_identity":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","content_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","source":{}},{"row_number":2,"date":"2026-01-20","description":"Invalid zero","amount_cents":"0","source_identity":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","content_fingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","source":{}}]',
 '{"document_hash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","row_count":2,"sum_cents":"100"}'),'check constraint');
 PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.import_rows WHERE import_id=queue1),'partial staging rolled back');
 PERFORM public.fail_import_job(queue1,lease,'INVALID_FIXTURE','Synthetic invalid input',false);

 -- An interrupted upload can reuse its reserved identity and storage path safely.
 queue2:=gen_random_uuid();
 PERFORM public.reserve_import_job(u1,queue2,a1,repeat('f',64),'interrupted.csv','csv',100,'{}');
 UPDATE public.imports SET status='failed',last_error_code='UPLOAD_INTERRUPTED' WHERE id=queue2;
 result:=public.reserve_import_job(u1,gen_random_uuid(),a1,repeat('f',64),'interrupted.csv','csv',100,'{}');
 PERFORM pg_temp.assert_true((result->>'id')::uuid=queue2 AND (result->>'reupload')::boolean AND NOT(result->>'existing')::boolean,'same document resumes interrupted upload instead of dead-ending on dedupe');
 result:=public.reserve_import_job(u1,gen_random_uuid(),a1,repeat('f',64),'interrupted.csv','csv',100,'{}');
 PERFORM pg_temp.assert_true((result->>'existing')::boolean,'concurrent second upload cannot obtain the same reservation');
 UPDATE public.imports SET status='cancelled' WHERE id=queue2;

 queue1:=gen_random_uuid(); queue2:=gen_random_uuid(); queue3:=gen_random_uuid();
 PERFORM public.reserve_import_job(u1,queue1,a1,repeat('1',64),'lease1.csv','csv',100,'{}');
 PERFORM public.reserve_import_job(u1,queue2,a1,repeat('2',64),'lease2.csv','csv',100,'{}');
 PERFORM public.reserve_import_job(u2,queue3,foreign_account,repeat('3',64),'lease3.csv','csv',100,'{}');
 PERFORM public.enqueue_import_job(u1,queue1); PERFORM public.enqueue_import_job(u1,queue2); PERFORM public.enqueue_import_job(u2,queue3);
 UPDATE public.imports SET created_at=now()-interval '3 minutes' WHERE id=queue1;
 UPDATE public.imports SET created_at=now()-interval '2 minutes' WHERE id=queue2;
 UPDATE public.imports SET created_at=now()-interval '1 minute' WHERE id=queue3;
 SELECT * INTO claimed FROM public.claim_import_job(); first_lease:=claimed.lease_token;
 PERFORM pg_temp.assert_true(claimed.id=queue1 AND claimed.attempts=1,'oldest queued job acquires durable lease');
 SELECT * INTO claimed FROM public.claim_import_job();
 PERFORM pg_temp.assert_true(claimed.id=queue3,'only one active job per user');
 PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.claim_import_job()),'global processing cap is two');
 UPDATE public.imports SET lease_until=now()-interval '1 second' WHERE id=queue1;
 SELECT * INTO claimed FROM public.claim_import_job();
 PERFORM pg_temp.assert_true(claimed.id=queue1 AND claimed.attempts=2 AND claimed.lease_token<>first_lease,'expired job resumes with new exclusive lease');
 PERFORM pg_temp.assert_true(NOT public.heartbeat_import_job(queue1,first_lease),'old worker cannot renew replaced lease');
 PERFORM pg_temp.assert_true(NOT public.fail_import_job(queue1,first_lease,'STALE','Old process',true),'stale worker cannot overwrite replacement');
 PERFORM pg_temp.expect_failure(format('SELECT public.stage_import_rows(%L,%L,%L,%L)',queue1,first_lease,'[]','{}'),'Lease expirado');
 UPDATE public.imports SET lease_until=now()-interval '1 second',attempts=3 WHERE id=queue1;
 SELECT * INTO claimed FROM public.claim_import_job();
 PERFORM pg_temp.assert_true((SELECT status='failed' AND last_error_code='ATTEMPTS_EXHAUSTED' FROM public.imports WHERE id=queue1),'three interrupted attempts become explicit failure');
 PERFORM pg_temp.assert_true(claimed.id=queue2,'queue continues after exhausted job');
 PERFORM pg_temp.expect_failure(format('SELECT public.retry_import_job(%L,%L,%L)',u1,queue1,'{}'),'Três tentativas');
 RAISE NOTICE 'PASS: staging, balances, approval retry, exact and possible duplicates, atomic rollback, workspace isolation, paired transfer, reversal, leases and queue quotas';
END $$;
ROLLBACK;
