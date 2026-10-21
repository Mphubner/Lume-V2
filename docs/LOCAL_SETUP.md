# Execução privada no Windows

O Lume pode executar com Node.js nativo e o projeto Supabase configurado, sem Docker. A API e a interface ficam nas portas 5001 e 5173. Os comandos não aplicam migrações, não recriam tabelas e não apagam dados do Supabase.

## Preparação

Use **Node.js 22.20 ou posterior da série 22**, com npm, e Windows PowerShell 5.1 ou PowerShell 7. Os scripts funcionam a partir de qualquer diretório e localizam o repositório pela própria localização. A primeira execução instala as dependências dos dois lockfiles com `npm ci --ignore-scripts`; execuções seguintes reutilizam a instalação quando o lockfile e a versão do Node coincidem. Nenhum instalador global é executado.

Prepare os arquivos privados a partir dos exemplos, sem incluí-los no Git:

| Arquivo | Valores obrigatórios |
| --- | --- |
| `backend/.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `frontend/.env` | `VITE_API_URL=http://localhost:5001/api`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

As duas URLs Supabase precisam apontar para o mesmo projeto HTTPS. No frontend, use apenas a chave pública `anon` ou `sb_publishable_`; chaves `service_role` e `sb_secret_` pertencem exclusivamente ao backend. A validação informa os nomes das variáveis inválidas, sem mostrar seus valores. O frontend segue a precedência normal do Vite para `.env`, `.env.local`, `.env.development` e `.env.development.local`, além das variáveis do processo. Confira esses arquivos quando uma configuração antiga prevalecer.

O launcher define apenas no processo da API: `NODE_ENV=development`, `PORT=5001`, `LISTEN_HOST=127.0.0.1`, as origens `http://localhost:5173,http://127.0.0.1:5173` e a opção do worker. O Vite escuta em `127.0.0.1:5173`, com porta estrita. Os arquivos `.env` não são reescritos.

Para email e recuperação de acesso, siga [AUTH_EMAIL_SETUP.md](AUTH_EMAIL_SETUP.md), incluindo os redirecionamentos locais no Supabase. As credenciais reais dão acesso ao projeto real: operações feitas na interface usam esse projeto.

## Iniciar, diagnosticar e parar

Na raiz do repositório:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-LumeLocal.ps1 -OpenBrowser
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-LumeLocal.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Stop-LumeLocal.ps1
```

`-ExecutionPolicy Bypass` vale apenas para esse processo; não modifica a política do Windows. Com PowerShell 7, pode substituir `powershell.exe` por `pwsh.exe`.

Abra **http://localhost:5173**. O backend é iniciado diretamente pelo Node, sem janelas de terminal adicionais. Iniciar novamente reutiliza os processos registrados quando ambos continuam ativos. Uma porta ocupada por outro programa causa uma mensagem com o PID; nenhum programa é encerrado automaticamente para liberar portas.

O worker de importação começa **desligado**, evitando o consumo de trabalhos já pendentes no Supabase. Para testar a importação de arquivos, pare o ambiente e inicie com a opção explícita:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Stop-LumeLocal.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-LumeLocal.ps1 -EnableImportWorker -OpenBrowser
```

Essa opção habilita a **fila real do Supabase configurado** e pode retomar trabalhos pendentes. O processamento cria a área de revisão; a contabilização continua dependente das ações de revisão da aplicação. Com o worker desligado, novos uploads podem aguardar na fila. Para mudar a opção, pare e inicie novamente.

Para reinstalar as dependências, pare e use `Start-LumeLocal.ps1 -ReinstallDependencies`. Para saída de diagnóstico estruturada e sem segredos, use `Test-LumeLocal.ps1 -Json`.

## O que os diagnósticos confirmam

| Verificação | Significado |
| --- | --- |
| Configuração válida | Presença, tipos de chave, projeto coincidente e API local; não comprova a validade remota das credenciais |
| `/health` → `alive` | Processo da API respondendo |
| `/ready` → `ready` | Conexão com o banco, versão de schema esperada pela API e estado do worker |
| Interface → HTTP 200 | Servidor de desenvolvimento respondendo |
| Processos gerenciados | PID, horário de início, executável e assinatura do comando coincidem com o registro local |

