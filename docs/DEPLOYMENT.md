# Implantação, operação e recuperação

## Condição atual

Em 21/10/2026, as nove migrações foram aplicadas ao projeto Supabase `sqpowenxoqccjigdktwb`, com dispensa expressa de backup pelo responsável porque os registros são de teste. A verificação posterior confirmou schema `202610210009`, nove registros no ledger de migrações, RLS em todas as tabelas públicas e preservação dos 700 lançamentos e dois perfis existentes. As evidências locais desta operação ficam em `D:\Lume\validacao-2026-10-21`.

Em seguida, frontend e API foram publicados no Cloudflare Pages/Koyeb, com código integrado ao `main` até o merge `68dd136f`. A API respondeu `/health` versão 2.1.0 e `/ready` schema 202610210009, com worker habilitado. O planejador respondeu com apresentação assistida pelo Groq em chamada real; a interface autenticada abriu no domínio publicado. Não há migração automática no início do servidor. Os relatórios de 20/10/2026 descrevem a situação anterior à aplicação remota e permanecem como histórico.

A validação com identidades e dados inteiramente sintéticos confirmou transferências de 500 e 300 (saldos 500/200/300, receita e despesa zero), convite, leitor sem escrita, editor com escrita, acesso revogado e recebimento externo de 70. CSV passou pela fila, revisão, aprovação com saldo 1.200 e deduplicação. No Koyeb, com o worker local temporariamente desligado, PNG, PDF escaneado e XLSX extraíram os dois valores esperados, converteram para CSV/OFX e não alteraram o saldo antes da aprovação; um CSV de 1.001 linhas também completou o processamento com partes de até 500 linhas. Os intermediários foram removidos ao publicar a revisão.

Os testes criaram e removeram somente identidades, espaços e arquivos próprios de QA; a conferência final voltou a dois perfis, duas contas e 700 lançamentos, preservando os IDs originais. O ambiente local ficou ativo com OCR e worker, conectado ao mesmo Supabase. Foram aprovados 99 testes backend e 58 frontend, lint/build e a matriz SQL em quatro combinações. O GitHub Actions não iniciou por pendência de faturamento da conta; isso não foi apresentado como CI aprovado. Evidências locais: `live-functional-flows.json`, `cleanup-synthetic-qa.json`, `live-production-formats.json` e `live-ai-default-budget.json`, em `D:\Lume\validacao-2026-10-21`.

O responsável substituiu Gmail por Brevo no Supabase. O primeiro teste teve a entrega rejeitada pelo remetente não verificado. Em 21/10/2026, `contato@lumefin.com.br` foi confirmado pelo responsável, conferido como verificado no Brevo e salvo no Supabase; o domínio estava autenticado com Branded mail, DKIM e DMARC. O novo teste de recuperação foi aceito às 15:34:10 UTC e registrou `Delivered` no Brevo às 12:34 locais. O responsável confirmou o recebimento da mensagem. A abertura do link e a conclusão da recuperação ainda não foram confirmadas; a senha não foi alterada. Confira [a configuração de email](AUTH_EMAIL_SETUP.md). A existência de sessão autenticada e os testes de senha via API não substituem esse aceite.

O frontend e a API também foram iniciados localmente, consumindo esse Supabase real. `/health` e `/ready` responderam 200, com schema `202610210009` e worker habilitado. Os testes financeiros acima usaram autenticação real pela API; o recebimento do email foi confirmado separadamente pelo responsável, e a abertura dos links permanece como aceite humano pendente. Em `D:\Lume`, os atalhos `Iniciar Lume.cmd`, `Verificar Lume.cmd` e `Parar Lume.cmd` acionam os scripts do clone `Lume-V2`.

## Sequência de implantação

