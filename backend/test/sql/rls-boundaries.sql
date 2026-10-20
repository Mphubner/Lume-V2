\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_rls(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'RLS failed: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.deny_rls(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE denied boolean:=false;BEGIN
 BEGIN EXECUTE statement;EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Expected insufficient privilege';END IF;
END $$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('20000000-0000-4000-8000-000000000001','rls-a@fixture.invalid',now()),
 ('20000000-0000-4000-8000-000000000002','rls-b@fixture.invalid',now());
INSERT INTO public.accounts(user_id,workspace_id,name,type,balance,balance_date)
 SELECT owner_id,id,CASE WHEN owner_id='20000000-0000-4000-8000-000000000001' THEN 'RLS own' ELSE 'RLS foreign' END,'wallet',0,'2025-12-31'
 FROM public.workspaces WHERE kind='personal' AND owner_id IN('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
INSERT INTO public.categories(user_id,workspace_id,name,type,is_system)
 SELECT owner_id,id,'Private category','expense',false FROM public.workspaces WHERE kind='personal' AND owner_id IN('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
SET LOCAL request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
INSERT INTO storage.objects(bucket_id,name) VALUES('financial-imports','private-statement.pdf'),('unrelated','other-app-object');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_rls((SELECT count(*)=1 FROM public.accounts),'only own workspace account visible');
SELECT pg_temp.assert_rls((SELECT name='RLS own' FROM public.accounts LIMIT 1),'foreign account label hidden');
SELECT pg_temp.assert_rls((SELECT count(*)=1 FROM public.categories WHERE user_id IS NOT NULL),'private category isolated');
SELECT pg_temp.assert_rls((SELECT count(*)=1 FROM public.profiles),'profile policy has no recursive admin lookup');
SELECT pg_temp.deny_rls('UPDATE public.profiles SET role=''admin''');
SELECT pg_temp.deny_rls('UPDATE public.plans SET price=0');
SELECT pg_temp.deny_rls('INSERT INTO public.audit_log(action) VALUES(''forged'')');
SELECT pg_temp.deny_rls('SELECT public.mutate_financial_record(''20000000-0000-4000-8000-000000000002'',''accounts'',''insert'',NULL,NULL,''{}'')');
SELECT pg_temp.assert_rls((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='financial-imports'),'statement sources protected despite legacy permissive policy');
SELECT pg_temp.assert_rls((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='unrelated'),'unrelated bucket access preserved');
RESET ROLE;
SELECT 10 AS passed_rls_assertions;
ROLLBACK;
