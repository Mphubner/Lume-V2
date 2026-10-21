-- Run through scripts/migrate.mjs after a verified backup. Never deletes financial history.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.profiles(id),
  name text NOT NULL, kind text NOT NULL CHECK(kind IN ('personal','family','business')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_personal_workspace ON public.workspaces(owner_id) WHERE kind='personal';
CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE, user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('owner','editor','viewer')), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,user_id)
);
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS type text DEFAULT 'family';
INSERT INTO public.workspaces(id,owner_id,name,kind)
 SELECT id,owner_id,name,CASE WHEN type='business' THEN 'business' ELSE 'family' END FROM public.families ON CONFLICT(id) DO NOTHING;
INSERT INTO public.workspaces(owner_id,name,kind)
 SELECT id,'Pessoal','personal' FROM public.profiles p WHERE NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.owner_id=p.id AND w.kind='personal');
INSERT INTO public.workspaces(owner_id,name,kind)
 SELECT id,'Empresa','business' FROM public.profiles p WHERE NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.owner_id=p.id AND w.kind='business');
INSERT INTO public.workspace_members(workspace_id,user_id,role) SELECT id,owner_id,'owner' FROM public.workspaces ON CONFLICT DO NOTHING;
INSERT INTO public.workspace_members(workspace_id,user_id,role)
 SELECT family_id,user_id,CASE WHEN role='owner' THEN 'owner' ELSE 'editor' END FROM public.family_members ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_workspace(p_workspace uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=auth.uid()
  AND (NOT p_write OR role IN ('owner','editor')))
$$;
CREATE OR REPLACE FUNCTION public.actor_can_access_workspace(p_actor uuid,p_workspace uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=p_actor
  AND (NOT p_write OR role IN ('owner','editor')))
