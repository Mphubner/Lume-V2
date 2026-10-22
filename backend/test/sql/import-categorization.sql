-- Synthetic fixtures only; the complete transaction is discarded after assertions.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_category(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'Categorization failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject_category(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text; denied boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN denied:=true; GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; END;
 IF NOT denied OR position(expected IN message)=0 THEN RAISE EXCEPTION 'Expected rejection %, received %',expected,coalesce(message,'success'); END IF;
END $$;
CREATE FUNCTION pg_temp.category_fixture(actor uuid,account uuid,seed text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE job uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); hash text:=encode(digest(seed,'sha256'),'hex');
BEGIN
 PERFORM public.reserve_import_job(actor,job,account,hash,seed||'.csv','csv',100,'{}');
 UPDATE public.imports SET status='processing',lease_token=lease,lease_until=now()+interval '90 seconds',attempts=1 WHERE id=job;
 PERFORM public.stage_import_rows(job,lease,jsonb_build_array(
  jsonb_build_object('row_number',1,'date','2026-01-02','description','Synthetic grocery','amount_cents','-2500','source_identity',repeat('a',64),'content_fingerprint',repeat('b',64),'source',jsonb_build_object('line',1)),
  jsonb_build_object('row_number',2,'date','2026-01-03','description','Synthetic income','amount_cents','5000','source_identity',repeat('c',64),'content_fingerprint',repeat('d',64),'source',jsonb_build_object('line',2))),
  jsonb_build_object('document_hash',hash,'row_count',2,'sum_cents','2500'));
 RETURN job;
END $$;
DO $$
DECLARE
 owner uuid:=gen_random_uuid(); foreign_user uuid:=gen_random_uuid(); viewer uuid:=gen_random_uuid(); editor uuid:=gen_random_uuid();
 own_workspace uuid; foreign_workspace uuid; own_account uuid:=gen_random_uuid(); other_account uuid:=gen_random_uuid();
 expense uuid:=gen_random_uuid(); income uuid:=gen_random_uuid(); both_category uuid:=gen_random_uuid(); foreign_category uuid:=gen_random_uuid(); official uuid:=gen_random_uuid(); orphan_category uuid:=gen_random_uuid();
 job uuid; foreign_job uuid; same_workspace_job uuid; first_row uuid; second_row uuid; foreign_row uuid; other_batch_row uuid; result jsonb; before_rows jsonb; before_ledger integer; before_import jsonb;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(owner,owner||'@fixture.invalid',now()),(foreign_user,foreign_user||'@fixture.invalid',now()),(viewer,viewer||'@fixture.invalid',now()),(editor,editor||'@fixture.invalid',now());
 SELECT id INTO own_workspace FROM public.workspaces WHERE owner_id=owner AND kind='personal';
 SELECT id INTO foreign_workspace FROM public.workspaces WHERE owner_id=foreign_user AND kind='personal';
 INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES(own_workspace,viewer,'viewer'),(own_workspace,editor,'editor');
 INSERT INTO public.accounts(id,user_id,workspace_id,name,type,balance,balance_date) VALUES
  (own_account,owner,own_workspace,'Category fixture own','wallet',100,'2025-12-31'),(other_account,foreign_user,foreign_workspace,'Category fixture other','wallet',0,'2025-12-31');
 INSERT INTO public.categories(id,user_id,workspace_id,name,type,subcategories,is_system) VALUES
  (expense,owner,own_workspace,'Fixture expenses','expense',ARRAY['Groceries'],false),
  (income,owner,own_workspace,'Fixture income','income',ARRAY['Salary'],false),
  (both_category,owner,own_workspace,'Fixture both','both','{}',false),
  (foreign_category,foreign_user,foreign_workspace,'Foreign category','expense','{}',false),
  (official,NULL,NULL,'Fixture official expense','expense',ARRAY['Official subcategory'],true),
  (orphan_category,NULL,NULL,'Fixture orphan expense','expense','{}',false);
 job:=pg_temp.category_fixture(owner,own_account,'categories-own');
 foreign_job:=pg_temp.category_fixture(foreign_user,other_account,'categories-foreign');
 same_workspace_job:=pg_temp.category_fixture(owner,own_account,'categories-other-batch');
 SELECT id INTO first_row FROM public.import_rows WHERE import_id=job AND row_number=1;
 SELECT id INTO second_row FROM public.import_rows WHERE import_id=job AND row_number=2;
 SELECT id INTO foreign_row FROM public.import_rows WHERE import_id=foreign_job AND row_number=1;
 SELECT id INTO other_batch_row FROM public.import_rows WHERE import_id=same_workspace_job AND row_number=1;
 SELECT count(*) INTO before_ledger FROM public.transactions;
 SELECT to_jsonb(i) INTO before_import FROM public.imports i WHERE id=job;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) INTO before_rows FROM public.import_rows r WHERE import_id=job;
 PERFORM pg_temp.assert_category(has_function_privilege('service_role','public.apply_import_category_suggestions(uuid,uuid,jsonb)','EXECUTE'),'service role may call backend RPC');
 PERFORM pg_temp.assert_category(NOT has_function_privilege('anon','public.apply_import_category_suggestions(uuid,uuid,jsonb)','EXECUTE') AND NOT has_function_privilege('authenticated','public.apply_import_category_suggestions(uuid,uuid,jsonb)','EXECUTE'),'browser roles cannot impersonate an actor');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',foreign_user,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense))),'Importação indisponível');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',viewer,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense))),'Importação indisponível');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense),jsonb_build_object('id',foreign_row,'category_id',expense))),'Linha fora da importação');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense),jsonb_build_object('id',other_batch_row,'category_id',expense))),'Linha fora da importação');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense),jsonb_build_object('id',second_row,'category_id',expense))),'Categoria incompatível');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',foreign_category))),'Categoria indisponível');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',orphan_category))),'Categoria indisponível');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense,'subcategory','Not a configured subcategory'))),'Subcategoria indisponível');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense),jsonb_build_object('id',first_row,'category_id',expense))),'repetidas');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,'[]'),'entre 1 e 500');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,(SELECT jsonb_agg(jsonb_build_object('id',first_row,'category_id',expense)) FROM generate_series(1,501))),'entre 1 e 500');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,'[{"id":123,"category_id":"invalid"}]'),'Sugestão inválida');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense,'learn_rule',true))),'Sugestão inválida');
 PERFORM pg_temp.assert_category((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)=before_rows FROM public.import_rows r WHERE import_id=job),'all failed suggestions preserve the complete staged rows');
 PERFORM public.update_import_row(owner,first_row,'{"economic_kind":"transfer"}');
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense))),'receita ou despesa padrão');
 PERFORM public.update_import_row(owner,first_row,'{"economic_kind":"standard","learn_rule":true}');
 result:=public.apply_import_category_suggestions(editor,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',official,'subcategory','Official subcategory'),jsonb_build_object('id',second_row,'category_id',income,'subcategory','Salary')));
 PERFORM pg_temp.assert_category(result->>'categorized'='2' AND result->>'skipped'='0' AND (result->>'review_required')::boolean,'editor may apply official and same-workspace suggestions');
 PERFORM pg_temp.assert_category((SELECT category_id=official AND subcategory='Official subcategory' AND learn_rule AND economic_kind='standard' AND review_state='pending' AND amount_cents=-2500 AND source='{"line":1}'::jsonb FROM public.import_rows WHERE id=first_row),'only category fields change, source/nature/learning remain intact');
 result:=public.apply_import_category_suggestions(owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense,'subcategory','Groceries')));
 PERFORM pg_temp.assert_category(result->>'categorized'='0' AND result->>'skipped'='1' AND (SELECT category_id=official AND subcategory='Official subcategory' FROM public.import_rows WHERE id=first_row),'a newer manual choice is never overwritten');
 PERFORM public.update_import_row(owner,second_row,'{"category_id":null,"subcategory":null}');
 result:=public.apply_import_category_suggestions(owner,job,jsonb_build_array(jsonb_build_object('id',second_row,'category_id',both_category)));
 PERFORM pg_temp.assert_category(result->>'categorized'='1' AND (SELECT category_id=both_category AND subcategory IS NULL FROM public.import_rows WHERE id=second_row),'both category and absent optional subcategory are valid');
 PERFORM pg_temp.assert_category((SELECT count(*)=before_ledger FROM public.transactions) AND NOT EXISTS(SELECT 1 FROM public.ai_rules WHERE workspace_id=own_workspace),'suggestions neither post ledger nor teach unapproved rules');
 PERFORM pg_temp.assert_category((SELECT to_jsonb(i)=before_import FROM public.imports i WHERE id=job),'suggestions never change import counts or approval state');
 UPDATE public.imports SET status='cancelled' WHERE id=job;
 PERFORM pg_temp.reject_category(format('SELECT public.apply_import_category_suggestions(%L,%L,%L)',owner,job,jsonb_build_array(jsonb_build_object('id',first_row,'category_id',expense))),'Importação indisponível');
END $$;
SELECT 'passed' AS category_suggestion_regressions;
ROLLBACK;
