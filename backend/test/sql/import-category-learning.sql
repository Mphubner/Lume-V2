-- Synthetic fixtures only. Learning and ledger writes must share rollback/idempotence.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_learning(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'Category learning failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject_learning(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text; denied boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN denied:=true; GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; END;
 IF NOT denied OR position(expected IN message)=0 THEN RAISE EXCEPTION 'Expected rejection %, received %',expected,coalesce(message,'success'); END IF;
END $$;
CREATE FUNCTION pg_temp.learning_fixture(actor uuid,account uuid,seed text,rows jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE job uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); hash text:=encode(public.lume_sha256(seed),'hex'); staged jsonb;
BEGIN
 PERFORM public.reserve_import_job(actor,job,account,hash,seed||'.csv','csv',100,'{}');
 UPDATE public.imports SET status='processing',lease_token=lease,lease_until=now()+interval '90 seconds',attempts=1 WHERE id=job;
 SELECT jsonb_agg(value||jsonb_build_object('row_number',ordinality,'source_identity',encode(public.lume_sha256(hash||':'||ordinality),'hex'),
  'content_fingerprint',encode(public.lume_sha256(value->>'date'||':'||(value->>'amount_cents')||':'||(value->>'description')),'hex'),'source',jsonb_build_object('line',ordinality))) INTO staged
 FROM jsonb_array_elements(rows) WITH ORDINALITY;
 PERFORM public.stage_import_rows(job,lease,staged,jsonb_build_object('document_hash',hash,'row_count',jsonb_array_length(rows),'sum_cents',(SELECT sum((value->>'amount_cents')::numeric)::text FROM jsonb_array_elements(rows))));
 RETURN job;
END $$;
CREATE FUNCTION pg_temp.approve_learning(actor uuid,job uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.approve_import_rows(actor,job,(SELECT array_agg(id ORDER BY row_number) FROM public.import_rows WHERE import_id=job),
  jsonb_build_object('source_confirmed',true,'opening_balance','100.00','closing_balance',(100+(SELECT sum(amount) FROM public.import_rows WHERE import_id=job))::text,'period_start','2026-01-01','period_end','2026-01-31'))
$$;
DO $$
DECLARE
 actor uuid:=gen_random_uuid(); personal uuid; business uuid; account uuid:=gen_random_uuid(); business_account uuid:=gen_random_uuid(); counterpart_account uuid:=gen_random_uuid();
 expense uuid:=gen_random_uuid(); alternative_expense uuid:=gen_random_uuid(); income uuid:=gen_random_uuid(); both_category uuid:=gen_random_uuid(); unrestricted uuid:=gen_random_uuid();
 job uuid; first_row uuid; second_row uuid; reference uuid; result jsonb; legacy_before jsonb; income_before jsonb; rules_before jsonb; total_before integer; learning_kind text;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(actor,actor||'@fixture.invalid',now());
 SELECT id INTO personal FROM public.workspaces WHERE owner_id=actor AND kind='personal';
 SELECT id INTO business FROM public.workspaces WHERE owner_id=actor AND kind='business';
 INSERT INTO public.accounts(id,user_id,workspace_id,name,type,balance,balance_date) VALUES
  (account,actor,personal,'Learning personal','wallet',100,'2025-12-31'),
  (business_account,actor,business,'Learning business','checking',100,'2025-12-31'),
  (counterpart_account,actor,personal,'Learning counterpart','credit_card',0,'2025-12-31');
 INSERT INTO public.categories(id,user_id,workspace_id,name,type,subcategories,is_system) VALUES
  (expense,NULL,NULL,'Learning expense','expense',ARRAY['Original'],true),
  (alternative_expense,NULL,NULL,'Learning alternate expense','expense',ARRAY['Correction'],true),
  (income,NULL,NULL,'Learning income','income',ARRAY['Income'],true),
  (both_category,NULL,NULL,'Learning both','both','{}',true);
 INSERT INTO public.ai_rules(id,user_id,workspace_id,keyword,category_id,transaction_type,is_active,usage_count)
  VALUES(unrestricted,actor,personal,'recorrente identidade',both_category,NULL,false,7);
 SELECT to_jsonb(r) INTO legacy_before FROM public.ai_rules r WHERE id=unrestricted;
 PERFORM pg_temp.assert_learning(NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_rules'::regclass AND conname='ai_rules_user_keyword_unique'),'only the known legacy global key has been replaced');
 PERFORM pg_temp.assert_learning(has_function_privilege('service_role','public.approve_import_rows(uuid,uuid,uuid[],jsonb)','EXECUTE') AND NOT has_function_privilege('authenticated','public.approve_import_rows(uuid,uuid,uuid[],jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.approve_import_rows(uuid,uuid,uuid[],jsonb)','EXECUTE'),'approval remains service-only');

 job:=pg_temp.learning_fixture(actor,account,'learning-directions','[{"date":"2026-01-02","description":"Recorrente Identidade","amount_cents":"-1000"},{"date":"2026-01-03","description":"Recorrente Identidade","amount_cents":"2000"}]');
 SELECT id INTO first_row FROM public.import_rows WHERE import_id=job AND row_number=1;
 SELECT id INTO second_row FROM public.import_rows WHERE import_id=job AND row_number=2;
 PERFORM public.update_import_row(actor,first_row,jsonb_build_object('category_id',expense,'subcategory','Original','learn_rule',true));
 PERFORM public.update_import_row(actor,second_row,jsonb_build_object('category_id',income,'subcategory','Income','learn_rule',true));
 PERFORM pg_temp.assert_learning((SELECT count(*)=1 FROM public.ai_rules WHERE user_id=actor),'editing staging alone never creates a rule');
 result:=pg_temp.approve_learning(actor,job);
 PERFORM pg_temp.assert_learning(result->>'imported'='2' AND (SELECT count(*)=2 FROM public.ai_rules WHERE user_id=actor AND workspace_id=personal AND keyword='recorrente identidade' AND transaction_type IN ('income','expense')),'same description learns two separate directions');
 PERFORM pg_temp.assert_learning((SELECT category_id=expense AND subcategory='Original' AND transaction_type='expense' FROM public.ai_rules WHERE user_id=actor AND workspace_id=personal AND keyword='recorrente identidade' AND transaction_type='expense') AND (SELECT category_id=income AND transaction_type='income' FROM public.ai_rules WHERE user_id=actor AND workspace_id=personal AND keyword='recorrente identidade' AND transaction_type='income'),'direction is derived from signed cents');
 PERFORM pg_temp.assert_learning((SELECT to_jsonb(r)=legacy_before FROM public.ai_rules r WHERE id=unrestricted),'legacy unrestricted rule is never overwritten or rebound');
 SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) INTO rules_before FROM public.ai_rules r WHERE user_id=actor;
 result:=pg_temp.approve_learning(actor,job);
 PERFORM pg_temp.assert_learning((result->>'idempotent')::boolean AND (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)=rules_before FROM public.ai_rules r WHERE user_id=actor),'approval retry never increments learning twice');

 SELECT to_jsonb(r) INTO income_before FROM public.ai_rules r WHERE user_id=actor AND workspace_id=personal AND keyword='recorrente identidade' AND transaction_type='income';
 UPDATE public.ai_rules SET is_active=false WHERE user_id=actor AND workspace_id=personal AND keyword='recorrente identidade' AND transaction_type='expense';
 job:=pg_temp.learning_fixture(actor,account,'learning-correction','[{"date":"2026-01-04","description":"Recorrente Identidade","amount_cents":"-1100"}]');
 SELECT id INTO first_row FROM public.import_rows WHERE import_id=job;
 PERFORM public.update_import_row(actor,first_row,jsonb_build_object('category_id',alternative_expense,'subcategory','Correction','learn_rule',true));
 PERFORM pg_temp.approve_learning(actor,job);
 PERFORM pg_temp.assert_learning((SELECT count(*)=1 AND bool_and(category_id=alternative_expense AND subcategory='Correction' AND is_active AND usage_count=2) FROM public.ai_rules WHERE user_id=actor AND workspace_id=personal AND keyword='recorrente identidade' AND transaction_type='expense'),'correction updates the matching direction only');
 PERFORM pg_temp.assert_learning((SELECT to_jsonb(r)=income_before FROM public.ai_rules r WHERE user_id=actor AND workspace_id=personal AND keyword='recorrente identidade' AND transaction_type='income'),'opposite direction stays unchanged');
 job:=pg_temp.learning_fixture(actor,business_account,'learning-other-workspace','[{"date":"2026-01-05","description":"Recorrente Identidade","amount_cents":"-1000"},{"date":"2026-01-06","description":"Recorrente Identidade","amount_cents":"2000"}]');
 FOR first_row IN SELECT id FROM public.import_rows WHERE import_id=job LOOP
  PERFORM public.update_import_row(actor,first_row,jsonb_build_object('category_id',both_category,'learn_rule',true));
 END LOOP;
 PERFORM pg_temp.approve_learning(actor,job);
 PERFORM pg_temp.assert_learning((SELECT count(*)=2 FROM public.ai_rules WHERE user_id=actor AND workspace_id=business AND keyword='recorrente identidade') AND (SELECT count(*)=3 FROM public.ai_rules WHERE user_id=actor AND workspace_id=personal AND keyword='recorrente identidade'),'one actor can learn the same description independently in two workspaces');

 job:=pg_temp.learning_fixture(actor,account,'learning-opt-out','[{"date":"2026-01-07","description":"Sem Aprendizado","amount_cents":"-3300"}]');
 SELECT id INTO first_row FROM public.import_rows WHERE import_id=job;
 PERFORM public.update_import_row(actor,first_row,jsonb_build_object('category_id',expense,'learn_rule',false));
 PERFORM pg_temp.approve_learning(actor,job);
 PERFORM pg_temp.assert_learning(NOT EXISTS(SELECT 1 FROM public.ai_rules WHERE user_id=actor AND keyword='sem aprendizado'),'approval without explicit learning opt-in never teaches');
 job:=pg_temp.learning_fixture(actor,account,'learning-invalid-category','[{"date":"2026-01-08","description":"Categoria Direcao Errada","amount_cents":"3300"},{"date":"2026-01-09","description":"Subcategoria Fora Catalogo","amount_cents":"-100"}]');
 SELECT id INTO first_row FROM public.import_rows WHERE import_id=job AND row_number=1;
 SELECT id INTO second_row FROM public.import_rows WHERE import_id=job AND row_number=2;
 PERFORM public.update_import_row(actor,first_row,jsonb_build_object('category_id',expense,'learn_rule',true));
 PERFORM public.update_import_row(actor,second_row,jsonb_build_object('category_id',expense,'subcategory','Not configured','learn_rule',true));
 PERFORM pg_temp.approve_learning(actor,job);
 PERFORM pg_temp.assert_learning(NOT EXISTS(SELECT 1 FROM public.ai_rules WHERE user_id=actor AND keyword IN ('categoria direcao errada','subcategoria fora catalogo')),'invalid direction or subcategory never becomes training evidence');

 FOREACH learning_kind IN ARRAY ARRAY['investment_principal','loan_principal','owner_contribution','owner_withdrawal'] LOOP
  job:=pg_temp.learning_fixture(actor,account,'learning-special-'||learning_kind,jsonb_build_array(jsonb_build_object('date','2026-01-10','description','Special '||learning_kind,'amount_cents','1000')));
  SELECT id INTO first_row FROM public.import_rows WHERE import_id=job;
  PERFORM public.update_import_row(actor,first_row,jsonb_build_object('category_id',both_category,'economic_kind',learning_kind,'learn_rule',true));
  PERFORM pg_temp.approve_learning(actor,job);
 END LOOP;
 FOREACH learning_kind IN ARRAY ARRAY['transfer','card_payment'] LOOP
  reference:=gen_random_uuid();
  INSERT INTO public.transactions(id,user_id,workspace_id,account_id,description,amount,type,economic_kind,date,is_reconciled,is_confirmed)
   VALUES(reference,actor,personal,counterpart_account,'Special counterpart '||learning_kind,50,'income','standard','2026-01-11',true,true);
  job:=pg_temp.learning_fixture(actor,account,'learning-special-'||learning_kind,jsonb_build_array(jsonb_build_object('date','2026-01-11','description','Special '||learning_kind,'amount_cents','-5000')));
  SELECT id INTO first_row FROM public.import_rows WHERE import_id=job;
  PERFORM public.update_import_row(actor,first_row,jsonb_build_object('category_id',both_category,'economic_kind',learning_kind,'linked_transaction_id',reference,'learn_rule',true));
  PERFORM pg_temp.approve_learning(actor,job);
 END LOOP;
 reference:=gen_random_uuid();
 INSERT INTO public.transactions(id,user_id,workspace_id,account_id,description,amount,type,economic_kind,date,is_reconciled,is_confirmed)
  VALUES(reference,actor,personal,account,'Original synthetic expense',-25,'expense','standard','2026-01-01',true,true);
 job:=pg_temp.learning_fixture(actor,account,'learning-special-refund','[{"date":"2026-01-12","description":"Special refund","amount_cents":"1000"}]');
 SELECT id INTO first_row FROM public.import_rows WHERE import_id=job;
 PERFORM public.update_import_row(actor,first_row,jsonb_build_object('category_id',both_category,'economic_kind','refund','reversal_of',reference,'learn_rule',true));
 PERFORM pg_temp.approve_learning(actor,job);
 PERFORM pg_temp.assert_learning(NOT EXISTS(SELECT 1 FROM public.ai_rules WHERE user_id=actor AND keyword LIKE 'special %'),'all seven special economic kinds ignore stale learning flags');

 job:=pg_temp.learning_fixture(actor,account,'learning-inconsistent-links','[{"date":"2026-01-13","description":"Standard With Link","amount_cents":"-1000"}]');
 SELECT id INTO first_row FROM public.import_rows WHERE import_id=job;
 PERFORM public.update_import_row(actor,first_row,jsonb_build_object('category_id',expense,'linked_transaction_id',reference,'learn_rule',true));
 PERFORM pg_temp.reject_learning(format('SELECT pg_temp.approve_learning(%L,%L)',actor,job),'Contrapartida só se aplica');
 PERFORM public.update_import_row(actor,first_row,jsonb_build_object('linked_transaction_id',NULL,'reversal_of',reference));
 PERFORM pg_temp.reject_learning(format('SELECT pg_temp.approve_learning(%L,%L)',actor,job),'Referência de estorno só se aplica');
 PERFORM pg_temp.assert_learning(NOT EXISTS(SELECT 1 FROM public.ai_rules WHERE user_id=actor AND keyword='standard with link') AND NOT EXISTS(SELECT 1 FROM public.transactions WHERE import_id=job),'inconsistent references never create a rule or a ledger entry');
 job:=pg_temp.learning_fixture(actor,account,'learning-rollback','[{"date":"2026-01-27","description":"First Atomic Learning","amount_cents":"-100"},{"date":"2026-01-28","description":"Invalid Atomic Refund","amount_cents":"50"}]');
 SELECT id INTO first_row FROM public.import_rows WHERE import_id=job AND row_number=1;
 SELECT id INTO second_row FROM public.import_rows WHERE import_id=job AND row_number=2;
 PERFORM public.update_import_row(actor,first_row,jsonb_build_object('category_id',expense,'learn_rule',true));
 PERFORM public.update_import_row(actor,second_row,jsonb_build_object('category_id',both_category,'economic_kind','refund','learn_rule',true));
 SELECT count(*) INTO total_before FROM public.transactions;
 PERFORM pg_temp.reject_learning(format('SELECT pg_temp.approve_learning(%L,%L)',actor,job),'Estorno exige');
 PERFORM pg_temp.assert_learning((SELECT count(*)=total_before FROM public.transactions) AND NOT EXISTS(SELECT 1 FROM public.ai_rules WHERE user_id=actor AND keyword='first atomic learning') AND (SELECT status='needs_review' FROM public.imports WHERE id=job),'a later financial validation failure rolls back earlier learning and ledger writes together');
END $$;
SELECT 'passed' AS import_category_learning_regressions;
ROLLBACK;
