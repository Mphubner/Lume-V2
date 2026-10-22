-- Keep approved category learning inside the same transaction as ledger approval.
-- No records are deleted or reclassified; old unrestricted rules remain untouched.
BEGIN;
-- This legacy key predates workspaces and directions and prevents valid separate
-- rules for the same owner. Replace only the documented legacy constraint.
ALTER TABLE public.ai_rules DROP CONSTRAINT IF EXISTS ai_rules_user_keyword_unique;
-- Non-unique so pre-existing duplicate rules are preserved for explicit review.
-- The approval RPC serializes learning by actor/workspace before selecting a rule.
CREATE INDEX IF NOT EXISTS ai_rules_workspace_keyword_direction_idx
 ON public.ai_rules(user_id,workspace_id,keyword,transaction_type);
CREATE OR REPLACE FUNCTION public.approve_import_rows(p_actor uuid,p_import uuid,p_ids uuid[],p_balance jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.imports; a public.accounts; row public.import_rows; existing public.transactions; ref public.transactions;
 n integer; sum_cents bigint; opening numeric(15,2); closing numeric(15,2); first_day date; last_day date;
 posted integer:=0; duplicates integer:=0; txn uuid; rule_id uuid; transfer_group uuid;
 rule_direction text; rule_keyword text;
BEGIN
 SELECT * INTO job FROM public.imports WHERE id=p_import FOR UPDATE;
 IF job.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,job.workspace_id,true) THEN RAISE EXCEPTION 'Importação indisponível'; END IF;
 IF job.status='completed' THEN RETURN jsonb_build_object('status','completed','imported',job.imported_transactions,'duplicates',job.duplicates_skipped,'idempotent',true); END IF;
 IF job.status<>'needs_review' THEN RAISE EXCEPTION 'Lote ainda não pode ser aprovado'; END IF;
 -- All learning approvals by the same actor in this workspace share one key.
 -- Acquire it before account locks, so concurrent jobs cannot create duplicate rules.
 IF EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=p_import AND learn_rule AND category_id IS NOT NULL AND economic_kind='standard' AND linked_transaction_id IS NULL AND reversal_of IS NULL) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('lume:category-learning:'||p_actor::text||':'||job.workspace_id::text,0));
 END IF;
 SELECT * INTO a FROM public.accounts WHERE id=job.account_id FOR UPDATE;
 SELECT count(*),sum(amount_cents) INTO n,sum_cents FROM public.import_rows WHERE import_id=p_import;
 IF n=0 OR cardinality(p_ids) IS DISTINCT FROM n OR (SELECT count(DISTINCT id) FROM unnest(p_ids) id)<>n
  OR EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=p_import AND NOT(id=ANY(p_ids))) THEN RAISE EXCEPTION 'Selecione explicitamente todas as linhas do lote'; END IF;
 IF (p_balance->>'source_confirmed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Confira o documento e a conta de origem'; END IF;
 IF coalesce(p_balance->>'opening_balance','') !~ '^-?[0-9]+(\.[0-9]{1,2})?$' OR coalesce(p_balance->>'closing_balance','') !~ '^-?[0-9]+(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Informe abertura e fechamento com centavos'; END IF;
 opening:=(p_balance->>'opening_balance')::numeric; closing:=(p_balance->>'closing_balance')::numeric;
 first_day:=(p_balance->>'period_start')::date; last_day:=(p_balance->>'period_end')::date;
 IF first_day IS NULL OR last_day IS NULL OR first_day>last_day OR EXISTS(SELECT 1 FROM public.import_rows WHERE import_id=p_import AND date NOT BETWEEN first_day AND last_day) THEN RAISE EXCEPTION 'Período não cobre todas as linhas'; END IF;
 IF opening+sum_cents::numeric/100<>closing THEN RAISE EXCEPTION 'Abertura + movimentos difere do fechamento. Nenhum lançamento foi aplicado.'; END IF;
 IF job.statement_metadata?'opening_balance' AND (job.statement_metadata->>'opening_balance')::numeric<>opening THEN RAISE EXCEPTION 'Saldo inicial difere do documento'; END IF;
 IF job.statement_metadata?'closing_balance' AND coalesce((job.statement_metadata->>'balance_requires_confirmation')::boolean,false)=false AND (job.statement_metadata->>'closing_balance')::numeric<>closing THEN RAISE EXCEPTION 'Saldo final difere do documento'; END IF;
 FOR row IN SELECT * FROM public.import_rows WHERE import_id=p_import ORDER BY row_number FOR UPDATE LOOP
  IF row.review_state='potential_duplicate' AND NOT row.distinct_confirmed AND row.duplicate_of IS NULL THEN RAISE EXCEPTION 'Resolva todas as possíveis duplicatas antes de aprovar'; END IF;
  SELECT * INTO existing FROM public.transactions WHERE account_id=row.account_id AND source_key=row.source_key;
  IF existing.id IS NOT NULL THEN
   IF existing.date<>row.date OR existing.amount<>row.amount OR existing.ledger_status<>'posted' OR NOT existing.is_reconciled OR existing.legacy_needs_review OR existing.content_fingerprint IS DISTINCT FROM row.content_fingerprint THEN RAISE EXCEPTION 'Identidade de origem conflitante'; END IF;
   UPDATE public.import_rows SET review_state='duplicate',duplicate_of=existing.id,updated_at=now() WHERE id=row.id;
   duplicates:=duplicates+1; CONTINUE;
  END IF;
  IF row.duplicate_of IS NOT NULL THEN
   SELECT * INTO existing FROM public.transactions WHERE id=row.duplicate_of FOR SHARE;
   IF existing.id IS NULL OR existing.account_id<>row.account_id OR existing.date<>row.date OR existing.amount<>row.amount OR existing.ledger_status<>'posted' OR NOT existing.is_reconciled OR existing.legacy_needs_review THEN RAISE EXCEPTION 'Duplicata informada não é mais válida'; END IF;
   UPDATE public.import_rows SET review_state='duplicate',updated_at=now() WHERE id=row.id;
   duplicates:=duplicates+1; CONTINUE;
  END IF;
  -- Another batch may have been approved since this batch was extracted.
  IF NOT row.distinct_confirmed AND EXISTS(SELECT 1 FROM public.transactions t WHERE t.account_id=row.account_id AND t.date=row.date AND t.amount=row.amount AND t.ledger_status='posted' AND t.import_id IS DISTINCT FROM p_import AND (t.content_fingerprint=row.content_fingerprint OR lower(trim(coalesce(t.raw_description,t.description)))=lower(trim(row.description)))) THEN RAISE EXCEPTION 'Possível duplicata surgiu após extração. Revise novamente.'; END IF;
  transfer_group:=null;
  IF row.economic_kind IN ('transfer','card_payment') THEN
   SELECT * INTO ref FROM public.transactions WHERE id=row.linked_transaction_id FOR UPDATE;
   IF ref.id IS NULL OR ref.workspace_id<>row.workspace_id OR ref.account_id=row.account_id OR ref.amount<>-row.amount OR ref.ledger_status<>'posted' OR NOT ref.is_reconciled OR ref.legacy_needs_review OR ref.linked_transaction_id IS NOT NULL OR ref.transfer_group_id IS NOT NULL OR ref.reversal_of IS NOT NULL OR ref.economic_kind<>'standard' OR abs(ref.date-row.date)>3
    OR EXISTS(SELECT 1 FROM public.transactions t WHERE t.reversal_of=ref.id AND t.ledger_status='posted') THEN RAISE EXCEPTION 'Movimentação interna exige contrapartida autorizada, conferida, sem vínculos, de mesmo valor, sinal oposto e data próxima'; END IF;
   IF row.economic_kind='card_payment' AND a.type<>'credit_card' AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=ref.account_id AND type='credit_card') THEN RAISE EXCEPTION 'Pagamento de cartão exige conta de cartão'; END IF;
   transfer_group:=gen_random_uuid();
  ELSIF row.linked_transaction_id IS NOT NULL THEN RAISE EXCEPTION 'Contrapartida só se aplica a transferência ou pagamento de cartão'; END IF;
  IF row.economic_kind='refund' THEN
   SELECT * INTO ref FROM public.transactions WHERE id=row.reversal_of FOR UPDATE;
   IF ref.id IS NULL OR ref.workspace_id<>row.workspace_id OR ref.account_id<>row.account_id OR ref.amount*row.amount>=0 OR ref.ledger_status<>'posted' OR NOT ref.is_reconciled OR ref.legacy_needs_review OR ref.economic_kind<>'standard' OR ref.is_internal_transfer OR ref.type NOT IN ('income','expense') THEN RAISE EXCEPTION 'Estorno exige transação original válida, conferida e da mesma conta'; END IF;
  ELSIF row.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'Referência de estorno só se aplica à natureza estorno'; END IF;
  INSERT INTO public.transactions(user_id,workspace_id,account_id,family_id,member_id,category_id,subcategory,description,raw_description,amount,type,economic_kind,date,payment_method,account_type,origin,is_internal_transfer,linked_transaction_id,reversal_of,source_key,external_id,content_fingerprint,import_hash,import_id,is_confirmed,is_reconciled,ledger_status,reviewed_by,reviewed_at)
   VALUES(job.user_id,row.workspace_id,row.account_id,a.family_id,p_actor,row.category_id,row.subcategory,row.description,row.description,row.amount,
   CASE WHEN row.economic_kind IN ('transfer','card_payment') THEN 'transfer' WHEN row.amount<0 THEN 'expense' ELSE 'income' END,
   row.economic_kind,row.date,row.payment_method,a.account_type,'import',row.economic_kind IN ('transfer','card_payment'),row.linked_transaction_id,row.reversal_of,row.source_key,row.external_id,row.content_fingerprint,row.source_identity,p_import,true,true,'posted',p_actor,now()) RETURNING id INTO txn;
  IF row.linked_transaction_id IS NOT NULL THEN
   UPDATE public.transactions SET transfer_group_id=transfer_group WHERE id=txn;
   UPDATE public.transactions SET linked_transaction_id=txn,transfer_group_id=transfer_group,economic_kind=row.economic_kind,type='transfer',is_internal_transfer=true WHERE id=row.linked_transaction_id;
  END IF;
  UPDATE public.import_rows SET review_state='posted',transaction_id=txn,updated_at=now() WHERE id=row.id;
  posted:=posted+1;
  -- A stale learn_rule flag on a special movement is never training evidence.
  IF row.learn_rule AND row.category_id IS NOT NULL AND row.economic_kind='standard'
   AND row.linked_transaction_id IS NULL AND row.reversal_of IS NULL AND row.workspace_id=job.workspace_id THEN
   rule_direction:=CASE WHEN row.amount_cents<0 THEN 'expense' ELSE 'income' END;
   rule_keyword:=lower(trim(row.description));
   IF length(rule_keyword) BETWEEN 3 AND 255 AND EXISTS(
    SELECT 1 FROM public.categories c WHERE c.id=row.category_id
     AND (c.workspace_id=row.workspace_id OR (c.is_system AND c.user_id IS NULL AND c.workspace_id IS NULL))
     AND c.type IN ('both',rule_direction) AND (row.subcategory IS NULL OR row.subcategory=ANY(c.subcategories))
   ) THEN
    -- Preserve legacy unrestricted rules and the opposite direction. A correction
    -- teaches only this exact actor/workspace/description/direction combination.
    SELECT id INTO rule_id FROM public.ai_rules
     WHERE user_id=p_actor AND workspace_id=row.workspace_id AND keyword=rule_keyword AND transaction_type=rule_direction
     ORDER BY created_at,id LIMIT 1 FOR UPDATE;
    IF rule_id IS NOT NULL THEN
     UPDATE public.ai_rules SET category_id=row.category_id,subcategory=row.subcategory,transaction_type=rule_direction,
      is_active=true,usage_count=coalesce(usage_count,0)+1 WHERE id=rule_id;
    ELSE
     INSERT INTO public.ai_rules(user_id,workspace_id,keyword,category_id,subcategory,transaction_type,is_active,usage_count)
      VALUES(p_actor,row.workspace_id,rule_keyword,row.category_id,row.subcategory,rule_direction,true,1);
    END IF;
   END IF;
  END IF;
 END LOOP;
 UPDATE public.imports SET status='completed',imported_transactions=posted,duplicates_skipped=duplicates,balance_check=p_balance,approved_by=p_actor,approved_at=now(),updated_at=now() WHERE id=p_import;
 UPDATE public.profiles SET needs_insight_recalc=true WHERE id IN(SELECT user_id FROM public.workspace_members WHERE workspace_id=job.workspace_id);
 INSERT INTO public.audit_log(user_id,action,details) VALUES(p_actor,'import_approved',jsonb_build_object('import_id',p_import,'posted',posted,'duplicates',duplicates,'balance_check',p_balance));
 RETURN jsonb_build_object('status','completed','imported',posted,'duplicates',duplicates);
END $$;
REVOKE ALL ON FUNCTION public.approve_import_rows(uuid,uuid,uuid[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_import_rows(uuid,uuid,uuid[],jsonb) TO service_role;
COMMIT;
