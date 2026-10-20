\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE assertions(label text PRIMARY KEY);
CREATE FUNCTION pg_temp.check_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF;INSERT INTO assertions VALUES(label);END $$;
CREATE FUNCTION pg_temp.reject(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE msg text; failed boolean:=false;BEGIN
 BEGIN EXECUTE statement;EXCEPTION WHEN OTHERS THEN failed:=true;GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;END;
 PERFORM pg_temp.check_true(failed AND position(expected IN coalesce(msg,''))>0,'rejected: '||expected);
END $$;
DO $$
DECLARE u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();ws uuid;otherws uuid;a uuid;b uuid;c uuid;card uuid;bill uuid;j jsonb;tx uuid;refund uuid;r jsonb;f jsonb;intent jsonb;key uuid:=gen_random_uuid();countbefore integer;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(u,u||'@fixture.invalid',now()),(v,v||'@fixture.invalid',now());
 SELECT id INTO ws FROM public.workspaces WHERE owner_id=u AND kind='personal';
 SELECT id INTO otherws FROM public.workspaces WHERE owner_id=v AND kind='personal';
 j:=public.mutate_financial_record(u,'accounts','insert',NULL,ws,'{"name":"PicPay","type":"wallet","balance":1000,"balance_date":"2025-12-31"}');a:=(j->>'id')::uuid;
 j:=public.mutate_financial_record(u,'accounts','insert',NULL,ws,'{"name":"Inter","type":"checking","balance":0,"balance_date":"2025-12-31"}');b:=(j->>'id')::uuid;
 j:=public.mutate_financial_record(u,'accounts','insert',NULL,ws,'{"name":"Mercado Livre","type":"checking","balance":0,"balance_date":"2025-12-31"}');c:=(j->>'id')::uuid;
 j:=public.mutate_financial_record(u,'accounts','insert',NULL,ws,'{"name":"Cartao","type":"credit_card","balance":0,"balance_date":"2025-12-31"}');card:=(j->>'id')::uuid;
 PERFORM public.create_transfer(u,a,b,500,'2026-01-02','Entre minhas contas',0);
 PERFORM public.create_transfer(u,b,c,300,'2026-01-03','Entre minhas contas',0);
 f:=public.financial_snapshot(u,ARRAY[ws],'2026-01-01','2026-01-31','2026-01-31');
 PERFORM pg_temp.check_true((f#>>'{stats,income}')::numeric=0 AND (f#>>'{stats,expenses}')::numeric=0,'500 and 300 transfers generate no income or expense');
 PERFORM pg_temp.check_true((f#>>'{stats,balance}')::numeric=1000,'transfers preserve consolidated balance');
 PERFORM pg_temp.check_true((SELECT (x->>'current')::numeric=500 FROM jsonb_array_elements(f->'accounts') x WHERE x->>'id'=a::text),'PicPay 500');
 PERFORM pg_temp.check_true((SELECT (x->>'current')::numeric=200 FROM jsonb_array_elements(f->'accounts') x WHERE x->>'id'=b::text),'Inter 200');
 PERFORM pg_temp.check_true((SELECT (x->>'current')::numeric=300 FROM jsonb_array_elements(f->'accounts') x WHERE x->>'id'=c::text),'Mercado Livre 300');
 PERFORM pg_temp.reject(format('SELECT public.mutate_financial_record(%L,%L,%L,null,%L,%L)',v,'accounts','insert',ws,'{"name":"Denied","type":"wallet","balance":0,"balance_date":"2025-12-31"}'),'Acesso revogado');
 PERFORM pg_temp.reject(format('SELECT public.mutate_financial_record(%L,%L,%L,%L,%L,%L)',u,'accounts','update',a,ws,'{"user_id":"00000000-0000-0000-0000-000000000001"}'),'Campos protegidos');
 PERFORM pg_temp.reject(format('SELECT public.mutate_financial_record(%L,%L,%L,%L,%L,%L)',u,'accounts','update',a,otherws,'{"name":"Hijack"}'),'Espaço imutável');
 INSERT INTO public.workspace_members VALUES(ws,v,'viewer',now());
 PERFORM pg_temp.reject(format('SELECT public.create_transfer(%L,%L,%L,1,%L,%L,0)',v,a,b,'2026-01-04','viewer'),'Transfer accounts');
 PERFORM public.change_workspace_member(u,ws,v,'editor');
 j:=public.mutate_financial_record(v,'transactions','insert',NULL,ws,jsonb_build_object('description','Pix cliente real','amount',70,'type','income','date','2026-01-04','account_id',a,'member_id',v));
 PERFORM pg_temp.check_true(j->>'user_id'=v::text,'authorized editor can write family finances');
 PERFORM public.change_workspace_member(u,ws,v,NULL);
 PERFORM pg_temp.reject(format('SELECT public.mutate_financial_record(%L,%L,%L,%L,%L,%L)',v,'transactions','update',j->>'id',ws,'{"description":"denied"}'),'Acesso revogado ou somente leitura');
 -- Original author leaving does not make shared data immutable to remaining owner.
 PERFORM public.mutate_financial_record(u,'transactions','update',(j->>'id')::uuid,ws,'{"description":"Pix cliente revisado"}');
 PERFORM pg_temp.check_true((SELECT member_id=v FROM public.transactions WHERE id=(j->>'id')::uuid),'revocation preserves historical attribution and owner can still edit');
 j:=public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Compra no cartão','amount',-100,'type','expense','date','2026-01-04','account_id',card));tx:=(j->>'id')::uuid;
 PERFORM public.create_transfer(u,a,card,100,'2026-01-05','Pagamento fatura',0);
 f:=public.financial_snapshot(u,ARRAY[ws],'2026-01-01','2026-01-31','2026-01-31');
 PERFORM pg_temp.check_true((f#>>'{stats,expenses}')::numeric=100,'card payment does not duplicate purchase expense');
 PERFORM pg_temp.check_true((f#>>'{stats,income}')::numeric=70,'external Pix remains income');
 j:=public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Estorno parcial','amount',20,'type','income','economic_kind','refund','reversal_of',tx,'date','2026-01-06','account_id',card));refund:=(j->>'id')::uuid;
 f:=public.financial_snapshot(u,ARRAY[ws],'2026-01-01','2026-01-31','2026-01-31');
 PERFORM pg_temp.check_true((f#>>'{stats,expenses}')::numeric=80 AND (f#>>'{stats,income}')::numeric=70,'refund reduces original expense, never salary');
 PERFORM pg_temp.reject(format('SELECT public.mutate_financial_record(%L,%L,%L,%L,%L,%L)',u,'transactions','update',tx,ws,'{"amount":-10}'),'Reverta os estornos');
 PERFORM pg_temp.reject(format('SELECT public.void_transaction(%L,%L)',u,tx),'Void refunds');
 PERFORM public.void_transaction(u,refund);
 PERFORM public.void_transaction(u,tx);
 PERFORM pg_temp.check_true((SELECT count(*)=2 FROM public.transactions WHERE id IN(tx,refund) AND ledger_status='voided'),'void preserves financial history');
 PERFORM pg_temp.reject(format('SELECT public.mutate_financial_record(%L,%L,%L,null,%L,%L)',u,'transactions','insert',ws,jsonb_build_object('description','Refund voided','amount',1,'type','income','economic_kind','refund','reversal_of',tx,'date','2026-01-07','account_id',card)),'Invalid reversal reference');
 j:=public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Purchase with refund','amount',-50,'type','expense','date','2026-01-08','account_id',a));tx:=(j->>'id')::uuid;
 PERFORM public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Partial refund','amount',10,'type','income','economic_kind','refund','reversal_of',tx,'date','2026-01-09','account_id',a));
 j:=public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Other credit','amount',50,'type','income','date','2026-01-08','account_id',b));
 PERFORM pg_temp.reject(format('SELECT public.link_transfer(%L,%L,%L)',u,tx,j->>'id'),'Pair has dependent refunds');
 PERFORM pg_temp.check_true((SELECT count(*)>=9 FROM public.audit_log WHERE user_id IN(u,v)),'financial writes audited atomically');
 j:=public.mutate_financial_record(u,'recurring_bills','insert',NULL,ws,'{"name":"Monthly bill","amount":50,"due_day":15,"start_date":"2026-01-01","recurrence":"monthly"}');bill:=(j->>'id')::uuid;
 j:=public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Bill payment','amount',-50,'type','expense','date','2026-01-15','account_id',a));tx:=(j->>'id')::uuid;
 PERFORM public.confirm_recurring_occurrence(u,bill,'2026-01-15',tx);
 PERFORM public.unconfirm_recurring_occurrence(u,bill,'2026-01-15');
 PERFORM pg_temp.check_true((SELECT transaction_id IS NULL AND paid_at IS NULL FROM public.recurring_occurrences WHERE recurring_id=bill) AND (SELECT ledger_status='posted' FROM public.transactions WHERE id=tx),'unlink occurrence preserves payment and makes occurrence pending');
 -- Ownership and RLS cannot be bypassed with direct browser DML or actor impersonation.
 PERFORM pg_temp.check_true(NOT has_table_privilege('authenticated','public.transactions','INSERT'),'authenticated cannot bypass mutation boundary');
 PERFORM pg_temp.check_true(NOT has_table_privilege('authenticated','public.profiles','UPDATE'),'authenticated cannot promote profile role');
 PERFORM pg_temp.check_true(NOT has_table_privilege('anon','public.plans','UPDATE'),'anonymous cannot edit prices');
 PERFORM pg_temp.check_true(NOT has_function_privilege('authenticated','public.mutate_financial_record(uuid,text,text,uuid,uuid,jsonb)','EXECUTE'),'authenticated cannot impersonate actor');
 -- An invitation never grants access before verified recipient acceptance.
 PERFORM public.create_workspace_invitation(u,ws,v||'@fixture.invalid','editor',repeat('a',64));
 PERFORM pg_temp.check_true(NOT public.actor_can_access_workspace(v,ws),'pending invitation grants no access');
 PERFORM pg_temp.reject(format('SELECT public.accept_workspace_invitation(%L,%L,%L)',u,u||'@fixture.invalid',repeat('a',64)),'Invitation invalid');
 UPDATE auth.users SET email_confirmed_at=NULL WHERE id=v;
 PERFORM pg_temp.reject(format('SELECT public.accept_workspace_invitation(%L,%L,%L)',v,v||'@fixture.invalid',repeat('a',64)),'Verified recipient');
 UPDATE auth.users SET email_confirmed_at=now() WHERE id=v;
 PERFORM public.accept_workspace_invitation(v,v||'@fixture.invalid',repeat('a',64));
 PERFORM pg_temp.check_true(public.actor_can_access_workspace(v,ws,true),'verified invite grants requested editor role');
 PERFORM pg_temp.reject(format('SELECT public.accept_workspace_invitation(%L,%L,%L)',v,v||'@fixture.invalid',repeat('a',64)),'Invitation invalid or expired');
 PERFORM public.change_workspace_member(u,ws,v,NULL);
 -- Onboarding retries create exactly one account and set the flag in the same commit.
 j:=public.complete_onboarding(v,otherws,'{"name":"Primeira","type":"wallet","balance":0,"balance_date":"2025-12-31"}','Organizar');
 r:=public.complete_onboarding(v,otherws,'{"name":"Outra","type":"wallet","balance":10,"balance_date":"2025-12-31"}','Retry');
 PERFORM pg_temp.check_true(j#>>'{account,id}'=r#>>'{account,id}' AND (r#>>'{profile,onboarding_completed}')::boolean,'onboarding atomic and idempotent');
 -- Billing intent, webhook replay and failure rollback.
 UPDATE public.plans SET stripe_price_id='price_fixture' WHERE id='individual';
 intent:=public.begin_checkout(u,'individual',key);
 j:=public.begin_checkout(u,'individual',key);
 PERFORM pg_temp.check_true(intent->>'id'=j->>'id','checkout retry reuses durable intent');
 PERFORM pg_temp.reject(format('SELECT public.begin_checkout(%L,%L,%L)',u,'individual',gen_random_uuid()),'cobrança pendente');
 j:=jsonb_build_object('id','sub_fixture_'||u,'customer','cus_fixture','status','active','price_id','price_fixture','cancel_at_period_end',false);
 PERFORM public.apply_subscription_event('evt_fixture_'||u,'customer.subscription.updated',100,(intent->>'id')::uuid,j);
 PERFORM pg_temp.check_true(NOT public.apply_subscription_event('evt_fixture_'||u,'customer.subscription.updated',100,(intent->>'id')::uuid,j),'webhook replay is idempotent');
 PERFORM public.apply_subscription_event('evt_old_'||u,'customer.subscription.updated',90,(intent->>'id')::uuid,j||'{"status":"past_due"}');
 PERFORM pg_temp.check_true((SELECT status='active' FROM public.subscriptions WHERE user_id=u),'older event cannot regress subscription');
 countbefore:=(SELECT count(*) FROM public.payment_events);
 PERFORM pg_temp.reject(format('SELECT public.apply_subscription_event(%L,%L,110,%L,%L)','evt_bad_'||u,'customer.subscription.updated',intent->>'id',j||'{"price_id":"price_other"}'),'Preço não corresponde');
 PERFORM pg_temp.check_true((SELECT count(*)=countbefore FROM public.payment_events),'failed billing event cannot be acknowledged as persisted');
 -- Bulk aggregation proves no PostgREST 1000-row limit.
 INSERT INTO public.transactions(user_id,workspace_id,account_id,description,amount,type,date,is_reconciled)
 SELECT u,ws,a,'Bulk '||g,1,'income','2026-02-01',true FROM generate_series(1,1205) g;
 f:=public.financial_snapshot(u,ARRAY[ws],'2026-02-01','2026-02-28','2026-02-28');
 PERFORM pg_temp.check_true((f#>>'{stats,income}')::numeric=1205 AND (f#>>'{coverage,postedTransactions}')::integer=1205,'metrics aggregate over 1000 rows');
END $$;
SELECT count(*) AS passed_operations_assertions FROM assertions;
ROLLBACK;
