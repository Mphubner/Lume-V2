# Implementação da auditoria — 20/10/2026

Base auditada: `d430e1b9648531decabdac9ed93a0335c96fe483`. Branch de trabalho: `codex/lume-integridade-20261019`.

## Resultado

O código da validação privada foi corrigido e passou nas verificações locais descritas abaixo. A publicação continua dependendo de homologação integrada, revisão dos dados antigos e implantação coordenada. Não houve push, deploy ou migração no Supabase real nesta execução. O relatório de auditoria original, em `D:\Lume\auditoria-2026-10-18`, permanece como evidência do estado anterior.

Foram retomados os agentes de frontend, importação, regras financeiras/IA e revisão independente. As fronteiras e contratos foram discutidos entre eles. A revisão independente identificou três regressões concretas, corrigidas e incorporadas aos testes: estorno de original inválido, pareamento de transferência com estorno dependente e metadados estrangeiros alcançados por referências legadas.

## Correções por achado

| Achado | Alteração aplicada | Evidência ou limite |
|---|---|---|
| LF01 — build e lint | Sintaxe dos gráficos corrigida, carregamento de páginas corrigido e dependências atualizadas. | Build e lint aprovados; teste visual encontrou e corrigiu uma página inicialmente em branco. |
| LF02 — Pix externo neutralizado | Texto da descrição não altera sinal nem comprova transferência. Neutralização exige duas pontas compatíveis e autorizadas. | Testes de parser, API e SQL; Pix externo de 70 permanece receita. |
| LF03 — saldos inconsistentes | Saldo-base de fechamento com data explícita; soma dos movimentos posteriores; consolidação por workspace autorizado. | Cenário 1.000 → 500/200/300 aprovado. Saldo desconhecido permanece desconhecido. |
| LF04 — arquivos alterados/incompletos | Parser CSV/TXT com locale, aspas e colunas; OFX com FITID; PDF e XLSX com validação integral. Conversão CSV/OFX e processamento persistente em partes. | Formato ambíguo falha sem publicar parcialmente. OCR local é opcional e só aparece disponível com os motores instalados. |
| LF05 — deduplicação | Identidade de documento/linha, identidade bancária por conta e conflitos de conteúdo; repetição legítima exige decisão explícita quando ambígua. | Reenvio, FITID, repetição legítima, aprovação repetida e rollback testados. |
| LF06 — sucesso sem persistência | Fila persistente, fonte privada, lease, retomada, quotas e retorno de erro quando o banco falha. | Worker testado com reinício, perda de resposta, interrupção e corrupção da fonte. Storage remoto ainda não homologado. |
| LF07 — revisão sem barreira | Linhas ficam em `import_rows`; aprovação integral exige linhas explícitas, fonte/período e abertura/fechamento conferidos. | Staging não altera ledger. Aprovação é transacional, auditada e idempotente. |
| LF08 — eventos compostos | Transferências e fatura têm par; principal de investimento separado; estorno vinculado e limitado; anulação preserva histórico. | Compra 100 + pagamento 100 gera despesa 100; estorno 20 reduz a 80. Originais com estornos dependentes são protegidos. |
| LF09 — erro vira dado demonstrativo | Autenticação sem demo; erros explícitos, recuperação e distinção entre indisponível e zero. Vencimento não é pagamento. | Testes API e navegador com falha sintética e recuperação. |
| LF10 — família/PJ | Workspaces com membership e papéis, convites individuais e seleção explícita. | PF/PJ têm perímetros separados. Aporte/retirada/empréstimo exigem classificação própria. |
| LF11 — IA inconsistente | Fonte financeira comum, fatos com origem e versão, resposta estrita e opt-in para provedor externo. | Fallback determinístico rastreável; testes rejeitam números/categorias inventados e saída truncada. Sem chamada real ao provedor. |
| LF12 — saúde e projeção | Cobertura e meses efetivamente conciliados; recorrências respeitam frequência e calendário; caixa separado de investimentos/reserva declarada. | Dados insuficientes não geram nota. Projeção contém apenas recorrências cadastradas; feriados não são modelados. |
| LF13 — corte em 1.000 linhas | Agregados monetários no PostgreSQL e paginação dos cadastros/linhas de revisão. | SQL valida 1.205 lançamentos; frontend valida revisão de 251 linhas. |
| LF14 — autoridade no corpo | Schemas estritos, servidor define autoridade, RPC de mutação com membership sob lock, FKs no mesmo espaço e auditoria na transação. | Testes HTTP contra campos protegidos, conta estrangeira, leitor e falha de persistência. |
| LF15 — RLS permissiva | DML direto revogado; SELECT com escopo; planos públicos apenas para leitura; auditoria e perfis protegidos. | Testes executam papel `authenticated`, tentam promoção, alteração de preço, auditoria forjada e impersonação de ator. |
| LF16 — categoria global | Categoria de usuário permanece privada; catálogo oficial exige usuário e workspace nulos. | Escrita global não é aceita; enriquecimento de relações não revela categorias estrangeiras legadas. |
| LF17 — identidade de terceiro | Senha definida pelo proprietário e criação de e-mail confirmado foram removidas. Convite tem token com hash, validade, papel e aceite. | Destinatário/e-mail confirmado/reutilização/revogação testados. Link é compartilhado pelo responsável; envio de e-mail não é anunciado. |
| LF18 — migrations e recuperação | Seis migrações versionadas, checksum, lock, transação por versão, plano sem escrita, confirmação de destino e backup para aplicação remota. Scripts antigos desativados. | Banco descartável recriado e migrações reaplicadas sem alterações. Restauração do projeto real ainda depende de ensaio. |
| LF19 — dependências | Bibliotecas vulneráveis/obsoletas removidas ou atualizadas; lockfiles mantidos. | `npm audit`: zero vulnerabilidades reportadas em backend e frontend nesta data. |
| LF20 — promessas/privacidade | Landing sem métricas fictícias, termos/privacidade marcados como rascunho, exportação e pedidos de privacidade com estado real. Planilha retirada do novo versionamento. | Identidade jurídica, canal oficial e política final exigem decisão do responsável. Arquivo local preservado; histórico Git anterior não foi reescrito. |
| LF21 — planos e cobrança | Catálogo único no banco; preço mensal BRL conferido no provedor; Checkout hospedado, intenção durável, eventos idempotentes e cancelamento no fim do período. | Cobrança desativada por padrão. Sandbox, portal e regras comerciais completas de quotas/entitlements exigem homologação antes de ativação. |
| LF22 — onboarding | Criação da primeira conta e conclusão do perfil em uma transação; repetição reutiliza a conta. | Testes SQL idempotentes e teste UI de falha sem conclusão falsa. |
| LF23 — patrimônio fictício | Investimento representado por conta e principal transferido; metas, dívidas e reserva identificadas como declarações manuais. | Não se cria ativo a partir de despesa. Não há promessa de carteira a mercado ou rentabilidade real. |
| LF24 — confiança/UX | Cobertura, origem, estado, saldo desconhecido, ações de recuperação, foco de modal, rótulos de campos e revisão completa. | Navegador desktop/mobile aprovado nos fluxos cobertos; acessibilidade completa e todos os bancos/layouts ainda não certificados. |
| LF25 — conexão bancária incompleta | Emissão de tokens e webhook sem ingestão foram desativados; capacidade indisponível é explícita. | Sincronização Pluggy não foi implementada como produto operacional. Requer vínculo de titularidade, webhook confiável, staging e homologação próprios. |
| LF26 — cache/identidade | Cache limpo ao trocar identidade/espaço; respostas atrasadas descartadas; consulta carrega workspace explícito; mutações invalidam dados. | Testes cobrem logout, mudança de sessão, `getSession` fora de ordem e contexto consolidado. |

