BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_account_id uuid REFERENCES public.accounts(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id);
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.emergency_reserve'::regclass AND contype='u' AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.emergency_reserve'::regclass AND attname='user_id')]::smallint[] LOOP
  EXECUTE format('ALTER TABLE public.emergency_reserve DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS reserve_workspace_unique ON public.emergency_reserve(workspace_id);
CREATE TABLE IF NOT EXISTS public.privacy_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),kind text NOT NULL CHECK(kind IN ('deletion','access','correction')),status text NOT NULL DEFAULT 'pending',created_at timestamptz DEFAULT now());
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.privacy_requests TO service_role;

CREATE OR REPLACE FUNCTION public.create_workspace(p_actor uuid,p_name text,p_kind text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE w public.workspaces; BEGIN
 IF p_kind NOT IN ('family','business') OR length(trim(p_name)) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Invalid workspace'; END IF;
 IF (SELECT count(*) FROM public.workspaces WHERE owner_id=p_actor)>=20 THEN RAISE EXCEPTION 'Workspace limit reached'; END IF;
 INSERT INTO public.workspaces(owner_id,name,kind) VALUES(p_actor,p_name,p_kind) RETURNING * INTO w;
 INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES(w.id,p_actor,'owner');
 RETURN to_jsonb(w)||jsonb_build_object('role','owner');
END $$;
CREATE OR REPLACE FUNCTION public.create_workspace_invitation(p_actor uuid,p_workspace uuid,p_email text,p_role text,p_token_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE invitation public.workspace_invitations; BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=p_workspace AND owner_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner required'; END IF;
 IF p_role NOT IN ('editor','viewer') OR p_email NOT LIKE '%@%' OR length(p_token_hash)<>64 THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
 IF (SELECT count(*) FROM public.workspace_members WHERE workspace_id=p_workspace)+(SELECT count(*) FROM public.workspace_invitations WHERE workspace_id=p_workspace AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now())>=10 THEN RAISE EXCEPTION 'Member limit reached'; END IF;
 UPDATE public.workspace_invitations SET revoked_at=now() WHERE workspace_id=p_workspace AND lower(email)=lower(p_email) AND accepted_at IS NULL AND revoked_at IS NULL;
 INSERT INTO public.workspace_invitations(workspace_id,email,role,token_hash,invited_by,expires_at) VALUES(p_workspace,lower(p_email),p_role,p_token_hash,p_actor,now()+interval '7 days') RETURNING * INTO invitation;
 RETURN jsonb_build_object('id',invitation.id,'email',invitation.email,'role',invitation.role,'expires_at',invitation.expires_at);
END $$;
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(p_actor uuid,p_email text,p_token_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE invitation public.workspace_invitations; BEGIN
 SELECT * INTO invitation FROM public.workspace_invitations WHERE token_hash=p_token_hash FOR UPDATE;
 IF invitation.id IS NULL OR invitation.accepted_at IS NOT NULL OR invitation.revoked_at IS NOT NULL OR invitation.expires_at<=now() OR lower(invitation.email)<>lower(p_email) THEN RAISE EXCEPTION 'Invitation invalid or expired'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND lower(email)=lower(p_email) AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Verified recipient required'; END IF;
 INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES(invitation.workspace_id,p_actor,invitation.role) ON CONFLICT DO NOTHING;
 UPDATE public.workspace_invitations SET accepted_at=now() WHERE id=invitation.id;
 INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,details) VALUES(p_actor,'invitation_accepted','workspace',invitation.workspace_id,'{}');
 RETURN jsonb_build_object('success',true,'workspace_id',invitation.workspace_id);
END $$;
CREATE OR REPLACE FUNCTION public.change_workspace_member(p_actor uuid,p_workspace uuid,p_member uuid,p_role text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=p_workspace AND owner_id=p_actor FOR UPDATE;
 IF NOT FOUND OR p_member=p_actor OR (p_role IS NOT NULL AND p_role NOT IN ('editor','viewer')) THEN RAISE EXCEPTION 'Invalid membership change'; END IF;
 IF p_role IS NULL THEN DELETE FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=p_member;
 ELSE UPDATE public.workspace_members SET role=p_role WHERE workspace_id=p_workspace AND user_id=p_member; END IF;
 INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,details) VALUES(p_actor,'membership_changed','workspace',p_workspace,jsonb_build_object('member',p_member,'role',p_role));
 RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION public.complete_onboarding(p_actor uuid,p_workspace uuid,p_account jsonb,p_objective text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE profile public.profiles; account public.accounts; kind text; BEGIN
 SELECT * INTO profile FROM public.profiles WHERE id=p_actor FOR UPDATE;
 IF profile.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,p_workspace,true) THEN RAISE EXCEPTION 'Unauthorized workspace'; END IF;
 IF profile.onboarding_account_id IS NOT NULL THEN SELECT * INTO account FROM public.accounts WHERE id=profile.onboarding_account_id;
 ELSE
  SELECT w.kind INTO kind FROM public.workspaces w WHERE id=p_workspace;
  IF p_account->>'balance_date' IS NULL OR p_account->>'name' IS NULL THEN RAISE EXCEPTION 'Account name and dated opening balance required'; END IF;
  INSERT INTO public.accounts(user_id,workspace_id,name,type,institution,balance,balance_date,account_type)
   VALUES(p_actor,p_workspace,p_account->>'name',p_account->>'type',p_account->>'institution',(p_account->>'balance')::numeric,(p_account->>'balance_date')::date,CASE WHEN kind='business' THEN 'business' ELSE 'personal' END) RETURNING * INTO account;
  UPDATE public.profiles SET onboarding_account_id=account.id,onboarding_completed=true,objective=left(p_objective,500) WHERE id=p_actor RETURNING * INTO profile;
 END IF;
 RETURN jsonb_build_object('profile',to_jsonb(profile),'account',to_jsonb(account));
END $$;

CREATE OR REPLACE FUNCTION public.create_transfer(p_actor uuid,p_source uuid,p_destination uuid,p_amount numeric,p_date date,p_description text,p_fee numeric DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE src public.accounts; dst public.accounts; a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();g uuid:=gen_random_uuid(); kind text; BEGIN
 PERFORM 1 FROM public.accounts WHERE id IN(p_source,p_destination) ORDER BY id FOR UPDATE;
 SELECT * INTO src FROM public.accounts WHERE id=p_source; SELECT * INTO dst FROM public.accounts WHERE id=p_destination;
 IF src.id IS NULL OR dst.id IS NULL OR src.id=dst.id OR src.workspace_id<>dst.workspace_id OR NOT public.actor_can_access_workspace(p_actor,src.workspace_id,true) THEN RAISE EXCEPTION 'Transfer accounts require same authorized workspace'; END IF;
 IF NOT src.is_active OR NOT dst.is_active OR p_amount<=0 OR p_fee<0 OR p_amount<>round(p_amount,2) OR p_fee<>round(p_fee,2) OR p_date IS NULL OR coalesce(length(p_description),0)=0 THEN RAISE EXCEPTION 'Invalid transfer'; END IF;
 kind:=CASE WHEN dst.type='credit_card' OR src.type='credit_card' THEN 'card_payment' WHEN dst.type='investment' OR src.type='investment' THEN 'investment_principal' ELSE 'transfer' END;
 INSERT INTO public.transactions(id,user_id,workspace_id,account_id,amount,type,date,description,economic_kind,is_internal_transfer,is_reconciled,transfer_group_id,reviewed_by,reviewed_at)
 VALUES(a,p_actor,src.workspace_id,src.id,-p_amount,'transfer',p_date,p_description,kind,true,true,g,p_actor,now()),(b,p_actor,dst.workspace_id,dst.id,p_amount,'transfer',p_date,p_description,kind,true,true,g,p_actor,now());
 UPDATE public.transactions SET linked_transaction_id=b WHERE id=a;UPDATE public.transactions SET linked_transaction_id=a WHERE id=b;
 IF p_fee>0 THEN INSERT INTO public.transactions(user_id,workspace_id,account_id,amount,type,date,description,economic_kind,is_reconciled,transfer_group_id) VALUES(p_actor,src.workspace_id,src.id,-p_fee,'expense',p_date,'Tarifa: '||p_description,'standard',true,g); END IF;
 INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,details) VALUES(p_actor,'transfer_created','transaction',a,jsonb_build_object('pair',b,'group',g));
 RETURN jsonb_build_object('source_id',a,'destination_id',b,'group_id',g);
END $$;
CREATE OR REPLACE FUNCTION public.link_transfer(p_actor uuid,p_source uuid,p_destination uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE src public.transactions;dst public.transactions;g uuid:=gen_random_uuid();kind text; BEGIN
 PERFORM 1 FROM public.transactions WHERE id IN(p_source,p_destination) ORDER BY id FOR UPDATE;
 SELECT * INTO src FROM public.transactions WHERE id=p_source;SELECT * INTO dst FROM public.transactions WHERE id=p_destination;
 IF src.id IS NULL OR dst.id IS NULL OR src.id=dst.id OR src.account_id=dst.account_id OR src.workspace_id<>dst.workspace_id OR NOT public.actor_can_access_workspace(p_actor,src.workspace_id,true) THEN RAISE EXCEPTION 'Invalid transfer pair'; END IF;
 IF src.amount>=0 OR dst.amount<=0 OR src.amount+dst.amount<>0 OR abs(src.date-dst.date)>3 OR src.ledger_status<>'posted' OR dst.ledger_status<>'posted' OR NOT src.is_reconciled OR NOT dst.is_reconciled THEN RAISE EXCEPTION 'Pair values, dates or status do not match'; END IF;
 IF src.linked_transaction_id=dst.id AND dst.linked_transaction_id=src.id THEN RETURN jsonb_build_object('success',true,'already_linked',true); END IF;
 IF src.linked_transaction_id IS NOT NULL OR dst.linked_transaction_id IS NOT NULL OR src.reversal_of IS NOT NULL OR dst.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'Pair already used'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions WHERE reversal_of IN(src.id,dst.id) AND ledger_status='posted') THEN RAISE EXCEPTION 'Pair has dependent refunds'; END IF;
 SELECT CASE WHEN bool_or(type='credit_card') THEN 'card_payment' WHEN bool_or(type='investment') THEN 'investment_principal' ELSE 'transfer' END INTO kind FROM public.accounts WHERE id IN(src.account_id,dst.account_id);
 UPDATE public.transactions SET type='transfer',economic_kind=kind,is_internal_transfer=true,transfer_group_id=g,legacy_needs_review=false,reviewed_by=p_actor,reviewed_at=now(),linked_transaction_id=CASE WHEN id=src.id THEN dst.id ELSE src.id END WHERE id IN(src.id,dst.id);
 INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,details) VALUES(p_actor,'transfer_linked','transaction',src.id,jsonb_build_object('pair',dst.id));
 RETURN jsonb_build_object('success',true,'group_id',g);
END $$;
CREATE OR REPLACE FUNCTION public.void_transaction(p_actor uuid,p_transaction uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row public.transactions; BEGIN
 SELECT * INTO row FROM public.transactions WHERE id=p_transaction FOR UPDATE;
 IF row.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,row.workspace_id,true) THEN RAISE EXCEPTION 'Unauthorized transaction'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions WHERE reversal_of=row.id AND ledger_status='posted') THEN RAISE EXCEPTION 'Void refunds before original transaction'; END IF;
 UPDATE public.transactions SET ledger_status='voided',updated_by=p_actor WHERE id=row.id OR (row.transfer_group_id IS NOT NULL AND transfer_group_id=row.transfer_group_id);
 INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,details) VALUES(p_actor,'transaction_voided','transaction',row.id,'{}');
 RETURN jsonb_build_object('success',true,'voided',true);
