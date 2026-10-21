BEGIN;
-- Lock the membership for the duration of a write, including a concurrent revoke.
CREATE OR REPLACE FUNCTION public.actor_can_access_workspace(p_actor uuid,p_workspace uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r text; BEGIN
 SELECT role INTO r FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=p_actor FOR SHARE;
 RETURN r IS NOT NULL AND (NOT p_write OR r IN ('owner','editor'));
END $$;

CREATE FUNCTION public.mutate_financial_record(p_actor uuid,p_table text,p_operation text,p_id uuid,p_workspace uuid,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oldrow jsonb; result jsonb; cols text; vals text; pairs text; allowed text[]; ws uuid; fields jsonb; BEGIN
 IF p_table NOT IN ('accounts','transactions','categories','recurring_bills','debts','goals','budgets','ai_rules') OR p_operation NOT IN ('insert','update','delete','review') THEN RAISE EXCEPTION 'Operação indisponível'; END IF;
 IF p_operation='review' AND p_table<>'transactions' THEN RAISE EXCEPTION 'Revisão inválida'; END IF;
 IF p_operation<>'insert' THEN
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE id=$1 FOR UPDATE',p_table) INTO oldrow USING p_id;
  IF oldrow IS NULL THEN RAISE EXCEPTION 'Registro indisponível'; END IF;
  ws:=(oldrow->>'workspace_id')::uuid;
  IF ws IS DISTINCT FROM p_workspace THEN RAISE EXCEPTION 'Espaço imutável'; END IF;
 ELSE ws:=p_workspace; END IF;
 IF NOT public.actor_can_access_workspace(p_actor,ws,true) THEN RAISE EXCEPTION 'Acesso revogado ou somente leitura'; END IF;
 IF p_payload ?| ARRAY['id','user_id','workspace_id','is_system','is_reconciled','ledger_status','linked_transaction_id','transfer_group_id','source_key','external_id','import_id','legacy_needs_review','origin','created_at','updated_at','reviewed_at','reviewed_by','updated_by'] THEN RAISE EXCEPTION 'Campos protegidos'; END IF;
 allowed:=CASE p_table
  WHEN 'accounts' THEN ARRAY['name','type','institution','balance','balance_date','account_type','credit_limit','closing_day','due_day','color','icon','is_active']
  WHEN 'transactions' THEN ARRAY['description','amount','type','date','account_id','category_id','member_id','subcategory','notes','payment_method','economic_kind','reversal_of']
  WHEN 'categories' THEN ARRAY['name','type','icon','color','parent_id','nature','group_name','subcategories']
  WHEN 'recurring_bills' THEN ARRAY['name','amount','due_day','start_date','recurrence','type','status','category_id','is_auto_debit','description','adjust_to_business_day']
  WHEN 'debts' THEN ARRAY['name','type','creditor','original_amount','current_balance','start_date','interest_rate','total_installments','installment_amount','due_day','status','description']
  WHEN 'goals' THEN ARRAY['name','target_amount','current_amount','deadline','icon','color','status']
  WHEN 'budgets' THEN ARRAY['category_id','month','year','planned_amount']
  WHEN 'ai_rules' THEN ARRAY['keyword','category_id','transaction_type','subcategory','is_active'] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Campo não permitido'; END IF;
 IF p_operation='delete' THEN
  IF p_table IN ('transactions','accounts') THEN RAISE EXCEPTION 'Use anulação ou arquivamento'; END IF;
  IF p_table='categories' AND ((oldrow->>'is_system')::boolean OR EXISTS(SELECT 1 FROM public.transactions WHERE category_id=p_id)) THEN RAISE EXCEPTION 'Categoria em uso ou protegida'; END IF;
  EXECUTE format('DELETE FROM public.%I WHERE id=$1',p_table) USING p_id;
  result:=jsonb_build_object('id',p_id,'deleted',true);
 ELSE
  fields:=p_payload;
  IF p_table='categories' THEN
   IF coalesce((oldrow->>'is_system')::boolean,false) THEN RAISE EXCEPTION 'Categoria protegida'; END IF;
   IF p_payload->>'parent_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categories WHERE id=(p_payload->>'parent_id')::uuid AND (workspace_id=ws OR (is_system AND user_id IS NULL AND workspace_id IS NULL))) THEN RAISE EXCEPTION 'Grupo fora do espaço'; END IF;
  END IF;
  IF p_table='accounts' AND p_operation='update' AND ((fields ? 'balance')<>(fields ? 'balance_date')) THEN RAISE EXCEPTION 'Saldo e data-base juntos'; END IF;
  IF p_table='transactions' THEN
   IF p_operation='insert' THEN
    fields:=fields||jsonb_build_object('origin','manual','is_reconciled',true,'ledger_status','posted','reviewed_by',p_actor,'reviewed_at',now(),'account_type',(SELECT account_type FROM public.accounts WHERE id=(fields->>'account_id')::uuid));
   ELSE
    IF oldrow->>'ledger_status'<>'posted' THEN RAISE EXCEPTION 'Lançamento anulado'; END IF;
    IF oldrow->>'linked_transaction_id' IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_each(p_payload) e WHERE e.key IN ('amount','date','account_id','type','economic_kind','reversal_of') AND e.value IS DISTINCT FROM oldrow->e.key) THEN RAISE EXCEPTION 'Reverta o par antes de alterar'; END IF;
    IF EXISTS(SELECT 1 FROM public.transactions WHERE reversal_of=p_id AND ledger_status='posted') AND EXISTS(SELECT 1 FROM jsonb_each(p_payload) e WHERE e.key IN ('amount','date','account_id','type','economic_kind') AND e.value IS DISTINCT FROM oldrow->e.key) THEN RAISE EXCEPTION 'Reverta os estornos dependentes antes de alterar'; END IF;
    fields:=fields||jsonb_build_object('updated_by',p_actor);
   END IF;
   IF p_operation='review' THEN fields:=fields||jsonb_build_object('is_reconciled',true,'legacy_needs_review',false,'reviewed_by',p_actor,'reviewed_at',now()); END IF;
   IF coalesce(fields->>'economic_kind',oldrow->>'economic_kind','standard') IN ('transfer','card_payment','investment_principal') AND oldrow->>'linked_transaction_id' IS NULL THEN RAISE EXCEPTION 'Movimento interno exige contrapartida'; END IF;
  END IF;
  IF p_operation='insert' THEN
   fields:=fields||jsonb_build_object('user_id',p_actor,'workspace_id',ws);
   IF p_table='categories' THEN fields:=fields||jsonb_build_object('is_system',false); END IF;
   SELECT string_agg(format('%I',k),','),string_agg(format('x.%I',k),',') INTO cols,vals FROM jsonb_object_keys(fields) k;
   EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) x RETURNING to_jsonb(%I.*)',p_table,cols,vals,p_table,p_table) INTO result USING fields;
  ELSE
   IF fields='{}'::jsonb THEN RAISE EXCEPTION 'Informe os campos'; END IF;
   SELECT string_agg(format('%I=x.%I',k,k),',') INTO pairs FROM jsonb_object_keys(fields) k;
   EXECUTE format('UPDATE public.%I r SET %s FROM jsonb_populate_record(NULL::public.%I,$1) x WHERE r.id=$2 RETURNING to_jsonb(r)',p_table,pairs,p_table) INTO result USING fields,p_id;
  END IF;
 END IF;
 INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,details) VALUES(p_actor,p_operation,p_table,(result->>'id')::uuid,jsonb_build_object('workspace_id',ws,'before',oldrow,'after',result));
 RETURN result;
