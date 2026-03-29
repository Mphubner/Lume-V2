-- ===========================================
-- Tabela "plans" para o Lume SaaS
-- Execute via Supabase Dashboard > SQL Editor
-- ===========================================

CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_accounts INTEGER NOT NULL DEFAULT 1,
  max_transactions INTEGER NOT NULL DEFAULT 50,  -- -1 = ilimitado
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  stripe_price_id TEXT,             -- ID do preço no Stripe (price_xxxx)
  stripe_product_id TEXT,           -- ID do produto no Stripe (prod_xxxx)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security: leitura pública (planos são visíveis a todos), escrita apenas via service_role  
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Todos podem ler planos ativos (necessário para onboarding)
CREATE POLICY "Planos visíveis para todos" ON public.plans
  FOR SELECT USING (true);

-- Apenas service_role (backend) pode inserir/atualizar/deletar
CREATE POLICY "Backend pode gerenciar planos" ON public.plans
  FOR ALL USING (true) WITH CHECK (true);

-- Inserir os 3 planos padrão
INSERT INTO public.plans (id, name, price, max_accounts, max_transactions, features, is_active)
VALUES 
  ('free', 'Trial', 0, 1, 50, '["Categorias básicas", "1 conta"]'::jsonb, true),
  ('individual', 'Individual', 40, 5, -1, '["Dashboard completo", "Importação de extratos", "Categorização automática", "Metas financeiras", "Relatórios detalhados"]'::jsonb, true),
  ('familia', 'Família', 70, 10, -1, '["Tudo do Individual", "Até 2 membros", "Gestão familiar compartilhada", "Divisão de despesas", "Relatórios por membro"]'::jsonb, true)
ON CONFLICT (id) DO NOTHING;