END $$;
CREATE OR REPLACE FUNCTION public.reconcile_account(p_actor uuid,p_account uuid,p_as_of date,p_expected numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.accounts;balance numeric;result public.account_reconciliations; BEGIN
 SELECT * INTO a FROM public.accounts WHERE id=p_account FOR UPDATE;
 IF a.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,a.workspace_id,true) THEN RAISE EXCEPTION 'Unauthorized account'; END IF;
 IF a.balance_date IS NULL OR p_as_of IS NULL OR p_as_of<a.balance_date OR p_as_of>(now() AT TIME ZONE 'America/Sao_Paulo')::date OR p_expected IS NULL OR p_expected::text IN ('NaN','Infinity','-Infinity') OR p_expected<>round(p_expected,2) THEN RAISE EXCEPTION 'Dated balance and closing date required'; END IF;
 IF EXISTS(SELECT 1 FROM public.imports WHERE account_id=a.id AND status IN ('uploading','queued','processing','needs_review')) THEN RAISE EXCEPTION 'Finish pending import review before reconciliation'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions WHERE account_id=a.id AND date<=p_as_of AND ledger_status='posted' AND (NOT is_reconciled OR legacy_needs_review)) THEN RAISE EXCEPTION 'Review pending or legacy transactions first'; END IF;
 SELECT a.balance+coalesce(sum(amount),0) INTO balance FROM public.transactions WHERE account_id=a.id AND date>a.balance_date AND date<=p_as_of AND ledger_status='posted' AND is_reconciled;
 INSERT INTO public.account_reconciliations(workspace_id,account_id,as_of,expected_balance,calculated_balance,difference,confirmed_by) VALUES(a.workspace_id,a.id,p_as_of,p_expected,balance,p_expected-balance,p_actor) RETURNING * INTO result;
 RETURN to_jsonb(result)||jsonb_build_object('reconciled',result.difference=0);