Os diagnósticos chamam somente as rotas locais de saúde e a página inicial. `/ready` consulta a função de prontidão do Supabase; não aplica migrações e não faz uma importação. Uma resposta pronta não substitui os testes autenticados de cada fluxo.

O comando de início retorna código **0** quando o ambiente está pronto, **2** quando a interface e a API iniciaram mas a prontidão do banco continua pendente, e **1** em falha de configuração ou inicialização. No caso 2, os serviços permanecem disponíveis para diagnóstico. O comando de diagnóstico retorna 2 para um ambiente incompleto e 1 se não conseguiu executar. Se `/ready` retornar 503, use [DEPLOYMENT.md](DEPLOYMENT.md) para verificar credenciais, schema e configuração; nenhuma migração remota é iniciada por estes comandos.

## Registros privados e recuperação

PID, horário, assinatura do comando, recibos das dependências e logs ficam em `.lume-local/`, ignorada pelo Git. A pasta recebe permissões para o usuário atual, SYSTEM e administradores locais. Os arquivos `.env` continuam privados e separados. Não compartilhe os logs sem revisar seu conteúdo.

O comando de parada verifica novamente a identidade de cada processo antes de encerrá-lo, inclusive subprocessos nativos identificados. PIDs reutilizados são ignorados. Ele preserva os logs e não encerra outros servidores Node do computador. A parada do processo no Windows pode interromper um trabalho em andamento; a fila durável da aplicação permite sua retomada conforme os prazos de bloqueio.

Se o Windows reiniciar, execute o início normalmente. Se o registro `processes.json` estiver corrompido, o script se recusa a usá-lo para encerrar programas. Identifique manualmente os processos nas portas 5001 e 5173, feche os terminais que os iniciaram e renomeie `.lume-local/processes.json` para preservar a evidência antes de iniciar novamente. Não apague dados ou migrações para corrigir uma porta ocupada.

## OCR local opcional

PDFs com texto, CSV, OFX e XLSX não exigem instalação de OCR. Imagens e PDFs digitalizados precisam de Tesseract, `por.traineddata` e Poppler. O launcher não baixa nem instala essas dependências.

Para habilitar, configure no `backend/.env` caminhos locais absolutos:

```dotenv
LUME_OCR_ENABLED=true
LUME_TESSERACT_PATH=C:/caminho/tesseract.exe
LUME_TESSDATA_PATH=C:/caminho/tessdata
LUME_PDFTOPPM_PATH=C:/caminho/pdftoppm.exe
```

`LUME_TESSDATA_PATH` é a pasta que contém `por.traineddata` e `configs/tsv`. Ao separar o modelo de idioma em outra pasta, copie também `configs/tsv` da instalação do Tesseract para essa pasta: esse arquivo habilita a saída com as medidas de confiança usadas na revisão financeira. Sem ele, o motor pode emitir texto simples e o Lume rejeitará a página. O diagnóstico valida a existência dos caminhos; um teste real com documento descartável ainda é necessário. Use `LUME_OCR_ENABLED=false` enquanto o motor não estiver instalado. O [Dockerfile do backend](../backend/Dockerfile) já descreve uma alternativa com Tesseract e Poppler em Linux, mas não é necessária para executar a aplicação nativamente.

Para preparar uma instalação futura, consulte a [orientação oficial do Tesseract para instalação](https://tesseract-ocr.github.io/tessdoc/Installation.html) e o [repositório oficial dos modelos de idioma](https://github.com/tesseract-ocr/tessdata_fast). O motor e os modelos são componentes separados. A distribuição de binários para Windows indicada pelo projeto deve ter sua versão e assinatura conferidas; registre também o SHA-256 do arquivo obtido e do modelo antes de habilitar o OCR. A [página oficial do Poppler](https://poppler.freedesktop.org/) fornece o código e as versões do projeto. Reutilize uma instalação local confiável quando já existir, sem substituir ferramentas do sistema. Nenhum download ocorre no início do Lume.
