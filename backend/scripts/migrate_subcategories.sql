-- ATENÇÃO: Essa query irá REINICIAR suas categorias para o modelo MÃE -> SUBCATEGORIAS ARRAY,
-- respeitando a fundo a sua nova árvore estrutural detalhada (16 categorias principais).
-- Cole no SQL Editor do Supabase e clique em RUN.

DELETE FROM "public"."categories";

INSERT INTO "public"."categories" ("user_id", "name", "type", "is_system", "nature", "color", "icon", "subcategories") VALUES
-- GASTOS
('Alimentação', 'expense', true, 'variable', '#eab308', '🍕', ARRAY['Delivery e Lanches', 'Mercado (Despensa)', 'Padaria/Café', 'Restaurantes e Bares']),
('Assinaturas', 'expense', true, 'fixed', '#22c55e', '💻', ARRAY['Clubes de Assinatura', 'Softwares', 'Streaming (Netflix/Spotify)']),
('Contas Residenciais', 'expense', true, 'fixed', '#f97316', '⚡', ARRAY['Água', 'Energia', 'Gás', 'Internet/TV']),
('Cuidados Pessoais', 'expense', true, 'variable', '#d946ef', '🧴', ARRAY['Academia', 'Cosméticos/Perfumaria', 'Salão/Barbearia']),
('Educação', 'expense', true, 'variable', '#6366f1', '📚', ARRAY['Cursos Extras', 'Livros/Material', 'Mensalidades']),
('Financeiro', 'expense', true, 'fixed', '#64748b', '💰', ARRAY['Gastos Não identificados', 'Juros/Empréstimos', 'Seguros de Vida', 'Tarifas Bancárias']),
('Investimentos', 'expense', true, 'future', '#0ea5e9', '📈', ARRAY['Ações/FIIs', 'Previdência', 'Renda Fixa', 'Reserva de Emergência']),
('Lazer', 'expense', true, 'variable', '#8b5cf6', '🎭', ARRAY['Cinema/Shows', 'Eventos Sociais', 'Hobbies', 'Viagens']),
('Moradia', 'expense', true, 'fixed', '#f43f5e', '🏠', ARRAY['Aluguel/Prestação', 'Condomínio', 'Decoração', 'IPTU', 'Manutenção/Reparos']),
('Pets', 'expense', true, 'variable', '#f59e0b', '🐾', ARRAY['Banho e Tosa', 'Ração', 'Veterinário']),
('Presentes', 'expense', true, 'variable', '#ef4444', '🎁', ARRAY['Datas Comemorativas', 'Doações', 'Mimos']),
('Saúde', 'expense', true, 'fixed', '#ec4899', '🏥', ARRAY['Consultas/Exames', 'Farmácia', 'Plano de Saúde', 'Terapia']),
('Transporte', 'expense', true, 'variable', '#3b82f6', '🚗', ARRAY['App (Uber/99)', 'Combustível', 'Manutenção', 'Ônibus/Metrô', 'Seguro e IPVA']),
('Vestuário', 'expense', true, 'variable', '#10b981', '👕', ARRAY['Acessórios', 'Calçados', 'Roupas']),

-- ENTRADAS E OUTROS
('Entradas', 'income', true, 'income', '#22c55e', '📥', ARRAY['Dividendos', 'Freelance', 'Pró-labore', 'Rendas', 'Salário']),
('Ajustes', 'both', true, 'adjustments', '#94a3b8', '🛠️', ARRAY['Ajuste de Saldo', 'Estorno', 'Imprevistos', 'Reembolso']);
