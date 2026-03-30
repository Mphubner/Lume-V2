-- Migration: Adapting Categories for Psychological Hierarchy & Nested Groups
-- -----------------------------------------------------------------------------------------------------------------------------

-- 1. Create New Columns
ALTER TABLE categories ADD COLUMN IF NOT EXISTS nature VARCHAR(50); -- 'fixed', 'variable', 'future', 'income', 'adjustments'
ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_name VARCHAR(100); -- 'Habitação', 'Alimentação', 'Mobilidade', etc
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE CASCADE;

-- 2. Optional: We map any existing 'Outros' or generic categories to 'Imprevistos' to avoid breaking foreign keys
UPDATE categories SET name = 'Imprevistos', icon = '🚨', group_name = 'Sistema', nature = 'variable' 
WHERE name = 'Outros' AND is_system = true;

-- Note: In a real system we would loop and re-parent existing system rows, or delete unused system ones.
-- For safety we will only delete unused exact matches if they are empty of transactions, OR we can just purge and CASCADE if this is early beta.
-- We will assume early beta, or we'll perform a soft un-system.
-- To be safe with existing User Data: we will remove is_system from all existing to "detach" them rather than deleting 
-- to prevent constraints errors on transactions.
UPDATE categories SET is_system = false WHERE is_system = true AND name != 'Imprevistos';

-- 3. Insert The New Premium Hierarchy (Parents first)
INSERT INTO categories (id, name, type, is_system, nature, group_name, icon, color) VALUES
('b1000000-0000-0000-0000-000000000001', 'Moradia', 'expense', true, 'fixed', 'Habitação', '🏠', '#f43f5e'),
('b1000000-0000-0000-0000-000000000002', 'Contas Residenciais', 'expense', true, 'fixed', 'Habitação', '⚡', '#f97316'),
('b1000000-0000-0000-0000-000000000003', 'Alimentação', 'expense', true, 'variable', 'Alimentação', '🍕', '#eab308'),
('b1000000-0000-0000-0000-000000000004', 'Transporte', 'expense', true, 'fixed', 'Mobilidade', '🚗', '#3b82f6'),
('b1000000-0000-0000-0000-000000000005', 'Saúde', 'expense', true, 'fixed', 'Saúde & Bem-estar', '🏥', '#ec4899'),
('b1000000-0000-0000-0000-000000000006', 'Cuidados Pessoais', 'expense', true, 'variable', 'Saúde & Bem-estar', '🏋️', '#d946ef'),
('b1000000-0000-0000-0000-000000000007', 'Lazer', 'expense', true, 'variable', 'Estilo de Vida', '🎭', '#8b5cf6'),
('b1000000-0000-0000-0000-000000000008', 'Educação', 'expense', true, 'variable', 'Estilo de Vida', '📚', '#6366f1'),
('b1000000-0000-0000-0000-000000000009', 'Assinaturas', 'expense', true, 'fixed', 'Estilo de Vida', '💻', '#22c55e'),
('b1000000-0000-0000-0000-000000000010', 'Vestuário', 'expense', true, 'variable', 'Estilo de Vida', '👕', '#10b981'),
('b1000000-0000-0000-0000-000000000011', 'Pets', 'expense', true, 'variable', 'Família & Pets', '🐾', '#f59e0b'),
('b1000000-0000-0000-0000-000000000012', 'Presentes', 'expense', true, 'variable', 'Família & Pets', '🎁', '#ef4444'),
('b1000000-0000-0000-0000-000000000013', 'Financeiro', 'expense', true, 'fixed', 'Finanças', '💰', '#64748b'),
('b1000000-0000-0000-0000-000000000014', 'Investimentos', 'expense', true, 'future', 'Finanças', '📈', '#0ea5e9'),
('b1000000-0000-0000-0000-000000000015', 'Rendas', 'income', true, 'income', 'Entradas', '📥', '#22c55e'),
('b1000000-0000-0000-0000-000000000016', 'Ajustes', 'both', true, 'adjustments', 'Sistema', '🛠️', '#94a3b8')
ON CONFLICT DO NOTHING;

-- 4. Insert Subcategories
INSERT INTO categories (name, type, is_system, nature, group_name, icon, color, parent_id) VALUES
-- Moradia
('Aluguel/Prestação', 'expense', true, 'fixed', 'Habitação', '🏠', '#f43f5e', 'b1000000-0000-0000-0000-000000000001'),
('Condomínio', 'expense', true, 'fixed', 'Habitação', '🏢', '#f43f5e', 'b1000000-0000-0000-0000-000000000001'),
('IPTU', 'expense', true, 'fixed', 'Habitação', '📄', '#f43f5e', 'b1000000-0000-0000-0000-000000000001'),
('Manutenção/Reparos', 'expense', true, 'variable', 'Habitação', '🔧', '#f43f5e', 'b1000000-0000-0000-0000-000000000001'),
('Decoração', 'expense', true, 'variable', 'Habitação', '🖼️', '#f43f5e', 'b1000000-0000-0000-0000-000000000001'),

