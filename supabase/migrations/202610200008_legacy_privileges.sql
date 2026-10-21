BEGIN;
-- Production's pre-existing subscriptions table lacks this identity constraint.
-- Do not delete/merge duplicated subscriptions: an existing duplicate aborts the
-- migration for explicit reconciliation before any rollout can proceed.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_id_unique ON public.subscriptions(stripe_subscription_id);
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK(status IN ('active','past_due','canceled','unpaid','incomplete','incomplete_expired','trialing','paused'));
-- The inspected production schema also contains this old, unscoped cache.
-- Keep all its records, but do not expose obsolete financial narratives to clients.
DO $$ DECLARE p record; BEGIN
 IF to_regclass('public.ai_insights_cache') IS NOT NULL THEN
  ALTER TABLE public.ai_insights_cache ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.ai_insights_cache FROM PUBLIC,anon,authenticated;
  GRANT ALL ON public.ai_insights_cache TO service_role;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ai_insights_cache' LOOP
   EXECUTE format('DROP POLICY %I ON public.ai_insights_cache',p.policyname);
  END LOOP;
 END IF;
END $$;

-- RLS does not govern TRUNCATE. Remove inherited PUBLIC grants as well as the
-- legacy broad anon/authenticated grants, then restore the supported read API.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','families','family_members','accounts','transactions','categories','recurring_bills','debts','goals','budgets','ai_rules','emergency_reserve','health_scores','imports','platform_settings','audit_log','plans','workspaces','workspace_members','workspace_invitations','recurring_occurrences','account_reconciliations','subscriptions','payment_events','notifications','privacy_requests','checkout_intents','page_views','import_rows','import_chunks','import_extract_pages','lume_schema_migrations'] LOOP
  IF to_regclass(format('public.%I',t)) IS NOT NULL THEN
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
   EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END IF;
 END LOOP;
END $$;
GRANT SELECT ON public.accounts,public.transactions,public.recurring_bills,public.debts,public.goals,public.budgets,public.ai_rules,public.emergency_reserve,public.health_scores,public.imports,public.recurring_occurrences,public.account_reconciliations,public.profiles,public.workspaces,public.workspace_members,public.categories,public.import_rows TO authenticated;
GRANT SELECT ON public.plans TO anon,authenticated;
-- Existing policies are retained: workspace access and active plans still apply.
CREATE OR REPLACE FUNCTION public.application_readiness() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('schema_version','202610200008','workspaces',true,'staging',true,'financial_facts',true,'durable_import_chunks',true,'legacy_privileges_hardened',true)
$$;
REVOKE ALL ON FUNCTION public.application_readiness() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.application_readiness() TO service_role;
COMMIT;
