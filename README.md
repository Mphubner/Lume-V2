# Lume Fin

React/Vite frontend, Express API e Supabase/PostgreSQL. Esta revisão prepara a validação privada de finanças pessoais, familiares e empresariais. A publicação depende das verificações do [procedimento de implantação](docs/DEPLOYMENT.md).

As correções, testes e pendências dos 26 achados estão na [matriz de implementação](docs/IMPLEMENTATION_STATUS.md).

O fluxo novo usa email/senha e confirmação; Google fica desabilitado por padrão. A configuração do envio está em [acesso por email](docs/AUTH_EMAIL_SETUP.md). O planejador em `/planejador` calcula cenários verificáveis mesmo sem provedor de IA.

## Desenvolvimento

Use Node 22.20 ou posterior compatível. Instale dependências com `npm ci` dentro de `backend` e `frontend`. Copie `backend/.env.example` para `.env` e configure um projeto Supabase de homologação; nenhuma chave de serviço pode ter prefixo `VITE_`.

No frontend, configure `VITE_API_URL`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Execute `npm run dev` em cada pasta. A ausência de credenciais apresenta indisponibilidade; não autentica um usuário demonstrativo.

## Verificação

Em `backend`: `npm test` e `npm run test:sql`. O segundo comando usa exclusivamente PostgreSQL local, cria um banco descartável, aplica o schema base e todas as migrações, verifica reaplicação e executa cenários financeiros transacionais. Configure `TEST_DATABASE_URL` quando a porta local não for 55439.

Execute também `npm run test:sql -- --legacy-schema`: usa a estrutura antiga observada no projeto real em 20/10/2026, sem dados pessoais. Para inspecionar metadados de um destino, configure `DATABASE_URL` e execute `node scripts/inspect-supabase.mjs` em `backend`; a transação é somente de leitura.

Em `frontend`: `npm run lint`, `npm test` e `npm run build`. A automação em `.github/workflows/quality.yml` executa os principais bloqueios de qualidade em cada alteração.

## Regras financeiras

- Saldo da conta = saldo-base datado + movimentos posteriores à data-base. A data-base representa o fechamento do dia. Data desconhecida mantém saldo desconhecido.
- Receita e despesa usam lançamentos revisados e contabilizados. Importação em revisão fica em uma área separada e não altera os indicadores.
- Transferências internas têm duas pontas, contas distintas e o mesmo espaço financeiro. A compra no cartão é despesa; o pagamento da fatura é movimentação interna pareada. Aporte no principal de investimento não é consumo.
- Estorno aponta para lançamento original válido, na mesma conta. Não vira receita nova nem excede o valor original.
- Família compartilha um espaço com aceite individual e papéis de titular, editor ou leitor. PF e PJ são espaços diferentes; aportes, retiradas e empréstimos exigem classificação explícita.
- Planejamento de dívidas, metas e reserva contém valores declarados manualmente. Eles não criam dinheiro nas contas.
- Recorrência vencida permanece pendente até haver vínculo com pagamento válido. Projeções são estimativas baseadas nas recorrências cadastradas.

Consulte [implantação e recuperação](docs/DEPLOYMENT.md) antes de usar dados reais. Os scripts SQL antigos foram desativados e preservados como comentários; não os reaplique.