1. Confira o projeto de destino, confirmação de email e URLs de retorno para `/auth/callback**`, `/login`, `/dashboard`, `/resetar-senha` e `/convite`. O piloto atual usa o projeto existente com dados de teste, conforme autorização do responsável. Configure SMTP próprio conforme [acesso por email](AUTH_EMAIL_SETUP.md). Separe homologação antes de introduzir finanças reais.
2. Para futuras alterações em bases com dados reais, faça backup do banco e dos objetos Storage e verifique a restauração em projeto separado. Registre horário, responsável, contagens e saldos amostrais. Na operação de 21/10/2026, a dispensa de backup para os dados de teste foi autorizada expressamente; nenhum comprovante fictício foi fornecido ao migrador.
3. Suspenda escritas e uploads durante a janela de migração. Rode `npm run migrate:plan` em `backend`, usando `DATABASE_URL` no ambiente. O plano lista versões pendentes sem aplicar alterações.
4. Antes de aplicar em destino remoto, configure `MIGRATION_BACKUP_PATH` para arquivo local não vazio e `CONFIRM_MIGRATION_TARGET` com `host/nome_do_banco` exatos. Execute `npm run migrate:apply`. A conexão remota exige TLS verificado. Cada migração e seu checksum são registrados na mesma transação, com bloqueio contra execução concorrente.
5. Para um projeto totalmente vazio, o schema inicial `supabase/schema.sql` é apenas uma base: instale-o e aplique todas as migrações antes de disponibilizar qualquer cliente. Em banco existente, não execute esse schema de novo. A migração preserva registros históricos e marca inconsistências para revisão; não inventa saldo-base.
6. Confira funções RPC e privilégios de `anon`, `authenticated` e `service_role`, bucket privado `financial-imports`, limite de 20 MB e todas as migrações até `202610210009`. A versão de `/ready` deve ser `202610210009`. A migração 008 trata permissões do cache legado e a identidade de assinaturas existente no projeto real; duplicidade de ID externo aborta sem apagar registros. A 009 resolve o namespace `extensions` do `pgcrypto` observado no Supabase e protege o ledger de migrações com RLS. Recarregue o cache do PostgREST se necessário. Nunca use chave service-role no frontend.
7. Publique API e frontend compatíveis na mesma janela. Configure `FRONTEND_URL` com origens exatas; `TRUST_PROXY_HOPS` deve corresponder aos proxies reais da hospedagem. `/health` indica processo vivo; `/ready` exige schema esperado, banco acessível e worker sem falhas consecutivas.
8. Execute o roteiro de homologação abaixo antes de liberar a família. Somente depois habilite cobrança ou conexão externa que tenha sido efetivamente homologada.

## Hospedagens existentes

O frontend está no projeto Cloudflare Pages `lumefinance`, conectado a `Mphubner/Lume-V2`, branch de produção `main`. O diretório raiz é `frontend`, o comando de build é `npm run build` e a saída é `dist`. Em 21/10/2026, `NODE_VERSION=22.20.0` foi salvo no painel, substituindo o valor 20 encontrado na inspeção. A alteração da configuração não comprova um novo build publicado. As variáveis `VITE_` entram no bundle durante o build e exigem nova publicação quando alteradas.

| Variável do frontend | Valor/configuração |
| --- | --- |
| `VITE_API_URL` | `https://existing-gretal-lumefin-08b40031.koyeb.app/api` |
| `VITE_SUPABASE_URL` | `https://sqpowenxoqccjigdktwb.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Chave pública do mesmo projeto; nunca `service_role` |
| `VITE_GOOGLE_AUTH_ENABLED` | `false` |

A API existente está no Koyeb, serviço `22b87336-3f76-48d9-8c78-1ebe7f7b5f92`. A inspeção do domínio público anterior à publicação desta revisão respondeu versão 1.0.0 em `/health` e não possuía `/ready`; uma integração Git existente não comprova que o código novo já foi publicado.

Para publicar com OCR, o contexto de build deve ser `backend`, usando seu `Dockerfile`. Construir esse arquivo com o contexto na raiz do repositório quebra os caminhos `COPY`. O processo expõe a porta 5001 por padrão e deve escutar em todas as interfaces no host; `LISTEN_HOST=127.0.0.1` é reservado ao ambiente local. Use o comando `node src/server.js` quando a hospedagem usar buildpack; essa modalidade só disponibiliza OCR se os motores nativos também tiverem sido instalados.

No backend, configure `NODE_ENV=production`, as credenciais Supabase no servidor, `FRONTEND_URL=https://lumefin.com.br` e `IMPORT_WORKER_ENABLED=true`. Caso ofereça também o domínio Pages ao usuário, acrescente sua origem HTTPS exata à lista separada por vírgulas. Não use curingas para previews. Ajuste `TRUST_PROXY_HOPS` somente depois de confirmar a cadeia de proxy do serviço. Mantenha `BILLING_ENABLED=false`. Nenhuma senha SMTP precisa estar no backend: os emails de autenticação são enviados pelo Supabase.

Depois do deploy, confirme `/health` com versão 2.1.0 e `/ready` com schema `202610210009`, status 200 e worker habilitado. Teste diretamente `/auth/callback` e `/planejador` no domínio publicado, além de uma requisição da interface para a API; isso valida também o fallback das rotas e CORS. Cloudflare Pages e Koyeb são implantações independentes: aguarde ambas concluírem, confira o commit publicado e não confunda o sucesso de uma com o sucesso da outra.