$$;
REVOKE ALL ON FUNCTION public.actor_can_access_workspace(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.actor_can_access_workspace(uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.can_access_workspace(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_workspace(uuid,boolean) TO authenticated,service_role;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['accounts','transactions','categories','recurring_bills','debts','goals','budgets','ai_rules','emergency_reserve','health_scores','imports'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id)',t);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(workspace_id)',t||'_workspace_idx',t);
 END LOOP;
END $$;
UPDATE public.accounts a SET workspace_id=COALESCE(a.family_id,(SELECT w.id FROM public.workspaces w WHERE w.owner_id=a.user_id AND w.kind=a.account_type ORDER BY w.created_at,w.id LIMIT 1)) WHERE workspace_id IS NULL;
UPDATE public.transactions t SET workspace_id=COALESCE(t.family_id,(SELECT w.id FROM public.workspaces w WHERE w.owner_id=t.user_id AND w.kind=t.account_type ORDER BY w.created_at,w.id LIMIT 1)) WHERE workspace_id IS NULL;
UPDATE public.recurring_bills r SET workspace_id=COALESCE(r.family_id,(SELECT w.id FROM public.workspaces w WHERE w.owner_id=r.user_id AND w.kind='personal')) WHERE workspace_id IS NULL;
UPDATE public.imports i SET workspace_id=COALESCE((SELECT a.workspace_id FROM public.accounts a WHERE a.id=i.account_id AND a.user_id=i.user_id),(SELECT w.id FROM public.workspaces w WHERE w.owner_id=i.user_id AND w.kind='personal')) WHERE workspace_id IS NULL;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['categories','debts','goals','budgets','ai_rules','emergency_reserve','health_scores'] LOOP
  EXECUTE format('UPDATE public.%I r SET workspace_id=w.id FROM public.workspaces w WHERE r.workspace_id IS NULL AND w.owner_id=r.user_id AND w.kind=''personal''',t);
 END LOOP;
END $$;
-- Private records that were incorrectly promoted remain private, without deletion.
UPDATE public.categories SET is_system=false WHERE user_id IS NOT NULL AND is_system=true;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS nature text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS group_name text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS subcategories text[] DEFAULT '{}';
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS balance_date date;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BRL' CHECK(currency='BRL');
-- NULL historical balance_date is intentional: no guessed opening date is treated as reconciled.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_reconciled boolean NOT NULL DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS ai_confidence double precision;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS import_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS ledger_status text NOT NULL DEFAULT 'posted' CHECK(ledger_status IN ('posted','voided'));
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS economic_kind text NOT NULL DEFAULT 'standard' CHECK(economic_kind IN ('standard','transfer','card_payment','investment_principal','refund','loan_principal','owner_contribution','owner_withdrawal'));
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.transactions(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS legacy_needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source_key text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS transfer_group_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
-- Keep inconsistent historical links, but quarantine them until compared with source documents.
UPDATE public.transactions t SET legacy_needs_review=true WHERE
 (account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=t.account_id AND a.workspace_id=t.workspace_id))
 OR (category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categories c WHERE c.id=t.category_id AND
   (c.workspace_id=t.workspace_id OR (c.is_system AND c.user_id IS NULL AND c.workspace_id IS NULL))))
 OR t.type='transfer' OR t.is_internal_transfer;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_source_key_unique ON public.transactions(account_id,source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_workspace_date ON public.transactions(workspace_id,date,id);
CREATE INDEX IF NOT EXISTS transactions_reversal_idx ON public.transactions(reversal_of);
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND contype='f' AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.transactions'::regclass AND attname='import_id')]::smallint[] LOOP
  EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I',c.conname);
 END LOOP;
 ALTER TABLE public.transactions ADD CONSTRAINT transactions_import_history_fk FOREIGN KEY(import_id) REFERENCES public.imports(id) ON DELETE RESTRICT NOT VALID;
END $$;
ALTER TABLE public.recurring_bills ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.recurring_bills ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'expense' CHECK(type IN ('income','expense'));
ALTER TABLE public.emergency_reserve ADD COLUMN IF NOT EXISTS months_target integer NOT NULL DEFAULT 6 CHECK(months_target BETWEEN 1 AND 60);
ALTER TABLE public.health_scores ADD COLUMN IF NOT EXISTS coverage jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS needs_insight_recalc boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_insight_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS objective text;
ALTER TABLE public.ai_rules ADD COLUMN IF NOT EXISTS subcategory text;
CREATE TABLE IF NOT EXISTS public.recurring_occurrences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 recurring_id uuid NOT NULL REFERENCES public.recurring_bills(id) ON DELETE CASCADE, due_date date NOT NULL,
 paid_at timestamptz, transaction_id uuid REFERENCES public.transactions(id), confirmed_by uuid REFERENCES public.profiles(id),
 UNIQUE(recurring_id,due_date)
);
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 email text NOT NULL,role text NOT NULL CHECK(role IN ('editor','viewer')), token_hash text UNIQUE NOT NULL,
 invited_by uuid NOT NULL REFERENCES public.profiles(id),expires_at timestamptz NOT NULL,
 accepted_at timestamptz,revoked_at timestamptz,created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.account_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 account_id uuid NOT NULL REFERENCES public.accounts(id), as_of date NOT NULL, expected_balance numeric(15,2) NOT NULL,
 calculated_balance numeric(15,2) NOT NULL, difference numeric(15,2) NOT NULL, confirmed_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.plans (
 id text PRIMARY KEY,name text NOT NULL,price numeric(10,2) NOT NULL,max_accounts integer,max_transactions integer,
 features jsonb DEFAULT '[]',is_active boolean DEFAULT true
);
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS interval text NOT NULL DEFAULT 'month';
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_members integer NOT NULL DEFAULT 1;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_price_id text;
INSERT INTO public.plans(id,name,price,max_accounts,max_transactions,max_members,features,is_active)
 VALUES('individual','Individual',39.90,10,10000,1,'["Contas e importação revisada","Conciliação e planejamento"]',true),
 ('family','Família',69.90,30,30000,5,'["Recursos individuais","Espaço compartilhado com permissões"]',true)
 ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),
 stripe_subscription_id text UNIQUE NOT NULL,stripe_customer_id text,plan_id text REFERENCES public.plans(id),status text NOT NULL,
 current_period_start timestamptz,current_period_end timestamptz,cancel_at_period_end boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payment_events (
 id text PRIMARY KEY,type text NOT NULL,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
 attempts integer NOT NULL DEFAULT 0,last_error text,created_at timestamptz DEFAULT now(),processed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),title text NOT NULL,message text NOT NULL,
 type text DEFAULT 'info',is_read boolean DEFAULT false,created_at timestamptz DEFAULT now()
);

-- Single supported financial write boundary is the authenticated backend.
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','families','family_members','accounts','transactions','categories','recurring_bills','debts','goals','budgets','ai_rules','emergency_reserve','health_scores','imports','platform_settings','audit_log','plans','workspaces','workspace_members','workspace_invitations','recurring_occurrences','account_reconciliations','subscriptions','payment_events','notifications'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['accounts','transactions','recurring_bills','debts','goals','budgets','ai_rules','emergency_reserve','health_scores','imports','recurring_occurrences','account_reconciliations'] LOOP
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY workspace_read ON public.%I FOR SELECT TO authenticated USING(public.can_access_workspace(workspace_id))',t);
 END LOOP;
