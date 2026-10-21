[CmdletBinding()]
param(
    [switch]$EnableImportWorker,
    [switch]$ReinstallDependencies,
    [switch]$OpenBrowser,
    [ValidateRange(5, 120)][int]$StartupTimeoutSeconds = 40
)

. (Join-Path $PSScriptRoot 'lib\LumeLocal.Common.ps1')
$lock = $null
$created = @()
$state = $null
try {
    $node = Get-LumeNode
    Initialize-LumePrivateDirectory
    $lock = Open-LumeLauncherLock
    $previous = Get-LumeState
    $backendAlive = $previous -and (Test-LumeOwnedProcess $previous.backend)
    $frontendAlive = $previous -and (Test-LumeOwnedProcess $previous.frontend)
    if ($backendAlive -or $frontendAlive) {
        if (-not ($backendAlive -and $frontendAlive)) { throw 'Inicializacao anterior incompleta. Execute Stop-LumeLocal.ps1 antes de iniciar novamente.' }
        if ($ReinstallDependencies -or [bool]$previous.importWorker -ne [bool]$EnableImportWorker) {
            throw 'Pare o ambiente com Stop-LumeLocal.ps1 antes de reinstalar dependencias ou alterar o worker.'
        }
        $dependencies = Get-LumeDependencyStatus $node
        if (-not $dependencies.backend.current -or -not $dependencies.frontend.current) {
            throw 'O Node ou os lockfiles mudaram. Pare o ambiente com Stop-LumeLocal.ps1 e inicie novamente.'
        }
        Write-Host 'O ambiente local ja esta em execucao.'
    } else {
        foreach ($port in @(5001, 5173)) {
            $owners = @(Get-LumePortOwner $port)
            if ($owners.Count) { throw "Porta $port ocupada por outro processo (PID $($owners -join ', ')). Nada foi encerrado." }
        }
        Install-LumeDependencies $node -Force:$ReinstallDependencies
        $configuration = Get-LumeConfigurationStatus $node
        if (-not $configuration.ok) { throw ('Configuracao incompleta: ' + ($configuration.errors -join '; ')) }
        $runId = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
        $state = [pscustomobject]@{
            version = 1; root = $script:LumeRoot; runId = $runId
            startedAt = [DateTime]::UtcNow.ToString('o'); importWorker = [bool]$EnableImportWorker
            backend = $null; frontend = $null
        }
        $localEnvironment = @{
            NODE_ENV = 'development'; PORT = '5001'; LISTEN_HOST = '127.0.0.1'
            FRONTEND_URL = 'http://localhost:5173,http://127.0.0.1:5173'
            IMPORT_WORKER_ENABLED = $(if ($EnableImportWorker) { 'true' } else { 'false' })
        }
        $state.backend = Start-LumeService $node 'backend' (Join-Path $script:LumeRoot 'backend\src\server.js') @() $localEnvironment $runId
        $created += $state.backend
        Save-LumeState $state
        $state.frontend = Start-LumeService $node 'frontend' (Join-Path $script:LumeRoot 'frontend\node_modules\vite\bin\vite.js') @('--host', '127.0.0.1', '--port', '5173', '--strictPort') @{ NODE_ENV = 'development' } $runId
        $created += $state.frontend
        Save-LumeState $state
        $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
        do {
            if (-not (Test-LumeOwnedProcess $state.backend) -or -not (Test-LumeOwnedProcess $state.frontend)) {
                throw "Um servico encerrou durante a inicializacao. Consulte os logs privados em $script:LumeStateDirectory."
            }
            $health = Get-LumeHttpStatus 'http://127.0.0.1:5001/health'
            $frontend = Get-LumeHttpStatus 'http://127.0.0.1:5173/'
            if ($health.status -eq 'alive' -and $frontend.code -eq 200) { break }
            Start-Sleep -Milliseconds 400
        } while ([DateTime]::UtcNow -lt $deadline)
        if ($health.status -ne 'alive' -or $frontend.code -ne 200) { throw 'Tempo esgotado ao iniciar os servicos locais.' }
    }
    $diagnostics = Get-LumeDiagnostics $node
    Write-LumeDiagnostics $diagnostics
    if (-not $diagnostics.configuration.ok) { throw 'A configuracao atual exige revisao. Corrija os arquivos privados e reinicie o ambiente.' }
    if ($diagnostics.endpoints.health.status -ne 'alive' -or $diagnostics.endpoints.frontend.code -ne 200) {
        throw 'O ambiente registrado deixou de responder. Execute Test-LumeLocal.ps1 para diagnosticar.'
    }
    Write-Host 'Lume: http://localhost:5173'
    Write-Host "Worker de importacao: $([bool]$EnableImportWorker)"
    if ($OpenBrowser) { Start-Process 'http://localhost:5173' -WindowStyle Hidden }
    if ($diagnostics.endpoints.ready.status -ne 'ready') {
        Write-Warning 'A interface e a API estao abertas, mas o banco ainda nao esta pronto. Nenhuma migracao foi aplicada. Consulte docs/LOCAL_SETUP.md.'
        exit 2
    }
} catch {
    foreach ($service in $created) { [void](Stop-LumeOwnedProcess $service) }
    if ($state -and (Test-Path -LiteralPath $script:LumeStatePath)) {
        $savedState = Get-LumeState
        if ($savedState.runId -eq $state.runId) { Remove-Item -LiteralPath $script:LumeStatePath -Force }
    }
    Write-Error $_.Exception.Message
    exit 1
} finally { if ($lock) { $lock.Dispose() } }
