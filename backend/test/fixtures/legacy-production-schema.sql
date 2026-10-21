-- Production catalogue observed 2026-10-20T22:02:29.844206+00:00. STRUCTURE ONLY; no financial/user rows.
-- Auth and Storage are supplied by the local bootstrap. Trigger stub is replaced by migration 001.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE public."accounts" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid NOT NULL,
 "family_id" uuid,
 "name" text NOT NULL,
 "type" text NOT NULL,
 "institution" text,
 "account_type" text DEFAULT 'personal'::text,
 "balance" numeric(15,2) DEFAULT 0,
 "credit_limit" numeric(15,2),
 "closing_day" integer,
 "due_day" integer,
 "color" text DEFAULT '#d4a843'::text,
 "icon" text DEFAULT '🏦'::text,
 "is_active" boolean DEFAULT true,
 "created_at" timestamp with time zone DEFAULT now(),
 "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."ai_insights_cache" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL,
 "payload" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."ai_rules" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid NOT NULL,
 "keyword" text NOT NULL,
 "category_id" uuid NOT NULL,
 "transaction_type" text,
 "is_active" boolean DEFAULT true,
 "usage_count" integer DEFAULT 0,
 "created_at" timestamp with time zone DEFAULT now(),
 "updated_at" timestamp with time zone DEFAULT now(),
 "subcategory" text
);
CREATE TABLE public."audit_log" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid,
 "action" text NOT NULL,
 "entity_type" text,
 "entity_id" uuid,
 "details" jsonb,
 "ip_address" text,
 "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."budgets" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid NOT NULL,
 "category_id" uuid,
 "month" integer NOT NULL,
 "year" integer NOT NULL,
 "planned_amount" numeric(15,2) NOT NULL,
 "spent_amount" numeric(15,2) DEFAULT 0,
 "ai_generated" boolean DEFAULT false,
 "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."categories" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid,
 "name" text NOT NULL,
 "icon" text DEFAULT '📦'::text,
 "color" text DEFAULT '#94a3b8'::text,
 "type" text DEFAULT 'expense'::text,
 "is_system" boolean DEFAULT false,
 "parent_id" uuid,
 "created_at" timestamp with time zone DEFAULT now(),
 "nature" character varying(50),
 "group_name" character varying(100),
 "subcategories" text[] DEFAULT ARRAY[]::text[]
);
CREATE TABLE public."debts" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid NOT NULL,
 "name" text NOT NULL,
 "type" text NOT NULL,
 "creditor" text NOT NULL,
 "start_date" date DEFAULT CURRENT_DATE,
 "original_amount" numeric(15,2) NOT NULL,
 "current_balance" numeric(15,2),
 "interest_rate" numeric(8,4) DEFAULT 0,
 "total_installments" integer DEFAULT 0,
 "installment_amount" numeric(15,2) DEFAULT 0,
 "due_day" integer,
 "status" text DEFAULT 'active'::text,
 "description" text,
 "created_at" timestamp with time zone DEFAULT now(),
 "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."emergency_reserve" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid NOT NULL,
 "target_amount" numeric(15,2) DEFAULT 0,
 "current_amount" numeric(15,2) DEFAULT 0,
 "monthly_income" numeric(15,2) DEFAULT 0,
 "created_at" timestamp with time zone DEFAULT now(),
 "updated_at" timestamp with time zone DEFAULT now(),
 "months_target" integer DEFAULT 6
);
CREATE TABLE public."families" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "name" text DEFAULT 'Minha Família'::text NOT NULL,
 "owner_id" uuid NOT NULL,
 "created_at" timestamp with time zone DEFAULT now(),
 "type" character varying(50) DEFAULT 'family'::character varying
);
CREATE TABLE public."family_members" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "family_id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "role" text DEFAULT 'member'::text,
 "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."goals" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid NOT NULL,
 "name" text NOT NULL,
 "target_amount" numeric(15,2) NOT NULL,
 "current_amount" numeric(15,2) DEFAULT 0,
 "deadline" date,
 "icon" text DEFAULT '🎯'::text,
 "color" text DEFAULT '#d4a843'::text,
 "status" text DEFAULT 'active'::text,
 "created_at" timestamp with time zone DEFAULT now(),
 "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."health_scores" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid NOT NULL,
 "total_score" integer NOT NULL,
 "grade" text NOT NULL,
 "savings_rate_score" integer DEFAULT 0,
 "debt_management_score" integer DEFAULT 0,
 "emergency_reserve_score" integer DEFAULT 0,
 "diversification_score" integer DEFAULT 0,
 "bill_payment_score" integer DEFAULT 0,
 "spending_control_score" integer DEFAULT 0,
 "calculated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."imports" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid NOT NULL,
 "account_id" uuid,
 "filename" text NOT NULL,
 "file_type" text NOT NULL,
 "total_transactions" integer DEFAULT 0,
 "imported_transactions" integer DEFAULT 0,
 "duplicates_skipped" integer DEFAULT 0,
 "status" text DEFAULT 'processing'::text,
 "error_message" text,
 "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."notifications" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL,
 "title" text NOT NULL,
 "message" text,
 "type" text DEFAULT 'info'::text,
 "is_read" boolean DEFAULT false,
 "link" text,
 "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE public."page_views" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "page" text NOT NULL,
 "utm_source" text,
 "utm_medium" text,
 "utm_campaign" text,
 "device_type" text,
 "visitor_id" text,
 "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."plans" (
 "id" text NOT NULL,
 "name" text NOT NULL,
 "price" numeric(10,2) DEFAULT 0 NOT NULL,
 "max_accounts" integer DEFAULT 1 NOT NULL,
 "max_transactions" integer DEFAULT 50 NOT NULL,
 "features" jsonb DEFAULT '[]'::jsonb,
 "is_active" boolean DEFAULT true,
 "stripe_price_id" text,
 "stripe_product_id" text,
 "created_at" timestamp with time zone DEFAULT now(),
 "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."platform_settings" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "key" text NOT NULL,
 "value" text,
 "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."profiles" (
 "id" uuid NOT NULL,
 "full_name" text,
 "email" text NOT NULL,
 "phone" text,
 "cpf" text,
 "avatar_url" text,
 "role" text DEFAULT 'user'::text,
 "cep" text,
 "street" text,
 "street_number" text,
 "complement" text,
 "neighborhood" text,
 "city" text,
 "state" text,
 "plan" text DEFAULT 'free'::text,
 "plan_status" text DEFAULT 'inactive'::text,
 "plan_started_at" timestamp with time zone,
 "plan_expires_at" timestamp with time zone,
 "granted_by" uuid,
 "onboarding_completed" boolean DEFAULT false,
 "created_at" timestamp with time zone DEFAULT now(),
 "updated_at" timestamp with time zone DEFAULT now(),
 "needs_insight_recalc" boolean DEFAULT true,
 "last_insight_at" timestamp with time zone
);
CREATE TABLE public."recurring_bills" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid NOT NULL,
 "family_id" uuid,
 "category_id" uuid,
 "name" text NOT NULL,
 "amount" numeric(15,2) NOT NULL,
 "due_day" integer NOT NULL,
 "recurrence" text DEFAULT 'monthly'::text,
 "status" text DEFAULT 'active'::text,
 "is_auto_debit" boolean DEFAULT false,
 "description" text,
 "adjust_to_business_day" boolean DEFAULT true,
 "created_at" timestamp with time zone DEFAULT now(),
 "updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE public."subscriptions" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL,
 "stripe_customer_id" text,
 "stripe_subscription_id" text,
 "plan_id" text NOT NULL,
 "status" text NOT NULL,
 "current_period_start" timestamp with time zone,
 "current_period_end" timestamp with time zone,
 "cancel_at_period_end" boolean DEFAULT false,
 "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
 "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE public."transactions" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "user_id" uuid NOT NULL,
 "family_id" uuid,
 "account_id" uuid,
 "category_id" uuid,
 "member_id" uuid,
 "description" text NOT NULL,
 "amount" numeric(15,2) NOT NULL,
 "type" text NOT NULL,
 "date" date DEFAULT CURRENT_DATE NOT NULL,
 "subcategory" text,
 "payment_method" text,
 "account_type" text DEFAULT 'personal'::text,
 "origin" text DEFAULT 'manual'::text,
 "is_internal_transfer" boolean DEFAULT false,
 "linked_transaction_id" uuid,
 "import_hash" text,
 "raw_description" text,
 "notes" text,
 "is_confirmed" boolean DEFAULT true,
 "created_at" timestamp with time zone DEFAULT now(),
 "updated_at" timestamp with time zone DEFAULT now(),
 "import_id" uuid,
 "is_reconciled" boolean DEFAULT true,
 "ai_confidence" double precision
);
ALTER TABLE public."accounts" ADD CONSTRAINT "accounts_account_type_check" CHECK ((account_type = ANY (ARRAY['personal'::text, 'business'::text])));
ALTER TABLE public."accounts" ADD CONSTRAINT "accounts_pkey" PRIMARY KEY (id);
ALTER TABLE public."accounts" ADD CONSTRAINT "accounts_type_check" CHECK ((type = ANY (ARRAY['checking'::text, 'savings'::text, 'credit_card'::text, 'investment'::text, 'wallet'::text])));
ALTER TABLE public."ai_insights_cache" ADD CONSTRAINT "ai_insights_cache_pkey" PRIMARY KEY (id);
ALTER TABLE public."ai_rules" ADD CONSTRAINT "ai_rules_pkey" PRIMARY KEY (id);
ALTER TABLE public."ai_rules" ADD CONSTRAINT "ai_rules_transaction_type_check" CHECK ((transaction_type = ANY (ARRAY['income'::text, 'expense'::text])));
ALTER TABLE public."ai_rules" ADD CONSTRAINT "ai_rules_user_keyword_unique" UNIQUE (user_id, keyword);
ALTER TABLE public."audit_log" ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."budgets" ADD CONSTRAINT "budgets_month_check" CHECK (((month >= 1) AND (month <= 12)));
ALTER TABLE public."budgets" ADD CONSTRAINT "budgets_pkey" PRIMARY KEY (id);
ALTER TABLE public."budgets" ADD CONSTRAINT "budgets_user_id_category_id_month_year_key" UNIQUE (user_id, category_id, month, year);
ALTER TABLE public."categories" ADD CONSTRAINT "categories_pkey" PRIMARY KEY (id);
ALTER TABLE public."categories" ADD CONSTRAINT "categories_type_check" CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text, 'both'::text])));
ALTER TABLE public."debts" ADD CONSTRAINT "debts_due_day_check" CHECK (((due_day >= 1) AND (due_day <= 31)));
ALTER TABLE public."debts" ADD CONSTRAINT "debts_pkey" PRIMARY KEY (id);
ALTER TABLE public."debts" ADD CONSTRAINT "debts_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paid'::text, 'negotiating'::text])));
ALTER TABLE public."debts" ADD CONSTRAINT "debts_type_check" CHECK ((type = ANY (ARRAY['personal_loan'::text, 'financing'::text, 'credit_card_debt'::text, 'overdraft'::text, 'other'::text])));
ALTER TABLE public."emergency_reserve" ADD CONSTRAINT "emergency_reserve_pkey" PRIMARY KEY (id);
ALTER TABLE public."emergency_reserve" ADD CONSTRAINT "emergency_reserve_user_id_key" UNIQUE (user_id);
ALTER TABLE public."families" ADD CONSTRAINT "families_pkey" PRIMARY KEY (id);
ALTER TABLE public."family_members" ADD CONSTRAINT "family_members_family_id_user_id_key" UNIQUE (family_id, user_id);
ALTER TABLE public."family_members" ADD CONSTRAINT "family_members_pkey" PRIMARY KEY (id);
ALTER TABLE public."family_members" ADD CONSTRAINT "family_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text])));
ALTER TABLE public."goals" ADD CONSTRAINT "goals_pkey" PRIMARY KEY (id);
ALTER TABLE public."goals" ADD CONSTRAINT "goals_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'paused'::text])));
ALTER TABLE public."health_scores" ADD CONSTRAINT "health_scores_pkey" PRIMARY KEY (id);
ALTER TABLE public."health_scores" ADD CONSTRAINT "health_scores_total_score_check" CHECK (((total_score >= 0) AND (total_score <= 100)));
ALTER TABLE public."imports" ADD CONSTRAINT "imports_file_type_check" CHECK ((file_type = ANY (ARRAY['pdf'::text, 'csv'::text, 'xlsx'::text, 'ofx'::text])));
ALTER TABLE public."imports" ADD CONSTRAINT "imports_pkey" PRIMARY KEY (id);
ALTER TABLE public."imports" ADD CONSTRAINT "imports_status_check" CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."page_views" ADD CONSTRAINT "page_views_device_type_check" CHECK ((device_type = ANY (ARRAY['desktop'::text, 'mobile'::text, 'tablet'::text])));
ALTER TABLE public."page_views" ADD CONSTRAINT "page_views_pkey" PRIMARY KEY (id);
ALTER TABLE public."plans" ADD CONSTRAINT "plans_pkey" PRIMARY KEY (id);
ALTER TABLE public."platform_settings" ADD CONSTRAINT "platform_settings_key_key" UNIQUE (key);
ALTER TABLE public."platform_settings" ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_email_key" UNIQUE (email);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_plan_check" CHECK ((plan = ANY (ARRAY['free'::text, 'trial'::text, 'individual'::text, 'family'::text])));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_plan_status_check" CHECK ((plan_status = ANY (ARRAY['inactive'::text, 'active'::text, 'trial'::text, 'cancelled'::text, 'granted'::text])));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text])));
ALTER TABLE public."recurring_bills" ADD CONSTRAINT "recurring_bills_due_day_check" CHECK (((due_day >= 1) AND (due_day <= 31)));
ALTER TABLE public."recurring_bills" ADD CONSTRAINT "recurring_bills_pkey" PRIMARY KEY (id);
ALTER TABLE public."recurring_bills" ADD CONSTRAINT "recurring_bills_recurrence_check" CHECK ((recurrence = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text, 'quarterly'::text, 'yearly'::text])));
ALTER TABLE public."recurring_bills" ADD CONSTRAINT "recurring_bills_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])));
ALTER TABLE public."subscriptions" ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE public."subscriptions" ADD CONSTRAINT "subscriptions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text, 'incomplete'::text, 'incomplete_expired'::text, 'trialing'::text])));
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_account_type_check" CHECK ((account_type = ANY (ARRAY['personal'::text, 'business'::text])));
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_origin_check" CHECK ((origin = ANY (ARRAY['manual'::text, 'import'::text, 'ai'::text, 'recurring'::text, 'whatsapp'::text])));
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_pkey" PRIMARY KEY (id);
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_type_check" CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text])));
ALTER TABLE public."accounts" ADD CONSTRAINT "accounts_family_id_fkey" FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL;
ALTER TABLE public."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."ai_insights_cache" ADD CONSTRAINT "ai_insights_cache_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."ai_rules" ADD CONSTRAINT "ai_rules_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE public."ai_rules" ADD CONSTRAINT "ai_rules_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE public."budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public."categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."debts" ADD CONSTRAINT "debts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."emergency_reserve" ADD CONSTRAINT "emergency_reserve_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."families" ADD CONSTRAINT "families_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."family_members" ADD CONSTRAINT "family_members_family_id_fkey" FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public."family_members" ADD CONSTRAINT "family_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."health_scores" ADD CONSTRAINT "health_scores_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."imports" ADD CONSTRAINT "imports_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE public."imports" ADD CONSTRAINT "imports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES auth.users(id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."recurring_bills" ADD CONSTRAINT "recurring_bills_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public."recurring_bills" ADD CONSTRAINT "recurring_bills_family_id_fkey" FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL;
ALTER TABLE public."recurring_bills" ADD CONSTRAINT "recurring_bills_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_family_id_fkey" FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL;
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_import_id_fkey" FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE;
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_linked_transaction_id_fkey" FOREIGN KEY (linked_transaction_id) REFERENCES transactions(id);
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_member_id_fkey" FOREIGN KEY (member_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX idx_ai_insights_cache_user ON public.ai_insights_cache USING btree (user_id, created_at DESC);
CREATE INDEX idx_families_owner_type ON public.families USING btree (owner_id, type);
CREATE INDEX idx_families_type ON public.families USING btree (type);
CREATE INDEX idx_transactions_category ON public.transactions USING btree (category_id);
CREATE INDEX idx_transactions_import_hash ON public.transactions USING btree (import_hash);
CREATE INDEX idx_transactions_import_id ON public.transactions USING btree (import_id);
CREATE INDEX idx_transactions_pending_review ON public.transactions USING btree (user_id, is_reconciled, origin) WHERE ((is_reconciled = false) AND (origin = 'import'::text));
CREATE INDEX idx_transactions_user_date ON public.transactions USING btree (user_id, date DESC);
CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$BEGIN RETURN NEW; END $$;
ALTER TABLE public."accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own accounts" ON public."accounts" AS PERMISSIVE FOR ALL TO PUBLIC USING (((user_id = auth.uid()) OR (family_id IN ( SELECT family_members.family_id
 FROM family_members
 WHERE (family_members.user_id = auth.uid())))));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."accounts" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."accounts" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."accounts" TO "service_role";
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE public."ai_insights_cache" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own insight cache" ON public."ai_insights_cache" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."ai_insights_cache" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."ai_insights_cache" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."ai_insights_cache" TO "service_role";
ALTER TABLE public."ai_rules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own ai_rules" ON public."ai_rules" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."ai_rules" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."ai_rules" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."ai_rules" TO "service_role";
CREATE TRIGGER update_ai_rules_updated_at BEFORE UPDATE ON public.ai_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit" ON public."audit_log" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
 FROM profiles
 WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
