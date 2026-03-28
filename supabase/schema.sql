-- =========================================
-- LUME FINANCIAL PLATFORM - Supabase Schema
-- =========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================
-- 1. PROFILES (extends Supabase auth.users)
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  cpf TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  -- Address
  cep TEXT,
  street TEXT,
  street_number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  -- Subscription
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'trial', 'individual', 'family')),
  plan_status TEXT DEFAULT 'inactive' CHECK (plan_status IN ('inactive', 'active', 'trial', 'cancelled', 'granted')),
  plan_started_at TIMESTAMPTZ,
  plan_expires_at TIMESTAMPTZ,
  granted_by UUID REFERENCES auth.users(id),
  -- Metadata
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- 2. FAMILIES
-- =========================================
CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'Minha Família',
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(family_id, user_id)
);

-- =========================================
-- 3. ACCOUNTS (Bank accounts, Credit Cards)
-- =========================================
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  name TEXT NOT NULL, -- Ex: "Nubank", "Itaú CC"
  type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit_card', 'investment', 'wallet')),
  institution TEXT, -- Ex: "Nubank", "Itaú"
  account_type TEXT DEFAULT 'personal' CHECK (account_type IN ('personal', 'business')),
  balance DECIMAL(15,2) DEFAULT 0,
  credit_limit DECIMAL(15,2), -- Only for credit_card
  closing_day INTEGER, -- Credit card closing day (1-31)
  due_day INTEGER, -- Credit card due day (1-31)
  color TEXT DEFAULT '#d4a843',
  icon TEXT DEFAULT '🏦',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- 4. CATEGORIES
-- =========================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📦',
  color TEXT DEFAULT '#94a3b8',
  type TEXT DEFAULT 'expense' CHECK (type IN ('income', 'expense', 'both')),
  is_system BOOLEAN DEFAULT FALSE, -- System categories can't be deleted
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default system categories
INSERT INTO public.categories (name, icon, color, type, is_system) VALUES
  ('Alimentação', '🍔', '#f97316', 'expense', TRUE),
  ('Transporte', '🚗', '#3b82f6', 'expense', TRUE),
  ('Moradia', '🏠', '#8b5cf6', 'expense', TRUE),
  ('Saúde', '💊', '#ef4444', 'expense', TRUE),
  ('Educação', '📚', '#06b6d4', 'expense', TRUE),
  ('Lazer', '🎮', '#ec4899', 'expense', TRUE),
  ('Vestuário', '👕', '#f59e0b', 'expense', TRUE),
  ('Contas e Serviços', '📋', '#64748b', 'expense', TRUE),
  ('Financeiro', '🏦', '#22c55e', 'expense', TRUE),
  ('Outros', '📦', '#94a3b8', 'both', TRUE),
  ('Salário', '💰', '#22c55e', 'income', TRUE),
  ('Freelance', '💻', '#06b6d4', 'income', TRUE),
  ('Investimentos', '📈', '#8b5cf6', 'income', TRUE),
  ('Presentes', '🎁', '#ec4899', 'income', TRUE),
  ('Ajustes', '⚙️', '#64748b', 'both', TRUE);

-- =========================================
-- 5. TRANSACTIONS
-- =========================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  member_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Family member responsible
  
  description TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL, -- Positive = income, Negative = expense
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Metadata
  subcategory TEXT,
  payment_method TEXT, -- pix, debit, credit, cash, boleto, transfer
  account_type TEXT DEFAULT 'personal' CHECK (account_type IN ('personal', 'business')),
  origin TEXT DEFAULT 'manual' CHECK (origin IN ('manual', 'import', 'ai', 'recurring', 'whatsapp')),
  is_internal_transfer BOOLEAN DEFAULT FALSE,
  linked_transaction_id UUID REFERENCES public.transactions(id), -- For paired transfers
  
  -- Import metadata
  import_hash TEXT, -- To prevent duplicate imports
  raw_description TEXT, -- Original bank description before AI processing
  
  notes TEXT,
  is_confirmed BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX idx_transactions_category ON public.transactions(category_id);
CREATE INDEX idx_transactions_import_hash ON public.transactions(import_hash);

-- =========================================
-- 6. RECURRING BILLS (Contas Fixas do Mês)
-- =========================================
CREATE TABLE public.recurring_bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  recurrence TEXT DEFAULT 'monthly' CHECK (recurrence IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_auto_debit BOOLEAN DEFAULT FALSE,
  description TEXT,
  adjust_to_business_day BOOLEAN DEFAULT TRUE, -- Smart adjustment
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- 7. DEBTS (Minhas Pendências)
-- =========================================
CREATE TABLE public.debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal_loan', 'financing', 'credit_card_debt', 'overdraft', 'other')),
  creditor TEXT NOT NULL,
  start_date DATE DEFAULT CURRENT_DATE,
  original_amount DECIMAL(15,2) NOT NULL,
  current_balance DECIMAL(15,2),
  interest_rate DECIMAL(8,4) DEFAULT 0, -- Monthly %
  total_installments INTEGER DEFAULT 0, -- 0 = à vista
  installment_amount DECIMAL(15,2) DEFAULT 0,
  due_day INTEGER CHECK (due_day BETWEEN 1 AND 31),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid', 'negotiating')),
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- 8. GOALS (Metas Financeiras)
-- =========================================
CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  target_amount DECIMAL(15,2) NOT NULL,
  current_amount DECIMAL(15,2) DEFAULT 0,
  deadline DATE,
  icon TEXT DEFAULT '🎯',
  color TEXT DEFAULT '#d4a843',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- 9. BUDGETS (Meu Plano do Mês)
-- =========================================
CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  planned_amount DECIMAL(15,2) NOT NULL,
  spent_amount DECIMAL(15,2) DEFAULT 0,
  ai_generated BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category_id, month, year)
);

