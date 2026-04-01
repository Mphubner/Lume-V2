-- ATENÇÃO: Essa query irá REINICIAR suas categorias para o modelo MÃE -> SUBCATEGORIAS ARRAY.
-- Ela irá APAGAR todas as categorias atuais e criar a nova estrutura oficial e limpa.
-- Como você irá apagar e reimportar as transações, isso é 100% seguro.
-- Cole tudo isso no SQL Editor do Supabase e clique em RUN.

DELETE FROM "public"."categories";

INSERT INTO "public"."categories" ("name", "type", "is_system", "nature", "color", "icon", "subcategories") VALUES
-- 1. SAÚDE & BEM-ESTAR
('Saúde & Bem-Estar', 'expense', true, 'fixed', '#ec4899', '🏥', ARRAY['Academia', 'Consultas/Exames', 'Cosméticos/Perfumaria', 'Cuidados Pessoais', 'Farmácia', 'Plano de Saúde', 'Salão/Barbearia', 'Saúde', 'Terapia']),

-- 2. ESTILO DE VIDA
('Estilo de Vida', 'expense', true, 'variable', '#8b5cf6', '🎭', ARRAY['Acessórios', 'Assinaturas', 'Calçados', 'Cinema/Shows', 'Clubes de Assinatura', 'Cursos Extras', 'Educação', 'Eventos Sociais', 'Hobbies', 'Lazer', 'Livros/Material', 'Mensalidades', 'Roupas', 'Softwares', 'Streaming', 'Vestuário', 'Viagens']),

-- 3. FINANÇAS
('Finanças', 'both', true, 'fixed', '#64748b', '💰', ARRAY['Ações/FIIs', 'Entrada não Identificada', 'Financeiro', 'Gastos Não identificados', 'Investimentos', 'Juros/Empréstimos', 'Previdência', 'Renda Fixa', 'Reserva de Emergência', 'Seguros de Vida', 'Tarifas Bancárias']),

-- 4. HABITAÇÃO
('Habitação', 'expense', true, 'fixed', '#f43f5e', '🏠', ARRAY['Água', 'Aluguel/Prestação', 'Condomínio', 'Contas Residenciais', 'Decoração', 'Energia', 'Gás', 'Internet/TV', 'IPTU', 'Manutenção/Reparos', 'Moradia']),

-- 5. ALIMENTAÇÃO
('Alimentação', 'expense', true, 'variable', '#eab308', '🍕', ARRAY['Alimentação', 'Delivery e Lanches', 'Mercado', 'Padaria/Café', 'Restaurantes e Bares']),

-- 6. MOBILIDADE
('Mobilidade', 'expense', true, 'variable', '#3b82f6', '🚗', ARRAY['App Uber/99', 'Combustível', 'Manutenção', 'Ônibus/Metrô', 'Seguro e IPVA', 'Transporte']),

-- 7. FAMÍLIA & PETS
('Família & Pets', 'expense', true, 'variable', '#f59e0b', '🐾', ARRAY['Banho e Tosa', 'Datas Comemorativas', 'Doações', 'Mimos', 'Pets', 'Presentes', 'Ração', 'Veterinário']),

-- 8. ENTRADAS
('Entradas', 'income', true, 'income', '#22c55e', '📥', ARRAY['Dividendos', 'Freelance', 'Pró-labore', 'Rendas', 'Salário']),

-- 9. SISTEMA (Ajustes)
('Sistema', 'both', true, 'adjustments', '#94a3b8', '🛠️', ARRAY['Ajuste de Saldo', 'Ajustes', 'Estorno', 'Imprevistos', 'Reembolso']);
