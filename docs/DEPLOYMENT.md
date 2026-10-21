# Implantação, operação e recuperação

## Condição atual

Alterações locais preparadas para homologação. Testes com dados sintéticos não comprovam Supabase Auth/Storage remoto, entrega de convites, cobrança Stripe ou funcionamento em produção. Não há migração automática no início do servidor.

## Sequência de implantação

1. Crie projeto de homologação separado, com confirmação de e-mail e URLs de retorno para `/auth/callback**`, `/login`, `/dashboard`, `/resetar-senha` e `/convite`. Configure SMTP próprio conforme [acesso por email](AUTH_EMAIL_SETUP.md). Nunca use dados financeiros reais no teste inicial.
2. Faça backup do banco existente e dos objetos Storage. Verifique a restauração em projeto separado e registre horário, responsável, contagem de linhas e saldos amostrais. O plano gratuito não substitui uma rotina de backup e recuperação.
3. Suspenda escritas e uploads durante a janela de migração. Rode `npm run migrate:plan` em `backend`, usando `DATABASE_URL` no ambiente. O plano lista versões pendentes sem aplicar alterações.
4. Antes de aplicar em destino remoto, configure `MIGRATION_BACKUP_PATH` para arquivo local não vazio e `CONFIRM_MIGRATION_TARGET` com `host/nome_do_banco` exatos. Execute `npm run migrate:apply`. A conexão remota exige TLS verificado. Cada migração e seu checksum são registrados na mesma transação, com bloqueio contra execução concorrente.
5. Para um projeto totalmente vazio, o schema inicial `supabase/schema.sql` é apenas uma base: instale-o e aplique todas as migrações antes de disponibilizar qualquer cliente. Em banco existente, não execute esse schema de novo. A migração preserva registros históricos e marca inconsistências para revisão; não inventa saldo-base.
6. Confira funções RPC e privilégios de `anon`, `authenticated` e `service_role`, bucket privado `financial-imports`, limite de 20 MB e todas as migrações até `202610200008`. A versão de `/ready` deve ser `202610200008`. A migração 008 também trata permissões do cache legado e a identidade de assinaturas existente no projeto real; duplicidade de ID externo aborta sem apagar registros. Recarregue o cache do PostgREST se necessário. Nunca use chave service-role no frontend.
7. Publique API e frontend compatíveis na mesma janela. Configure `FRONTEND_URL` com origens exatas; `TRUST_PROXY_HOPS` deve corresponder aos proxies reais da hospedagem. `/health` indica processo vivo; `/ready` exige schema esperado, banco acessível e worker sem falhas consecutivas.
8. Execute o roteiro de homologação abaixo antes de liberar a família. Somente depois habilite cobrança ou conexão externa que tenha sido efetivamente homologada.

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

`backend/Dockerfile` prepara essas dependências em Linux e roda o servidor sem root. Construa a partir de `backend`, fornecendo segredos somente no ambiente de execução. Esse Dockerfile não foi construído nesta máquina, que não possui Docker nem Tesseract; o processamento OCR completo ainda exige homologação no host escolhido. A hospedagem precisa comportar a memória dos workers, os processos nativos e o tempo de execução. XLSX roda isolado com limite de memória/prazo e tamanho descompactado; capacidade de processamento não é promessa de execução contínua em hospedagem suspensa.

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
