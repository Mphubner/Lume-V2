BEGIN;
-- Aggregation happens inside PostgreSQL using numeric, before PostgREST's row limit.
-- Values cross JSON as decimal strings; the API validates safe integer cents.
CREATE OR REPLACE FUNCTION public.financial_snapshot(
 p_user_id uuid, p_workspace_ids uuid[], p_start_date date, p_end_date date,
 p_as_of date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_user_id IS NULL OR p_workspace_ids IS NULL OR cardinality(p_workspace_ids)=0
    OR cardinality(p_workspace_ids)>100 OR array_position(p_workspace_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Workspace selection required' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_workspace_ids) w(id) WHERE NOT EXISTS(
  SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=p_user_id)) THEN
  RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501';
 END IF;
 IF p_start_date IS NULL OR p_end_date IS NULL OR p_as_of IS NULL OR p_start_date>p_end_date
    OR p_end_date>p_as_of OR p_end_date-p_start_date>3660
    OR p_as_of>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
  RAISE EXCEPTION 'Invalid observed period' USING ERRCODE='22023';
 END IF;
 WITH scoped_accounts AS MATERIALIZED (
  SELECT * FROM public.accounts WHERE workspace_id=ANY(p_workspace_ids)
 ), scoped_rows AS MATERIALIZED (
  SELECT * FROM public.transactions WHERE workspace_id=ANY(p_workspace_ids) AND date<=p_as_of
 ), posted AS MATERIALIZED (
  SELECT * FROM scoped_rows WHERE ledger_status='posted' AND is_reconciled AND NOT legacy_needs_review
 ), refund_totals AS (
  SELECT reversal_of,sum(abs(amount)) AS amount FROM posted WHERE economic_kind='refund' GROUP BY reversal_of
 ), evaluated AS MATERIALIZED (
  SELECT t.*,
   (a.id IS NOT NULL AND (t.category_id IS NULL OR c.id IS NOT NULL)) AS relation_valid,
   (t.economic_kind='transfer' OR t.type='transfer' OR t.is_internal_transfer) AS transfer_marked,
   (pair.id IS NOT NULL AND pair.workspace_id=ANY(p_workspace_ids)) AS transfer_confirmed,
   (pair.id IS NOT NULL AND NOT(pair.workspace_id=ANY(p_workspace_ids))) AS boundary_transfer,
   (original.id IS NOT NULL AND refunds.amount<=abs(original.amount)) AS refund_valid,
   original.type AS original_type, original.category_id AS original_category_id,
   CASE WHEN t.economic_kind='refund' THEN original.category_id ELSE t.category_id END AS expense_category_id
  FROM posted t
  LEFT JOIN scoped_accounts a ON a.id=t.account_id AND a.workspace_id=t.workspace_id
  LEFT JOIN public.categories c ON c.id=t.category_id AND
    (c.workspace_id=t.workspace_id OR (c.is_system AND c.user_id IS NULL AND c.workspace_id IS NULL))
  LEFT JOIN public.transactions pair ON pair.id=t.linked_transaction_id AND pair.linked_transaction_id=t.id
    AND pair.id<>t.id AND pair.account_id<>t.account_id AND pair.amount=-t.amount
    AND pair.ledger_status='posted' AND pair.is_reconciled AND NOT pair.legacy_needs_review AND pair.date<=p_as_of
    AND pair.economic_kind=t.economic_kind AND pair.economic_kind IN ('transfer','card_payment','investment_principal')
    AND EXISTS(SELECT 1 FROM public.workspace_members pm WHERE pm.user_id=p_user_id AND pm.workspace_id=pair.workspace_id)
    AND EXISTS(SELECT 1 FROM public.accounts pa WHERE pa.id=pair.account_id AND pa.workspace_id=pair.workspace_id AND pa.currency=a.currency)
  LEFT JOIN posted original ON original.id=t.reversal_of AND original.workspace_id=t.workspace_id
    AND original.account_id=t.account_id AND original.economic_kind='standard' AND original.type IN ('income','expense')
    AND NOT original.is_internal_transfer AND original.amount*t.amount<0
    AND (original.category_id IS NULL OR EXISTS(SELECT 1 FROM public.categories oc WHERE oc.id=original.category_id
      AND (oc.workspace_id=original.workspace_id OR(oc.is_system AND oc.user_id IS NULL AND oc.workspace_id IS NULL))))
    AND ((original.type='expense' AND original.amount<0) OR(original.type='income' AND original.amount>0))
  LEFT JOIN refund_totals refunds ON refunds.reversal_of=t.reversal_of
 ), economic AS MATERIALIZED (
  SELECT e.*,
   CASE WHEN relation_valid AND NOT transfer_marked AND economic_kind='standard' AND type='income' AND amount>0 THEN amount
        WHEN relation_valid AND NOT transfer_marked AND economic_kind='refund' AND refund_valid AND original_type='income' THEN amount ELSE 0::numeric END AS income,
   CASE WHEN relation_valid AND NOT transfer_marked AND economic_kind='standard' AND type='expense' AND amount<0 THEN -amount
        WHEN relation_valid AND NOT transfer_marked AND economic_kind='refund' AND refund_valid AND original_type='expense' THEN -amount ELSE 0::numeric END AS expenses,
   (NOT relation_valid OR (economic_kind='standard' AND NOT transfer_marked AND
      NOT((type='income' AND amount>0) OR(type='expense' AND amount<0)))) AS invalid_record
  FROM evaluated e
 ), period_rows AS MATERIALIZED (
  SELECT * FROM economic WHERE date BETWEEN p_start_date AND p_end_date
 ), account_totals AS (
  SELECT a.*,coalesce(m.movement,0::numeric) movement,
   coalesce(p.pending,0) AS pending,coalesce(p.legacy,0) AS legacy,
   (a.balance_date IS NOT NULL AND a.balance_date<=p_as_of AND coalesce(p.pending,0)=0
      AND coalesce(p.legacy,0)=0 AND coalesce(m.invalid,0)=0) AS known
  FROM scoped_accounts a
  LEFT JOIN LATERAL (
   SELECT sum(amount) movement,count(*) FILTER(WHERE invalid_record OR(economic_kind='refund' AND NOT refund_valid)) invalid
   FROM economic WHERE account_id=a.id AND workspace_id=a.workspace_id AND date>a.balance_date
  ) m ON true
  LEFT JOIN LATERAL (
   SELECT count(*) FILTER(WHERE NOT is_reconciled) pending,count(*) FILTER(WHERE legacy_needs_review) legacy
   FROM scoped_rows WHERE account_id=a.id AND workspace_id=a.workspace_id AND ledger_status='posted'
     AND (a.balance_date IS NULL OR date>a.balance_date)
  ) p ON true
 ), account_json AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'workspace_id',workspace_id,'name',name,'type',type,
   'institution',institution,'account_type',account_type,'currency',currency,'is_active',is_active,'color',color,'icon',icon,
   'credit_limit',credit_limit,'closing_day',closing_day,'due_day',due_day,
   'opening',balance::text,'balance_date',balance_date,'movement',movement::text,
   'current',CASE WHEN known THEN (balance+movement)::text ELSE NULL END,'known',known,
   'pendingTransactions',pending,'legacyTransactions',legacy) ORDER BY name,id),'[]'::jsonb) accounts,
   count(*) account_count,count(*) FILTER(WHERE NOT known) unknown_count,
   CASE WHEN count(*)>0 AND bool_and(known) THEN sum(balance+movement)::text ELSE NULL END balance,
   CASE WHEN count(*) FILTER(WHERE type IN ('checking','savings','wallet'))>0 AND bool_and(known) FILTER(WHERE type IN ('checking','savings','wallet'))
     THEN (sum(balance+movement) FILTER(WHERE type IN ('checking','savings','wallet')))::text ELSE NULL END cash_balance
  FROM account_totals
 ), totals AS (
  SELECT coalesce(sum(income),0) income,coalesce(sum(expenses),0) expenses,coalesce(sum(amount),0) cash_flow,
   coalesce(sum(abs(amount)) FILTER(WHERE transfer_confirmed AND amount<0),0) transfers,
   coalesce(sum(amount) FILTER(WHERE transfer_marked AND amount>0),0) transfer_inflows,
   coalesce(sum(-amount) FILTER(WHERE transfer_marked AND amount<0),0) transfer_outflows,
   coalesce(sum(abs(amount)) FILTER(WHERE economic_kind IN ('card_payment','investment_principal','loan_principal','owner_contribution','owner_withdrawal')),0) principal,
   count(*) tx_count,count(*) FILTER(WHERE transfer_marked AND NOT transfer_confirmed AND NOT boundary_transfer) unresolved_transfers,
   count(*) FILTER(WHERE boundary_transfer) boundary_transfers,count(*) FILTER(WHERE economic_kind='refund' AND NOT refund_valid) invalid_refunds,
   count(*) FILTER(WHERE invalid_record) invalid_transactions,
   count(DISTINCT to_char(date,'YYYY-MM')) observed_months
  FROM period_rows
 ), categories AS (
  SELECT expense_category_id,sum(expenses) total,count(*) count FROM period_rows WHERE expenses<>0 GROUP BY expense_category_id
 ), category_json AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',cat.expense_category_id,'name',coalesce(c.name,'Sem categoria'),
    'icon',coalesce(c.icon,'📦'),'color',coalesce(c.color,'#94a3b8'),'nature',c.nature,
    'total',cat.total::text,'count',cat.count) ORDER BY cat.total DESC,cat.expense_category_id),'[]'::jsonb) by_category
  FROM categories cat LEFT JOIN public.categories c ON c.id=cat.expense_category_id AND
    (c.workspace_id=ANY(p_workspace_ids) OR(c.is_system AND c.user_id IS NULL AND c.workspace_id IS NULL))
 ), months AS (
  SELECT d::date start_date,(d+interval '1 month - 1 day')::date end_date,to_char(d,'YYYY-MM') AS month_key
  FROM generate_series(date_trunc('month',p_start_date::timestamp),date_trunc('month',p_end_date::timestamp),interval '1 month') d
 ), monthly AS (
  SELECT m.month_key,coalesce(sum(t.income),0) income,coalesce(sum(t.expenses),0) expenses,count(t.id) transactions,
    (m.start_date>=p_start_date AND m.end_date<=p_end_date AND EXISTS(SELECT 1 FROM scoped_accounts)
     AND NOT EXISTS(SELECT 1 FROM scoped_accounts a WHERE a.balance_date IS NULL OR a.balance_date>=m.start_date OR NOT EXISTS(
       SELECT 1 FROM public.account_reconciliations r WHERE r.account_id=a.id AND r.workspace_id=a.workspace_id
       AND r.as_of=m.end_date AND r.difference=0 AND r.created_at>=a.updated_at
       AND r.created_at>=coalesce((SELECT max(s.updated_at) FROM scoped_rows s WHERE s.account_id=a.id AND s.date<=m.end_date),a.updated_at)))
     AND NOT EXISTS(SELECT 1 FROM scoped_rows s WHERE s.date BETWEEN m.start_date AND m.end_date AND s.ledger_status='posted' AND(NOT s.is_reconciled OR s.legacy_needs_review))) verified
  FROM months m LEFT JOIN period_rows t ON to_char(t.date,'YYYY-MM')=m.month_key GROUP BY m.month_key,m.start_date,m.end_date
 ), monthly_json AS (
  SELECT jsonb_agg(jsonb_build_object('month',month_key,'income',income::text,'expenses',expenses::text,
    'balance',(income-expenses)::text,'transactions',transactions,'verified',verified) ORDER BY month_key) evolution,
    count(*) month_count,count(*) FILTER(WHERE verified) verified_months,
    coalesce(jsonb_agg(month_key ORDER BY month_key) FILTER(WHERE verified),'[]'::jsonb) verified_month_keys FROM monthly
 ), gaps AS (
  SELECT count(*) FILTER(WHERE NOT is_reconciled) pending,count(*) FILTER(WHERE legacy_needs_review) legacy,
   min(date) first_date,max(date) last_date
  FROM scoped_rows WHERE date BETWEEN p_start_date AND p_end_date AND ledger_status='posted'
 ), version AS (
  SELECT md5(coalesce((SELECT jsonb_agg(jsonb_build_array(id,workspace_id,account_id,category_id,amount,type,date,economic_kind,
      is_reconciled,ledger_status,legacy_needs_review,reversal_of,linked_transaction_id,updated_at) ORDER BY id)::text FROM scoped_rows),'[]')
    ||coalesce((SELECT jsonb_agg(jsonb_build_array(id,balance,balance_date,updated_at) ORDER BY id)::text FROM scoped_accounts),'[]')) data_version
 )
 SELECT jsonb_build_object('factsVersion','financial-v1','dataVersion',v.data_version,
   'accounts',a.accounts,'byCategory',c.by_category,'monthlyEvolution',m.evolution,
   'byWorkspaceCategory',coalesce((SELECT jsonb_agg(jsonb_build_object('workspace_id',x.workspace_id,'category_id',x.expense_category_id,'total',x.total::text) ORDER BY x.workspace_id,x.expense_category_id)
     FROM(SELECT workspace_id,expense_category_id,sum(expenses) total FROM period_rows WHERE expenses<>0 GROUP BY workspace_id,expense_category_id) x),'[]'::jsonb),
   'stats',jsonb_build_object('income',t.income::text,'expenses',t.expenses::text,'periodBalance',(t.income-t.expenses)::text,
     'balance',a.balance,'cashBalance',a.cash_balance,'cashFlowNet',t.cash_flow::text,'transfers',t.transfers::text,
     'transferInflows',t.transfer_inflows::text,'transferOutflows',t.transfer_outflows::text,'excludedPrincipal',t.principal::text,
     'savingsRate',CASE WHEN t.income>0 THEN round((t.income-t.expenses)/t.income*100,1) ELSE NULL END),
   'coverage',jsonb_build_object('accountCount',a.account_count,'unknownBalanceAccounts',a.unknown_count,'postedTransactions',t.tx_count,
     'pendingTransactions',g.pending,'legacyTransactions',g.legacy,'unresolvedTransfers',t.unresolved_transfers,
     'boundaryTransfers',t.boundary_transfers,'invalidRefunds',t.invalid_refunds,'invalidTransactions',t.invalid_transactions,
     'observedMonthCount',t.observed_months,'requestedMonthCount',m.month_count,'verifiedMonthCount',m.verified_months,
     'verifiedMonths',m.verified_month_keys,'firstDate',g.first_date,'lastDate',g.last_date,
     'complete',a.account_count>0 AND a.unknown_count=0 AND g.pending=0 AND g.legacy=0 AND t.unresolved_transfers=0
       AND t.invalid_refunds=0 AND t.invalid_transactions=0 AND m.verified_months=m.month_count))
 INTO result FROM totals t CROSS JOIN account_json a CROSS JOIN category_json c CROSS JOIN monthly_json m CROSS JOIN gaps g CROSS JOIN version v;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.financial_snapshot(uuid,uuid[],date,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.financial_snapshot(uuid,uuid[],date,date,date) TO service_role;
CREATE INDEX IF NOT EXISTS account_reconciliations_closing_idx ON public.account_reconciliations(account_id,as_of,created_at);
ALTER TABLE public.health_scores ALTER COLUMN total_score DROP NOT NULL;
ALTER TABLE public.health_scores ALTER COLUMN grade DROP NOT NULL;
ALTER TABLE public.health_scores ADD COLUMN IF NOT EXISTS formula_version text;
ALTER TABLE public.health_scores ADD COLUMN IF NOT EXISTS facts_fingerprint text;
ALTER TABLE public.health_scores ADD COLUMN IF NOT EXISTS period_start date;
ALTER TABLE public.health_scores ADD COLUMN IF NOT EXISTS period_end date;
ALTER TABLE public.health_scores ADD COLUMN IF NOT EXISTS result jsonb;
COMMIT;
