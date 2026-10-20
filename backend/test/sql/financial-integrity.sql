-- Synthetic local fixture only. Every change, including temporary trigger state,
-- is inside this rollback transaction; no live data is used.
BEGIN;
CREATE TEMP TABLE financial_assertions(label text PRIMARY KEY);
CREATE FUNCTION pg_temp.fin_check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'Financial FAIL: %',label; END IF; INSERT INTO financial_assertions VALUES(label); END $$;
DO $$
DECLARE u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();ws uuid;otherws uuid;closedws uuid;
 a uuid;b uuid;unknown_a uuid;closed_a uuid;original uuid;income_original uuid;pending uuid;bad uuid;outgoing uuid;incoming uuid;
 j jsonb;f jsonb;jan jsonb;feb jsonb;denied boolean:=false;cat uuid;foreigncat uuid;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(u,u||'@fixture.invalid',now()),(v,v||'@fixture.invalid',now()),(w,w||'@fixture.invalid',now());
 SELECT id INTO ws FROM public.workspaces WHERE owner_id=u AND kind='personal';
 SELECT id INTO otherws FROM public.workspaces WHERE owner_id=v AND kind='personal';
 SELECT id INTO closedws FROM public.workspaces WHERE owner_id=w AND kind='personal';
 j:=public.mutate_financial_record(u,'accounts','insert',NULL,ws,'{"name":"Metric fixture","type":"checking","balance":100,"balance_date":"2025-12-31"}');a:=(j->>'id')::uuid;
 j:=public.mutate_financial_record(v,'accounts','insert',NULL,otherws,'{"name":"Foreign fixture","type":"checking","balance":9000,"balance_date":"2025-12-31"}');b:=(j->>'id')::uuid;
 j:=public.mutate_financial_record(u,'categories','insert',NULL,ws,'{"name":"Own expenses","type":"expense"}');cat:=(j->>'id')::uuid;
 j:=public.mutate_financial_record(v,'categories','insert',NULL,otherws,'{"name":"SECRET FOREIGN CATEGORY","type":"expense"}');foreigncat:=(j->>'id')::uuid;
 j:=public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Purchase','amount',-100,'type','expense','date','2026-01-10','account_id',a,'category_id',cat));original:=(j->>'id')::uuid;
 PERFORM public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','January partial refund','amount',25,'type','income','economic_kind','refund','reversal_of',original,'date','2026-01-15','account_id',a));
 PERFORM public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','February partial refund','amount',10,'type','income','economic_kind','refund','reversal_of',original,'date','2026-02-01','account_id',a));
 j:=public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Income','amount',1000,'type','income','date','2026-01-20','account_id',a));income_original:=(j->>'id')::uuid;
 PERFORM public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Return income','amount',-100,'type','expense','economic_kind','refund','reversal_of',income_original,'date','2026-02-02','account_id',a));
 jan:=public.financial_snapshot(u,ARRAY[ws],'2026-01-01','2026-01-31','2026-01-31');
 feb:=public.financial_snapshot(u,ARRAY[ws],'2026-02-01','2026-02-28','2026-02-28');
 PERFORM pg_temp.fin_check((jan#>>'{stats,income}')::numeric=1000 AND (jan#>>'{stats,expenses}')::numeric=75,'refunds apply in the actual refund period');
 PERFORM pg_temp.fin_check((feb#>>'{stats,income}')::numeric=-100 AND (feb#>>'{stats,expenses}')::numeric=-10,'income return reduces income and purchase return reduces expense');
 PERFORM pg_temp.fin_check((feb#>>'{stats,periodBalance}')::numeric=-90,'refund net result remains signed');
 PERFORM pg_temp.fin_check(feb#>>'{byCategory,0,id}'=cat::text AND (feb#>>'{byCategory,0,total}')::numeric=-10,'refund inherits the original expense category');
 PERFORM pg_temp.fin_check((feb#>>'{stats,balance}')::numeric=935,'dated account closing includes signed refunds');
 PERFORM public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Loan principal','amount',400,'type','income','economic_kind','loan_principal','date','2026-02-03','account_id',a));
 PERFORM public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Owner contribution','amount',100,'type','income','economic_kind','owner_contribution','date','2026-02-03','account_id',a));
 PERFORM public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Owner withdrawal','amount',-30,'type','expense','economic_kind','owner_withdrawal','date','2026-02-03','account_id',a));
 f:=public.financial_snapshot(u,ARRAY[ws],'2026-02-01','2026-02-28','2026-02-28');
 PERFORM pg_temp.fin_check((f#>>'{stats,periodBalance}')::numeric=-90 AND (f#>>'{stats,balance}')::numeric=1405,'principal changes account funds but never economic result');
 PERFORM pg_temp.fin_check((f#>>'{stats,excludedPrincipal}')::numeric=530,'principal excluded volume is explicit');
 INSERT INTO public.transactions(user_id,workspace_id,account_id,description,amount,type,date,is_reconciled)
 VALUES(u,ws,a,'Pending review',9,'income','2026-02-04',false) RETURNING id INTO pending;
 j:=public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Voided','amount',50,'type','income','date','2026-02-04','account_id',a));
 PERFORM public.void_transaction(u,(j->>'id')::uuid);
 f:=public.financial_snapshot(u,ARRAY[ws],'2026-02-01','2026-02-28','2026-02-28');
 PERFORM pg_temp.fin_check((f#>>'{stats,income}')::numeric=-100 AND (f#>>'{coverage,pendingTransactions}')::integer=1,'pending and voided rows never enter economic metrics');
 PERFORM pg_temp.fin_check(f#>>'{stats,balance}' IS NULL AND NOT(f#>>'{coverage,complete}')::boolean,'pending account movement prevents claiming a complete balance');
 UPDATE public.transactions SET is_reconciled=true WHERE id=pending;
 -- A legacy account with an undated balance remains unknown, not zero or today.
 INSERT INTO public.accounts(user_id,workspace_id,name,type,balance,balance_date) VALUES(u,ws,'Unknown legacy','wallet',777,NULL) RETURNING id INTO unknown_a;
 f:=public.financial_snapshot(u,ARRAY[ws],'2026-02-01','2026-02-28','2026-02-28');
 PERFORM pg_temp.fin_check(f#>>'{stats,balance}' IS NULL AND (f#>>'{coverage,unknownBalanceAccounts}')::integer=1,'undated balance remains unknown');
 UPDATE public.accounts SET balance_date='2026-02-04' WHERE id=unknown_a;
 PERFORM public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','Already in base','amount',50,'type','income','date','2026-02-04','account_id',unknown_a));
 PERFORM public.mutate_financial_record(u,'transactions','insert',NULL,ws,jsonb_build_object('description','After base','amount',5,'type','income','date','2026-02-05','account_id',unknown_a));
 f:=public.financial_snapshot(u,ARRAY[ws],'2026-02-01','2026-02-28','2026-02-28');
 PERFORM pg_temp.fin_check((SELECT (x->>'current')::numeric=782 FROM jsonb_array_elements(f->'accounts') x WHERE x->>'id'=unknown_a::text),'base is closing balance: same-day movements do not count twice');
 BEGIN PERFORM public.financial_snapshot(u,ARRAY[otherws],'2026-01-01','2026-01-31','2026-01-31'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 PERFORM pg_temp.fin_check(denied,'RPC rejects foreign workspace membership');
 PERFORM pg_temp.fin_check(NOT has_function_privilege('authenticated','public.financial_snapshot(uuid,uuid[],date,date,date)','EXECUTE'),'browser cannot impersonate actor in financial snapshot');
 -- Model a preserved malformed legacy row, bypassing the modern write guard
 -- only inside this disposable rollback fixture. SQL reads must defend too.
 ALTER TABLE public.transactions DISABLE TRIGGER validate_financial_record;
 UPDATE public.transactions SET category_id=foreigncat WHERE id=original;
 ALTER TABLE public.transactions ENABLE TRIGGER validate_financial_record;
 f:=public.financial_snapshot(u,ARRAY[ws],'2026-01-01','2026-02-28','2026-02-28');
 PERFORM pg_temp.fin_check(position('SECRET FOREIGN CATEGORY' IN f::text)=0 AND position(foreigncat::text IN (f->'byCategory')::text)=0,'legacy foreign category never leaks in refund aggregation');
 PERFORM pg_temp.fin_check((f#>>'{coverage,invalidRefunds}')::integer=2 AND (f#>>'{coverage,invalidTransactions}')::integer=1,'invalid original quarantines dependent refunds and degrades coverage');
 ALTER TABLE public.transactions DISABLE TRIGGER validate_financial_record;
 UPDATE public.transactions SET category_id=cat WHERE id=original;
 ALTER TABLE public.transactions ENABLE TRIGGER validate_financial_record;
 -- A previously imported reciprocal pair across two authorized workspaces.
 INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES(otherws,u,'viewer');
 outgoing:=gen_random_uuid();incoming:=gen_random_uuid();
 INSERT INTO public.transactions(id,user_id,workspace_id,account_id,description,amount,type,date,is_reconciled,economic_kind,is_internal_transfer)
 VALUES(outgoing,u,ws,a,'Boundary out',-10,'transfer','2026-02-10',true,'transfer',true),
 (incoming,v,otherws,b,'Boundary in',10,'transfer','2026-02-10',true,'transfer',true);
 UPDATE public.transactions SET linked_transaction_id=incoming WHERE id=outgoing;
 UPDATE public.transactions SET linked_transaction_id=outgoing WHERE id=incoming;
 f:=public.financial_snapshot(u,ARRAY[ws],'2026-02-01','2026-02-28','2026-02-28');
 PERFORM pg_temp.fin_check((f#>>'{coverage,boundaryTransfers}')::integer=1 AND (f#>>'{coverage,unresolvedTransfers}')::integer=0,'authorized counterpart outside perimeter is explicit boundary movement');
 f:=public.financial_snapshot(u,ARRAY[ws,otherws],'2026-02-01','2026-02-28','2026-02-28');
 PERFORM pg_temp.fin_check((f#>>'{coverage,boundaryTransfers}')::integer=0 AND (f#>>'{stats,transfers}')::numeric=10,'selecting both workspaces confirms one internal outflow');
 UPDATE public.transactions SET linked_transaction_id=NULL WHERE id=incoming;
 f:=public.financial_snapshot(u,ARRAY[ws,otherws],'2026-02-01','2026-02-28','2026-02-28');
 PERFORM pg_temp.fin_check((f#>>'{coverage,unresolvedTransfers}')::integer=2 AND (f#>>'{stats,transfers}')::numeric=0,'one-sided transfer links never qualify as a confirmed pair');
 -- Full, dated closures prove zero-activity months; an absent month is not
 -- silently replaced by a fixed divisor such as six.
 j:=public.mutate_financial_record(w,'accounts','insert',NULL,closedws,'{"name":"Closed fixture","type":"checking","balance":0,"balance_date":"2025-12-31"}');closed_a:=(j->>'id')::uuid;
 PERFORM public.mutate_financial_record(w,'transactions','insert',NULL,closedws,jsonb_build_object('description','Only January activity','amount',300,'type','income','date','2026-01-10','account_id',closed_a));
 PERFORM public.reconcile_account(w,closed_a,'2026-01-31',300);
 PERFORM public.reconcile_account(w,closed_a,'2026-02-28',300);
 PERFORM public.reconcile_account(w,closed_a,'2026-03-31',300);
 f:=public.financial_snapshot(w,ARRAY[closedws],'2026-01-01','2026-03-31','2026-03-31');
 PERFORM pg_temp.fin_check((f#>>'{coverage,complete}')::boolean AND (f#>>'{coverage,verifiedMonthCount}')::integer=3 AND (f#>>'{coverage,observedMonthCount}')::integer=1,'closed zero-activity months have evidence distinct from observed activity');
 PERFORM pg_temp.fin_check(jsonb_array_length(f->'monthlyEvolution')=3 AND (f#>>'{monthlyEvolution,1,income}')::numeric=0,'calendar evolution includes explicit verified zero months');
 UPDATE public.account_reconciliations SET created_at=now()-interval '1 second' WHERE account_id=closed_a;
 f:=public.financial_snapshot(w,ARRAY[closedws],'2026-01-01','2026-03-31','2026-03-31');
 PERFORM pg_temp.fin_check(NOT(f#>>'{coverage,complete}')::boolean AND (f#>>'{coverage,verifiedMonthCount}')::integer=0,'closures older than financial records cannot prove current completeness');
END $$;
SELECT count(*) AS passed_financial_assertions FROM financial_assertions;
ROLLBACK;