-- Contas Residenciais
('Energia', 'expense', true, 'fixed', 'Habitação', '⚡', '#f97316', 'b1000000-0000-0000-0000-000000000002'),
('Água', 'expense', true, 'fixed', 'Habitação', '💧', '#f97316', 'b1000000-0000-0000-0000-000000000002'),
('Gás', 'expense', true, 'fixed', 'Habitação', '🔥', '#f97316', 'b1000000-0000-0000-0000-000000000002'),
('Internet/TV', 'expense', true, 'fixed', 'Habitação', '🌐', '#f97316', 'b1000000-0000-0000-0000-000000000002'),

-- Alimentação
('Mercado (Despensa)', 'expense', true, 'variable', 'Alimentação', '🛒', '#eab308', 'b1000000-0000-0000-0000-000000000003'),
('Restaurantes e Bares', 'expense', true, 'variable', 'Alimentação', '🍽️', '#eab308', 'b1000000-0000-0000-0000-000000000003'),
('Delivery e Lanches', 'expense', true, 'variable', 'Alimentação', '🍔', '#eab308', 'b1000000-0000-0000-0000-000000000003'),
('Padaria/Café', 'expense', true, 'variable', 'Alimentação', '☕', '#eab308', 'b1000000-0000-0000-0000-000000000003'),

-- Transporte
('Combustível', 'expense', true, 'variable', 'Mobilidade', '⛽', '#3b82f6', 'b1000000-0000-0000-0000-000000000004'),
('App (Uber/99)', 'expense', true, 'variable', 'Mobilidade', '📱', '#3b82f6', 'b1000000-0000-0000-0000-000000000004'),
('Ônibus/Metrô', 'expense', true, 'variable', 'Mobilidade', '🚌', '#3b82f6', 'b1000000-0000-0000-0000-000000000004'),
('Seguro e IPVA', 'expense', true, 'fixed', 'Mobilidade', '🛡️', '#3b82f6', 'b1000000-0000-0000-0000-000000000004'),
('Manutenção', 'expense', true, 'variable', 'Mobilidade', '⚙️', '#3b82f6', 'b1000000-0000-0000-0000-000000000004'),

-- Saúde
('Farmácia', 'expense', true, 'variable', 'Saúde & Bem-estar', '💊', '#ec4899', 'b1000000-0000-0000-0000-000000000005'),
('Consultas/Exames', 'expense', true, 'variable', 'Saúde & Bem-estar', '🩺', '#ec4899', 'b1000000-0000-0000-0000-000000000005'),
('Plano de Saúde', 'expense', true, 'fixed', 'Saúde & Bem-estar', '🏥', '#ec4899', 'b1000000-0000-0000-0000-000000000005'),
('Terapia', 'expense', true, 'variable', 'Saúde & Bem-estar', '🛋️', '#ec4899', 'b1000000-0000-0000-0000-000000000005'),

-- Cuidados Pessoais 
('Academia', 'expense', true, 'fixed', 'Saúde & Bem-estar', '🏋️', '#d946ef', 'b1000000-0000-0000-0000-000000000006'),
('Salão/Barbearia', 'expense', true, 'variable', 'Saúde & Bem-estar', '✂️', '#d946ef', 'b1000000-0000-0000-0000-000000000006'),
('Cosméticos/Perfumaria', 'expense', true, 'variable', 'Saúde & Bem-estar', '🧴', '#d946ef', 'b1000000-0000-0000-0000-000000000006'),

-- Lazer
('Cinema/Shows', 'expense', true, 'variable', 'Estilo de Vida', '🎫', '#8b5cf6', 'b1000000-0000-0000-0000-000000000007'),
('Viagens', 'expense', true, 'variable', 'Estilo de Vida', '✈️', '#8b5cf6', 'b1000000-0000-0000-0000-000000000007'),
('Hobbies', 'expense', true, 'variable', 'Estilo de Vida', '🎨', '#8b5cf6', 'b1000000-0000-0000-0000-000000000007'),
('Eventos Sociais', 'expense', true, 'variable', 'Estilo de Vida', '🍻', '#8b5cf6', 'b1000000-0000-0000-0000-000000000007'),

-- Educação
('Mensalidades', 'expense', true, 'fixed', 'Estilo de Vida', '🎓', '#6366f1', 'b1000000-0000-0000-0000-000000000008'),
('Cursos Extras', 'expense', true, 'variable', 'Estilo de Vida', '💻', '#6366f1', 'b1000000-0000-0000-0000-000000000008'),
('Livros/Material', 'expense', true, 'variable', 'Estilo de Vida', '📖', '#6366f1', 'b1000000-0000-0000-0000-000000000008'),

