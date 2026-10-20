-- Retired: retained as commented history only. Use backend/scripts/migrate.mjs.
DO $$ BEGIN RAISE EXCEPTION 'Script legado desativado. Use migrações versionadas após backup.'; END $$;
-- LEGACY: -- 1. Adicionando tipagem ('family' ou 'business') na estrutura existente de famílias
-- LEGACY: ALTER TABLE public.families
-- LEGACY: ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'family';
-- LEGACY:
-- LEGACY: -- 2. Permitindo que lançamentos saibam exatamente de qual arquivo PDF vieram
-- LEGACY: -- (Possibilitando o modal "Conferência de Extratos Lume AI")
-- LEGACY: ALTER TABLE public.transactions
-- LEGACY: ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.imports(id) ON DELETE CASCADE;