END $$;
GRANT SELECT ON public.profiles,public.workspaces,public.workspace_members,public.categories TO authenticated;
CREATE POLICY profile_read ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid());
CREATE POLICY workspace_read ON public.workspaces FOR SELECT TO authenticated USING(public.can_access_workspace(id));
CREATE POLICY membership_read ON public.workspace_members FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY category_read ON public.categories FOR SELECT TO authenticated USING((is_system AND user_id IS NULL AND workspace_id IS NULL) OR public.can_access_workspace(workspace_id));
GRANT SELECT ON public.plans TO anon,authenticated;
CREATE POLICY active_plans_read ON public.plans FOR SELECT TO anon,authenticated USING(is_active);

CREATE OR REPLACE FUNCTION public.validate_financial_record() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE ref record; BEGIN
 IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id) THEN
  RAISE EXCEPTION 'Record owner and workspace are immutable';
 END IF;
 IF NEW.workspace_id IS NULL THEN RAISE EXCEPTION 'Workspace required'; END IF;
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE user_id=NEW.user_id AND workspace_id=NEW.workspace_id) THEN
  RAISE EXCEPTION 'Record owner must belong to workspace';
 END IF;
 IF TG_TABLE_NAME='transactions' THEN
  IF NEW.account_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=NEW.account_id AND workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Account must belong to workspace'; END IF;
  IF NEW.member_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id) AND NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE user_id=NEW.member_id AND workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Member must belong to workspace'; END IF;
  IF NEW.amount=0 OR NEW.amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF NEW.economic_kind='standard' AND ((NEW.type='income' AND NEW.amount<0) OR (NEW.type='expense' AND NEW.amount>0)) THEN RAISE EXCEPTION 'Direction must match transaction type'; END IF;
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.transactions WHERE reversal_of=OLD.id AND ledger_status='posted')
   AND ROW(NEW.amount,NEW.type,NEW.economic_kind,NEW.account_id,NEW.date,NEW.ledger_status) IS DISTINCT FROM ROW(OLD.amount,OLD.type,OLD.economic_kind,OLD.account_id,OLD.date,OLD.ledger_status) THEN
   RAISE EXCEPTION 'Reverse dependent refunds first';
  END IF;
  IF NEW.reversal_of IS NOT NULL AND NEW.economic_kind<>'refund' THEN RAISE EXCEPTION 'Reversal reference requires refund kind'; END IF;
  IF NEW.reversal_of IS NOT NULL AND NEW.ledger_status='posted' THEN
   SELECT * INTO ref FROM public.transactions WHERE id=NEW.reversal_of FOR UPDATE;
   IF ref.id IS NULL OR ref.workspace_id<>NEW.workspace_id OR ref.account_id<>NEW.account_id OR ref.amount*NEW.amount>=0 OR ref.id=NEW.id
    OR ref.ledger_status<>'posted' OR NOT ref.is_reconciled OR ref.legacy_needs_review OR ref.economic_kind<>'standard'
    OR ref.type NOT IN ('income','expense') OR ref.is_internal_transfer OR ref.linked_transaction_id IS NOT NULL
    OR NEW.date<ref.date THEN RAISE EXCEPTION 'Invalid reversal reference'; END IF;
   IF abs(NEW.amount)+(SELECT coalesce(sum(abs(amount)),0) FROM public.transactions WHERE reversal_of=NEW.reversal_of AND id<>NEW.id AND ledger_status='posted')>abs(ref.amount) THEN RAISE EXCEPTION 'Refund exceeds original amount'; END IF;
  ELSIF NEW.economic_kind='refund' AND NEW.reversal_of IS NULL THEN RAISE EXCEPTION 'Refund requires original transaction'; END IF;
 END IF;
 IF TG_TABLE_NAME IN ('transactions','recurring_bills','budgets','ai_rules') THEN
  IF NEW.category_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.categories c WHERE c.id=NEW.category_id AND (c.workspace_id=NEW.workspace_id OR(c.is_system AND c.user_id IS NULL AND c.workspace_id IS NULL))) THEN RAISE EXCEPTION 'Category must belong to workspace or official catalog'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['accounts','transactions','recurring_bills','debts','goals','budgets','ai_rules','emergency_reserve','health_scores','imports'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS validate_financial_record ON public.%I',t);
  EXECUTE format('CREATE TRIGGER validate_financial_record BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validate_financial_record()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE w uuid; BEGIN
 INSERT INTO public.profiles(id,email,full_name) VALUES(NEW.id,NEW.email,COALESCE(NEW.raw_user_meta_data->>'full_name',split_part(NEW.email,'@',1)));
 INSERT INTO public.workspaces(owner_id,name,kind) VALUES(NEW.id,'Pessoal','personal') RETURNING id INTO w;
 INSERT INTO public.workspace_members VALUES(w,NEW.id,'owner',now());
 INSERT INTO public.workspaces(owner_id,name,kind) VALUES(NEW.id,'Empresa','business') RETURNING id INTO w;
 INSERT INTO public.workspace_members VALUES(w,NEW.id,'owner',now());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
COMMIT;