-- Assinaturas
('Streaming (Netflix/Spotify)', 'expense', true, 'fixed', 'Estilo de Vida', '📺', '#22c55e', 'b1000000-0000-0000-0000-000000000009'),
('Clubes de Assinatura', 'expense', true, 'fixed', 'Estilo de Vida', '📦', '#22c55e', 'b1000000-0000-0000-0000-000000000009'),
('Softwares', 'expense', true, 'fixed', 'Estilo de Vida', '💻', '#22c55e', 'b1000000-0000-0000-0000-000000000009'),

-- Vestuario
('Roupas', 'expense', true, 'variable', 'Estilo de Vida', '👕', '#10b981', 'b1000000-0000-0000-0000-000000000010'),
('Calçados', 'expense', true, 'variable', 'Estilo de Vida', '👟', '#10b981', 'b1000000-0000-0000-0000-000000000010'),
('Acessórios', 'expense', true, 'variable', 'Estilo de Vida', '🕶️', '#10b981', 'b1000000-0000-0000-0000-000000000010'),

-- Pets
('Ração', 'expense', true, 'variable', 'Família & Pets', '🦴', '#f59e0b', 'b1000000-0000-0000-0000-000000000011'),
('Veterinário', 'expense', true, 'variable', 'Família & Pets', '⚕️', '#f59e0b', 'b1000000-0000-0000-0000-000000000011'),
('Banho e Tosa', 'expense', true, 'variable', 'Família & Pets', '🛁', '#f59e0b', 'b1000000-0000-0000-0000-000000000011'),

-- Presentes
('Datas Comemorativas', 'expense', true, 'variable', 'Família & Pets', '🎂', '#ef4444', 'b1000000-0000-0000-0000-000000000012'),
('Doações', 'expense', true, 'variable', 'Família & Pets', '🤝', '#ef4444', 'b1000000-0000-0000-0000-000000000012'),
('Mimos', 'expense', true, 'variable', 'Família & Pets', '🛍️', '#ef4444', 'b1000000-0000-0000-0000-000000000012'),

-- Financeiro
('Tarifas Bancárias', 'expense', true, 'fixed', 'Finanças', '💳', '#64748b', 'b1000000-0000-0000-0000-000000000013'),
('Juros/Empréstimos', 'expense', true, 'fixed', 'Finanças', '📉', '#64748b', 'b1000000-0000-0000-0000-000000000013'),
('Seguros de Vida', 'expense', true, 'fixed', 'Finanças', '🛡️', '#64748b', 'b1000000-0000-0000-0000-000000000013'),

-- Investimentos
('Ações/FIIs', 'expense', true, 'future', 'Finanças', '📊', '#0ea5e9', 'b1000000-0000-0000-0000-000000000014'),
('Renda Fixa', 'expense', true, 'future', 'Finanças', '🏦', '#0ea5e9', 'b1000000-0000-0000-0000-000000000014'),
('Previdência', 'expense', true, 'future', 'Finanças', '👴', '#0ea5e9', 'b1000000-0000-0000-0000-000000000014'),
('Reserva de Emergência', 'expense', true, 'future', 'Finanças', '🛡️', '#0ea5e9', 'b1000000-0000-0000-0000-000000000014'),

-- Rendas 
('Salário', 'income', true, 'income', 'Entradas', '💵', '#22c55e', 'b1000000-0000-0000-0000-000000000015'),
('Freelance', 'income', true, 'income', 'Entradas', '💻', '#22c55e', 'b1000000-0000-0000-0000-000000000015'),
('Pró-labore', 'income', true, 'income', 'Entradas', '🏢', '#22c55e', 'b1000000-0000-0000-0000-000000000015'),
('Dividendos', 'income', true, 'income', 'Entradas', '📈', '#22c55e', 'b1000000-0000-0000-0000-000000000015'),

-- Ajustes
('Ajuste de Saldo', 'both', true, 'adjustments', 'Sistema', '⚖️', '#94a3b8', 'b1000000-0000-0000-0000-000000000016'),
('Estorno', 'income', true, 'adjustments', 'Sistema', '↩️', '#94a3b8', 'b1000000-0000-0000-0000-000000000016'),
('Reembolso', 'income', true, 'adjustments', 'Sistema', '🔄', '#94a3b8', 'b1000000-0000-0000-0000-000000000016'),
('Imprevistos', 'expense', true, 'variable', 'Sistema', '🚨', '#94a3b8', 'b1000000-0000-0000-0000-000000000016');