CREATE POLICY "System writes audit" ON public."audit_log" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."audit_log" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."audit_log" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."audit_log" TO "service_role";
ALTER TABLE public."budgets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own budgets" ON public."budgets" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."budgets" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."budgets" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."budgets" TO "service_role";
ALTER TABLE public."categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own categories" ON public."categories" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "Users can view categories" ON public."categories" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((is_system = true) OR (user_id = auth.uid())));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."categories" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."categories" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."categories" TO "service_role";
ALTER TABLE public."debts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own debts" ON public."debts" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."debts" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."debts" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."debts" TO "service_role";
CREATE TRIGGER update_debts_updated_at BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE public."emergency_reserve" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own emergency_reserve" ON public."emergency_reserve" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."emergency_reserve" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."emergency_reserve" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."emergency_reserve" TO "service_role";
CREATE TRIGGER update_emergency_reserve_updated_at BEFORE UPDATE ON public.emergency_reserve FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE public."families" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own families" ON public."families" AS PERMISSIVE FOR ALL TO PUBLIC USING ((owner_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."families" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."families" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."families" TO "service_role";
ALTER TABLE public."family_members" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members see family" ON public."family_members" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."family_members" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."family_members" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."family_members" TO "service_role";
ALTER TABLE public."goals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own goals" ON public."goals" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."goals" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."goals" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."goals" TO "service_role";
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE public."health_scores" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own health_scores" ON public."health_scores" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."health_scores" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."health_scores" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."health_scores" TO "service_role";
ALTER TABLE public."imports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own imports" ON public."imports" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."imports" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."imports" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."imports" TO "service_role";
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can delete own notifications" ON public."notifications" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own notifications" ON public."notifications" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own notifications" ON public."notifications" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own notifications" ON public."notifications" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."notifications" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."notifications" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."notifications" TO "service_role";
ALTER TABLE public."page_views" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read views" ON public."page_views" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
 FROM profiles
 WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