-- =========================================
-- 10. AI CATEGORIZATION RULES
-- =========================================
CREATE TABLE public.ai_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  keyword TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  transaction_type TEXT CHECK (transaction_type IN ('income', 'expense')),
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- 11. EMERGENCY RESERVE (Colchão de Segurança)
-- =========================================
CREATE TABLE public.emergency_reserve (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  target_amount DECIMAL(15,2) DEFAULT 0,
  current_amount DECIMAL(15,2) DEFAULT 0,
  monthly_income DECIMAL(15,2) DEFAULT 0, -- To calculate "months of safety"
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- =========================================
-- 12. HEALTH SCORE HISTORY
-- =========================================
CREATE TABLE public.health_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  grade TEXT NOT NULL, -- A, B, C, D, F
  savings_rate_score INTEGER DEFAULT 0,
  debt_management_score INTEGER DEFAULT 0,
  emergency_reserve_score INTEGER DEFAULT 0,
  diversification_score INTEGER DEFAULT 0,
  bill_payment_score INTEGER DEFAULT 0,
  spending_control_score INTEGER DEFAULT 0,
  
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- 13. IMPORT HISTORY
-- =========================================
CREATE TABLE public.imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'csv', 'xlsx', 'ofx')),
  total_transactions INTEGER DEFAULT 0,
  imported_transactions INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- 14. PLATFORM SETTINGS (Admin)
-- =========================================
CREATE TABLE public.platform_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default platform settings
INSERT INTO public.platform_settings (key, value) VALUES
  ('payment_gateway', 'stripe'), -- 'stripe' or 'pagarme'
  ('stripe_public_key', ''),
  ('stripe_secret_key', ''),
  ('pagarme_public_key', ''),
  ('pagarme_secret_key', ''),
  ('ai_provider', 'groq'), -- 'groq', 'huggingface', 'together'
  ('ai_api_key', ''),
  ('ai_model', 'llama-3.3-70b-versatile'),
  ('whatsapp_enabled', 'false'),
  ('trial_days', '14');

-- =========================================
-- 15. AUDIT LOG
-- =========================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- 16. TRAFFIC ANALYTICS (Admin)
-- =========================================
CREATE TABLE public.page_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
  visitor_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- ROW LEVEL SECURITY POLICIES
-- =========================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_reserve ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read/update their own profile. Admins can read all.
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Transactions: Users see own OR family transactions
CREATE POLICY "Users can manage own transactions" ON public.transactions
  FOR ALL USING (
    user_id = auth.uid() OR
    family_id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid())
  );

-- Accounts: Users see own OR family accounts
CREATE POLICY "Users can manage own accounts" ON public.accounts
  FOR ALL USING (
    user_id = auth.uid() OR
    family_id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid())
  );

-- Categories: Users see system categories + own categories
CREATE POLICY "Users can view categories" ON public.categories
  FOR SELECT USING (is_system = TRUE OR user_id = auth.uid());
CREATE POLICY "Users can manage own categories" ON public.categories
  FOR ALL USING (user_id = auth.uid());

-- Generic user-owned policies (recurring_bills, debts, goals, budgets, ai_rules, emergency_reserve, health_scores, imports)
CREATE POLICY "Users own recurring_bills" ON public.recurring_bills FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own debts" ON public.debts FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own goals" ON public.goals FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own budgets" ON public.budgets FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own ai_rules" ON public.ai_rules FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own emergency_reserve" ON public.emergency_reserve FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own health_scores" ON public.health_scores FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own imports" ON public.imports FOR ALL USING (user_id = auth.uid());

-- Platform settings: Only admins
CREATE POLICY "Admins manage settings" ON public.platform_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Audit log: Only admins can read
CREATE POLICY "Admins read audit" ON public.audit_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "System writes audit" ON public.audit_log FOR INSERT WITH CHECK (TRUE);

-- Page views: Anyone can insert, only admins read
CREATE POLICY "Anyone can track views" ON public.page_views FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Admins read views" ON public.page_views FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Families: owners and members
CREATE POLICY "Users own families" ON public.families FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Members see family" ON public.family_members FOR SELECT USING (user_id = auth.uid());

-- =========================================
-- FUNCTIONS & TRIGGERS
-- =========================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_recurring_bills_updated_at BEFORE UPDATE ON public.recurring_bills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_debts_updated_at BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_ai_rules_updated_at BEFORE UPDATE ON public.ai_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_emergency_reserve_updated_at BEFORE UPDATE ON public.emergency_reserve FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