END $$;
CREATE OR REPLACE FUNCTION public.set_reserve(p_actor uuid,p_workspace uuid,p_values jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.emergency_reserve; BEGIN
 IF NOT public.actor_can_access_workspace(p_actor,p_workspace,true) THEN RAISE EXCEPTION 'Unauthorized workspace'; END IF;
 PERFORM 1 FROM public.workspaces WHERE id=p_workspace FOR UPDATE;
 INSERT INTO public.emergency_reserve(user_id,workspace_id) VALUES(p_actor,p_workspace) ON CONFLICT(workspace_id) DO NOTHING;
 UPDATE public.emergency_reserve SET current_amount=coalesce((p_values->>'current_amount')::numeric,current_amount),target_amount=coalesce((p_values->>'target_amount')::numeric,target_amount),monthly_income=coalesce((p_values->>'monthly_income')::numeric,monthly_income),months_target=coalesce((p_values->>'months_target')::integer,months_target) WHERE workspace_id=p_workspace RETURNING * INTO r;
 RETURN to_jsonb(r)||jsonb_build_object('measurement','manual');
END $$;
CREATE OR REPLACE FUNCTION public.confirm_recurring_occurrence(p_actor uuid,p_recurring uuid,p_due date,p_transaction uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.recurring_bills;t public.transactions;v public.recurring_occurrences; BEGIN
 SELECT * INTO r FROM public.recurring_bills WHERE id=p_recurring FOR UPDATE;
 IF r.id IS NULL OR NOT public.actor_can_access_workspace(p_actor,r.workspace_id,true) THEN RAISE EXCEPTION 'Unauthorized recurring bill'; END IF;
 IF p_transaction IS NULL THEN RAISE EXCEPTION 'Link a posted payment to confirm the occurrence'; END IF;
 IF p_transaction IS NOT NULL THEN
  SELECT * INTO t FROM public.transactions WHERE id=p_transaction FOR UPDATE;
  IF t.id IS NULL OR t.workspace_id<>r.workspace_id OR t.type<>r.type OR abs(t.amount)<>r.amount OR t.ledger_status<>'posted' OR NOT t.is_reconciled OR t.legacy_needs_review OR t.economic_kind<>'standard' OR t.date>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Payment does not match recurring bill'; END IF;
  IF EXISTS(SELECT 1 FROM public.recurring_occurrences WHERE transaction_id=p_transaction AND (recurring_id<>p_recurring OR due_date<>p_due)) THEN RAISE EXCEPTION 'Payment already assigned'; END IF;
 END IF;
 INSERT INTO public.recurring_occurrences(workspace_id,recurring_id,due_date,paid_at,transaction_id,confirmed_by) VALUES(r.workspace_id,r.id,p_due,now(),p_transaction,p_actor)
 ON CONFLICT(recurring_id,due_date) DO UPDATE SET paid_at=now(),transaction_id=excluded.transaction_id,confirmed_by=p_actor RETURNING * INTO v;
 RETURN to_jsonb(v);
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY['create_workspace','create_workspace_invitation','accept_workspace_invitation','change_workspace_member','complete_onboarding','create_transfer','link_transfer','void_transaction','reconcile_account','set_reserve','confirm_recurring_occurrence']) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
