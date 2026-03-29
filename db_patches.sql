-- 1. Adicionando tipagem ('family' ou 'business') na estrutura existente de famílias
ALTER TABLE public.families 
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'family';

-- 2. Permitindo que lançamentos saibam exatamente de qual arquivo PDF vieram 
-- (Possibilitando o modal "Conferência de Extratos Lume AI")
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.imports(id) ON DELETE CASCADE;