Configuração oficial: [build do Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## Provedor de IA

O provedor existente é Groq, distinto de xAI/Grok. O servidor aceita `GROQ_API_KEYS` em CSV ou array JSON, além de `GROQ_API_KEY` e da variável legada `AI_API_KEY`, sem repetir chaves iguais. Use `AI_ENABLED=true`, `AI_PROVIDER=groq` e `AI_MODEL=openai/gpt-oss-20b`, validado em chamadas reais com contexto sintético em 21/10/2026. O antigo `llama-3.3-70b-versatile` respondeu 404 e não constava nos modelos disponíveis da organização. Segredos ficam somente no ambiente do backend. A disponibilidade futura continua dependente do provedor.

As tarefas curtas em GPT-OSS reservam pelo menos 1.200 tokens de conclusão, incluindo o raciocínio, e usam esforço baixo com raciocínio omitido da resposta. Os limites antigos de 100/300 tokens podem truncar o JSON antes da resposta final. A apresentação do planejador foi validada com o orçamento padrão do serviço; os valores continuam calculados pelo domínio determinístico. Referência: [raciocínio no Groq](https://console.groq.com/docs/reasoning).

Credenciais rejeitadas podem avançar para outra chave válida. Um limite de tokens compartilhado pela organização/projeto suspende as tentativas pelo prazo informado pelo provedor; várias chaves da mesma organização não multiplicam a franquia gratuita. Durante essa indisponibilidade, o planejador continua com cálculos e orientação determinísticos, identificando a limitação da apresentação por IA. [Limites oficiais do Groq](https://console.groq.com/docs/rate-limits).

## Roteiro com duas identidades de teste

- Crie usuários A e B, confirme seus e-mails e conclua o cadastro de uma conta. Atualize a página; não deve aparecer uma segunda conta.
- A cria família, convida B e compartilha o link. B aceita autenticado. Conta não confirmada, destinatário diferente, link expirado ou reutilizado devem falhar.
- Teste B como leitor, editor e depois removido. Acesso removido deve falhar também em uma aba já aberta. Troque sessão e espaço sem mostrar dados da identidade anterior.
- Cadastre PicPay 1.000, Inter zero e Mercado Livre zero na mesma data-base; transfira 500 e depois 300. Saldos esperados: 500/200/300, receita zero e despesa zero. Faça um Pix externo recebido de 70: receita 70.
- Registre compra no cartão de 100 e pagamento de fatura de 100. Despesa deve ser 100. Estorno parcial de 20 deve reduzir a despesa a 80.
- Importe CSV, OFX e PDF compatível. Confirme origem, período, todas as linhas e abertura/fechamento. Saldo não muda antes da aprovação. Reenvie, simule perda de resposta e reinicie o worker: nenhum lançamento pode ser duplicado.
- Corrija ou cancele uma revisão, retome-a e reverta um lote já aprovado. Histórico e motivo devem permanecer. Um documento ambíguo deve falhar explicitamente.
- Antes de reverter um lote com transferências, anule o par vinculado; ambas as pontas precisam ficar anuladas. Desvincule pagamentos recorrentes pela ação específica, que preserva o lançamento financeiro. Depois conclua a reversão do lote.
- Compare fechamento de cada conta com extrato bancário. Saldo desconhecido e pendência devem permanecer visíveis até revisão. IA deve identificar fonte, período e limitações, sem completar números ausentes.
- Induza falha da API: deve aparecer erro com tentativa de recuperação; não mostrar saldo demonstrativo, confirmação falsa ou pagamento inventado.

## Cobrança e integrações

`BILLING_ENABLED=false` mantém a cobrança desativada no piloto. O catálogo vem da tabela `plans`; preços Stripe devem ser mensais em BRL e iguais ao catálogo. Checkout é hospedado pelo Stripe. O frontend não coleta dados do cartão.

No sandbox Stripe, valide autorização adicional, expiração de checkout, repetição de eventos, evento fora de ordem, indisponibilidade do banco, cancelamento no fim do período e portal do cliente. Configure webhook com corpo bruto e assinatura. Um resultado de criação desconhecido permanece pendente; não crie nova assinatura. Após 23 horas, concilie a intenção com Stripe antes de permitir nova tentativa. O portal deve ter alterações de plano desabilitadas enquanto o fluxo de troca de preço não for homologado.

Conexão automática Pluggy permanece indisponível: o antigo fluxo não tinha vínculo confiável entre item bancário, usuário e ingestão. Não emita tokens nem aceite webhooks sem implementar e homologar esses controles. Notificações desta revisão são internas; e-mail/WhatsApp não são anunciados como enviados.

Referências técnicas: [Checkout](https://docs.stripe.com/api/checkout/sessions/create), [idempotência](https://docs.stripe.com/api/idempotent_requests) e [webhooks](https://docs.stripe.com/webhooks).

## Arquivos e privacidade

CSV, OFX, TXT tabular e XLSX simples de uma aba preservam sinal, centavos, datas, identidade de origem e multiplicidade. PDF com texto aceita até 60 páginas e exige formato inequívoco. XLSX com fórmulas, múltiplas abas úteis ou conteúdo ambíguo é rejeitado. Arquivos aceitam até 20 MB e 20.000 linhas. A extração integral gera partes privadas de 500 linhas, publicadas para revisão somente após validar o documento inteiro; a aprovação financeira continua atômica. Após a extração, o usuário pode baixar CSV/OFX para conferir. FITIDs de conversão identificam documento/linha e não se passam por identificadores bancários.

OCR é opcional e local: exige Tesseract com português e Poppler, com caminhos absolutos definidos em `backend/.env.example`. Limita PDF digitalizado a 20 páginas, cada processo a 20 segundos e a etapa OCR a 120 segundos; baixa confiança bloqueia o documento. Imagens PNG/JPEG têm limites de dimensões e tamanho. `/api/import/capabilities` informa o que está instalado; sem os motores, a interface explica a indisponibilidade. Não há envio de documentos para OCR externo.

No Windows local, Tesseract 5.4.0.20240606 foi instalado em `C:\Program Files\Tesseract-OCR`, com modelo português e Poppler configurados. A extração nativa real de uma imagem PNG e de um PDF digitalizado sintéticos preservou datas, sinais, centavos e saldos esperados, com confiança média de 92,90 e 93,73, respectivamente; uma imagem vazia foi rejeitada. Relatório e hashes da instalação estão em `D:\Lume\validacao-2026-10-21\ocr\native-ocr-report.json` e `installation-manifest.json`. Esses exemplos não certificam todos os layouts bancários e continuam exigindo revisão das linhas extraídas.

`backend/Dockerfile` prepara essas dependências em Linux e roda o servidor sem root. Construa a partir de `backend`, fornecendo segredos somente no ambiente de execução. A imagem foi construída no Koyeb e os testes reais de PNG, PDF escaneado e XLSX passaram nessa hospedagem; o Windows permaneceu sem Docker. Isso não certifica todos os layouts ou a carga máxima. XLSX roda isolado com limite de memória/prazo e tamanho descompactado; capacidade de processamento não é promessa de execução contínua em hospedagem suspensa.

O worker usa fila persistente, lease, tentativas limitadas e processamento limitado por usuário e globalmente. Páginas extraídas têm checkpoints para retomada. Partes e textos intermediários são privados e removidos ao concluir ou expirar a retenção; versões anteriores dos objetos continuam rastreadas até a exclusão confirmada no Storage.

Documentos de lotes em estado final são removidos do Storage após 30 dias; linhas de proveniência e histórico permanecem. Revisões abertas mantêm o documento para conferência: acompanhe e encerre lotes antigos. Solicitação de privacidade fica registrada como pendente; não é comprovante de exclusão. Defina responsável, canal de atendimento, identidade jurídica e política de retenção antes de abertura comercial. Os textos públicos de termos/privacidade ainda exigem essa aprovação.

A planilha `SecurityData_1774737520.xlsx` foi retirada do versionamento desta revisão, preservando o arquivo local com o mesmo SHA256. Ela permanece no histórico anterior do Git. Classifique seu conteúdo e, se houver dados que exijam remoção histórica, trate essa operação separadamente antes de tornar o repositório público; esta revisão não reescreve o histórico.

## Falhas e recuperação

- Alerta operacional: `/ready` diferente de 200, falhas recorrentes de importação, fila sem avanço, notificações de erro do provedor ou evento de auditoria sem persistência.
- Durante interrupção do worker, jobs persistem e leases expiram. Reinicie e observe retomada; nunca limpe a tabela de importações para destravar fila.
- Em divergência financeira, suspenda novas aprovações no espaço, exporte evidências, compare fonte, estado de revisão, datas-base, pares e estornos. Faça correção ou reversão com motivo; não apague transações por SQL.
- Em falha de migração, a transação atual volta integralmente. Migrações anteriores continuam aplicadas e constam no ledger. Corrija adiante após análise; não restaure versão antiga da API que permita escritas inseguras.
- Restauração exige parada de escritas e projeto separado. Valide contagens, referências, auditoria e saldos antes de trocar o destino. Reimporte apenas o intervalo posterior ao backup, com revisão de duplicatas. Registre perda/recuperação observada; não afirme RPO/RTO sem ensaio cronometrado.

Custos e limites de hospedagem devem ser conferidos no projeto real. Um serviço gratuito que dorme não executa jobs enquanto suspenso; não prometa sincronização contínua sem worker disponível.