## Verificações realizadas

| Verificação | Resultado |
|---|---|
| `npm --prefix backend test` | 60 testes aprovados. |
| `npm --prefix frontend test` | 26 testes aprovados. |
| `npm --prefix backend run test:sql` | Schema inicial + seis migrações + reaplicação/checksum; 21 verificações financeiras, 39 de operações, 10 de permissões e suíte de importação aprovadas. |
| `npm --prefix frontend run lint` | Zero erros e avisos. |
| `npm --prefix frontend run build` | Aprovado. Aviso remanescente: módulo ApexCharts com aproximadamente 514 KB minificado. |
| `npm audit` nas duas pastas | Zero vulnerabilidades reportadas. |
| Playwright local | Landing, login, cadastro e painel renderizados; validação de senhas, transição de tela, estado parcial, falha de API e recuperação aprovados. |
| Diff check | Sem erros de whitespace após normalização. |

Validação de navegador em `http://127.0.0.1:5173`, Chromium, 1440×1000 e 390×844. O plugin Browser não estava disponível; foi usado Playwright com Chromium já instalado. As APIs foram simuladas com dados sintéticos e identidade fictícia local. Não houve autenticação Supabase real. As mensagens de console observadas na simulação de falha eram as respostas 503 deliberadas; não houve erro de execução inexplicado ou overlay. Capturas e logs locais ficam em `D:\Lume\validacao-2026-10-20`, fora do código distribuído.

## Pendências para uso real

O piloto precisa passar pelo [roteiro de implantação](DEPLOYMENT.md), usando homologação separada, antes de receber as finanças do casal e da empresa. As correções não recalculam automaticamente a intenção econômica de um histórico ambíguo: contas sem data-base, transferências antigas e classificações inconsistentes precisam ser revistas contra os extratos.

GTM público continua condicionado a autenticação/Storage/convites integrados, restauração de backup, execução na hospedagem efetiva, atendimento de privacidade, termos finais e homologação comercial. Cobrança e conexão bancária não devem ser apresentadas como prontas apenas porque há código ou uma tela.

Limites preservados: documentos em revisões abertas não são apagados automaticamente; OCR depende de Tesseract/Poppler locais e ainda exige homologação no host; notificações externas de e-mail/WhatsApp não são enviadas; projeções não incorporam automaticamente gastos futuros não cadastrados, feriados ou carteira a mercado; cálculos derivados atuais não reconstruem o cadastro histórico. Confirmação/recuperação de autenticação usam o Supabase e dependem de SMTP próprio para destinatários fora da equipe.