END $$;
CREATE FUNCTION public.grant_pilot_access(p_actor uuid,p_user_id uuid,p_plan text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.profiles; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Administrador necessário'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.plans WHERE id=p_plan AND is_active) THEN RAISE EXCEPTION 'Plano indisponível'; END IF;
 UPDATE public.profiles SET plan=p_plan,plan_status='granted',granted_by=p_actor,plan_started_at=now() WHERE id=p_user_id RETURNING * INTO r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;
 INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,details) VALUES(p_actor,'grant_pilot_access','profiles',p_user_id,jsonb_build_object('plan',p_plan));
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.create_due_notifications(p_user_id uuid,p_occurrences jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n jsonb; c integer:=0; BEGIN
 IF jsonb_array_length(p_occurrences)>5000 THEN RAISE EXCEPTION 'Muitas notificações'; END IF;
 FOR n IN SELECT * FROM jsonb_array_elements(p_occurrences) LOOP
  IF NOT public.actor_can_access_workspace(p_user_id,(n->>'workspace_id')::uuid) THEN RAISE EXCEPTION 'Acesso revogado'; END IF;
  INSERT INTO public.notifications(user_id,workspace_id,source_key,title,message) VALUES(p_user_id,(n->>'workspace_id')::uuid,n->>'source_key',n->>'title',n->>'message') ON CONFLICT(user_id,source_key) WHERE source_key IS NOT NULL DO NOTHING;
  IF FOUND THEN c:=c+1; END IF;
 END LOOP; RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.mutate_financial_record(uuid,text,text,uuid,uuid,jsonb),public.grant_pilot_access(uuid,uuid,text),public.create_due_notifications(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_financial_record(uuid,text,text,uuid,uuid,jsonb),public.grant_pilot_access(uuid,uuid,text),public.create_due_notifications(uuid,jsonb) TO service_role;
-- The legacy public analytics writer is not needed by the private validation flow.
REVOKE ALL ON public.page_views FROM anon,authenticated;
GRANT ALL ON public.page_views TO service_role;
CREATE FUNCTION public.application_readiness() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('schema_version','202610190006','workspaces',true,'staging',true,'financial_facts',true)
$$;
REVOKE ALL ON FUNCTION public.application_readiness() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.application_readiness() TO service_role;
CREATE FUNCTION public.unconfirm_recurring_occurrence(p_actor uuid,p_recurring uuid,p_due date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.recurring_bills; oldrow public.recurring_occurrences; BEGIN
 SELECT * INTO b FROM public.recurring_bills WHERE id=p_recurring FOR UPDATE;
 IF b.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,b.workspace_id,true) THEN RAISE EXCEPTION 'Unauthorized recurring bill'; END IF;
 SELECT * INTO oldrow FROM public.recurring_occurrences WHERE recurring_id=b.id AND due_date=p_due FOR UPDATE;
 IF oldrow.id IS NOT NULL THEN
  UPDATE public.recurring_occurrences SET paid_at=NULL,transaction_id=NULL,confirmed_by=NULL WHERE id=oldrow.id;
  INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,details) VALUES(p_actor,'recurring_payment_unlinked','recurring_occurrences',oldrow.id,to_jsonb(oldrow));
 END IF;
 RETURN jsonb_build_object('success',true,'transaction_preserved',true);
END $$;
REVOKE ALL ON FUNCTION public.unconfirm_recurring_occurrence(uuid,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.unconfirm_recurring_occurrence(uuid,uuid,date) TO service_role;
COMMIT;