CREATE POLICY "Anyone can track views" ON public."page_views" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."page_views" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."page_views" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."page_views" TO "service_role";
ALTER TABLE public."plans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Backend pode gerenciar planos" ON public."plans" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Planos visíveis para todos" ON public."plans" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."plans" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."plans" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."plans" TO "service_role";
ALTER TABLE public."platform_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage settings" ON public."platform_settings" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
 FROM profiles
 WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."platform_settings" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."platform_settings" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."platform_settings" TO "service_role";
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all profiles" ON public."profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
 FROM profiles profiles_1
 WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = 'admin'::text)))));
CREATE POLICY "Users can update own profile" ON public."profiles" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = id));
CREATE POLICY "Users can view own profile" ON public."profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = id));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."profiles" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."profiles" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."profiles" TO "service_role";
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE public."recurring_bills" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own recurring_bills" ON public."recurring_bills" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."recurring_bills" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."recurring_bills" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."recurring_bills" TO "service_role";
CREATE TRIGGER update_recurring_bills_updated_at BEFORE UPDATE ON public.recurring_bills FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE public."subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscriptions" ON public."subscriptions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."subscriptions" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."subscriptions" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."subscriptions" TO "service_role";
ALTER TABLE public."transactions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own transactions" ON public."transactions" AS PERMISSIVE FOR ALL TO PUBLIC USING (((user_id = auth.uid()) OR (family_id IN ( SELECT family_members.family_id
 FROM family_members
 WHERE (family_members.user_id = auth.uid())))));
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."transactions" TO "anon";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."transactions" TO "authenticated";
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public."transactions" TO "service_role";
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
