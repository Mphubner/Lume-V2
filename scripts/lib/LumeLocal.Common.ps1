# Shared implementation for the Windows local launcher. No secret values are logged.
$script:LumeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:LumeStateDirectory = Join-Path $script:LumeRoot '.lume-local'
$script:LumeStatePath = Join-Path $script:LumeStateDirectory 'processes.json'
$ErrorActionPreference = 'Stop'

function Get-LumeNode {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $command) { throw 'Instale Node.js 22.20 ou posterior da serie 22 antes de continuar.' }
    $version = (& $command.Source --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v22\.(\d+)\.(\d+)$' -or [int]$Matches[1] -lt 20) {
        throw 'Este ambiente requer Node.js 22.20 ou posterior da serie 22.'
    }
    $npm = Join-Path (Split-Path $command.Source -Parent) 'node_modules\npm\bin\npm-cli.js'
    if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) { throw 'npm nao encontrado junto ao Node. Repare a instalacao oficial do Node.js.' }
    return [pscustomobject]@{ Path = $command.Source; Version = $version; Npm = $npm }
}

function Initialize-LumePrivateDirectory {
    [void][IO.Directory]::CreateDirectory($script:LumeStateDirectory)
    # Logs may contain diagnostics from dependencies. Restrict them to this user,
    # SYSTEM and local administrators before creating any output files.
    # Preserve owner/group metadata and modify only the existing access rules.
    $acl = Get-Acl -LiteralPath $script:LumeStateDirectory
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($existing in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($existing) }
    $identities = @(
        [Security.Principal.WindowsIdentity]::GetCurrent().User,
        (New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'),
        (New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-544')
    )
    foreach ($identity in $identities) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            $identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
        )
        [void]$acl.AddAccessRule($rule)
    }
    # Set-Acl in Windows PowerShell can request audit privileges even for a
    # DACL-only change. Persist only the modified access rules through .NET.
    if ($PSVersionTable.PSVersion.Major -le 5) {
        [IO.Directory]::SetAccessControl($script:LumeStateDirectory, $acl)
    } else {
        [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $script:LumeStateDirectory), $acl)
    }
}

function Open-LumeLauncherLock {
    try {
        return [IO.File]::Open((Join-Path $script:LumeStateDirectory 'launcher.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    } catch { throw 'Outro comando local do Lume esta em andamento. Aguarde sua conclusao.' }
}

function Get-LumeState {
    if (-not (Test-Path -LiteralPath $script:LumeStatePath)) { return $null }
    try {
        $state = Get-Content -LiteralPath $script:LumeStatePath -Raw | ConvertFrom-Json
        if ($state.version -ne 1 -or $state.root -ne $script:LumeRoot) { throw 'invalid state' }
        return $state
    } catch { throw 'Registro local de processos invalido. Nao sera usado para encerrar processos. Consulte docs/LOCAL_SETUP.md.' }
}

function Save-LumeState($State) {
    $temporary = Join-Path $script:LumeStateDirectory 'processes.pending.json'
    $State | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $script:LumeStatePath -Force
}

function Get-LumeCommandHash([string]$CommandLine) {
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($CommandLine))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose() }
}

function Get-LumeProcessIdentity([int]$ProcessId) {
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    try {
        $native = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
        if (-not $native -or -not $native.CommandLine -or -not $process.Path) { return $null }
        return [pscustomobject]@{
            pid = $ProcessId
            startUtcTicks = [string]$process.StartTime.ToUniversalTime().Ticks
            executable = $process.Path
            commandLineHash = Get-LumeCommandHash $native.CommandLine
        }
    } catch { return $null }
}

function Test-LumeOwnedProcess($Service) {
    if (-not $Service) { return $false }
    $actual = Get-LumeProcessIdentity ([int]$Service.pid)
    return [bool]($actual -and $actual.startUtcTicks -eq $Service.startUtcTicks -and
        $actual.executable -eq $Service.executable -and $actual.commandLineHash -eq $Service.commandLineHash)
}

function Stop-LumeOwnedProcess($Service) {
    if (-not (Test-LumeOwnedProcess $Service)) { return $false }
    # Capture verified descendants first (for example a native OCR subprocess).
    # Each PID is checked again against its start time and command hash before stop.
    $descendants = New-Object 'System.Collections.Generic.List[object]'
    $pending = New-Object 'System.Collections.Generic.Queue[int]'
    $pending.Enqueue([int]$Service.pid)
    while ($pending.Count -gt 0) {
        $parentId = $pending.Dequeue()
        foreach ($child in @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$parentId" -ErrorAction SilentlyContinue)) {
            $identity = Get-LumeProcessIdentity ([int]$child.ProcessId)
            if ($identity -and [long]$identity.startUtcTicks -ge [long]$Service.startUtcTicks) {
                $descendants.Add($identity)
                $pending.Enqueue([int]$identity.pid)
            }
        }
    }
    # Do not stop a descendant if the managed parent has disappeared meanwhile.
    if (-not (Test-LumeOwnedProcess $Service)) { return $false }
    for ($index = $descendants.Count - 1; $index -ge 0; $index--) {
        if (Test-LumeOwnedProcess $descendants[$index]) {
            Stop-Process -Id ([int]$descendants[$index].pid) -Force -ErrorAction SilentlyContinue
        }
    }
    if (Test-LumeOwnedProcess $Service) { Stop-Process -Id ([int]$Service.pid) -Force -ErrorAction Stop }
    return $true
}

function Get-LumePortOwner([int]$Port) {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Get-LumeHttpStatus([string]$Url) {
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object Net.Http.HttpClientHandler
    $handler.UseProxy = $false
    $handler.AllowAutoRedirect = $false
    $client = New-Object Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(3)
    $response = $null
    try {
        $response = $client.GetAsync($Url).GetAwaiter().GetResult()
        $result = [ordered]@{ code = [int]$response.StatusCode; status = $null }
        try {
            $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
            if ($body.status -in @('alive', 'ready', 'not_ready')) { $result.status = $body.status }
            if ($body.schema_version -match '^\d{12}$') { $result.schemaVersion = $body.schema_version }
            if ($null -ne $body.import_worker) { $result.importWorker = [bool]$body.import_worker }
        } catch { }
        return [pscustomobject]$result
    } catch { return [pscustomobject]@{ code = 0; status = 'unreachable' } }
    finally {
        if ($response) { $response.Dispose() }
        $client.Dispose()
        $handler.Dispose()
    }
}

function Get-LumeDependencyStatus($Node) {
    $receiptPath = Join-Path $script:LumeStateDirectory 'dependencies.json'
    $receipt = $null
    if (Test-Path -LiteralPath $receiptPath) {
        try { $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json } catch { }
    }
    $result = [ordered]@{}
    foreach ($name in @('backend', 'frontend')) {
        $directory = Join-Path $script:LumeRoot $name
        $hash = (Get-FileHash -LiteralPath (Join-Path $directory 'package-lock.json') -Algorithm SHA256).Hash
        $marker = if ($name -eq 'backend') { 'node_modules\dotenv\package.json' } else { 'node_modules\vite\package.json' }
        $installed = Test-Path -LiteralPath (Join-Path $directory $marker)
        $saved = if ($receipt) { $receipt.$name } else { $null }
        $result[$name] = [pscustomobject]@{
            installed = $installed
            current = [bool]($installed -and $saved -and $saved.hash -eq $hash -and $saved.node -eq $Node.Version)
            hash = $hash
            node = $Node.Version
        }
    }
    return [pscustomobject]$result
}

function Install-LumeDependencies($Node, [switch]$Force) {
    $status = Get-LumeDependencyStatus $Node
    $receipt = [ordered]@{}
    foreach ($name in @('backend', 'frontend')) {
        if ($Force -or -not $status.$name.current) {
            Write-Host "Instalando dependencias de $name a partir do lockfile..."
            $logPath = Join-Path $script:LumeStateDirectory ("install-$name.log")
            Push-Location (Join-Path $script:LumeRoot $name)
            $previousErrorPreference = $ErrorActionPreference
            try {
                # Windows PowerShell 5.1 treats native stderr as an error record.
                # npm warnings must not fail a successful, logged installation.
                $ErrorActionPreference = 'Continue'
                & $Node.Path $Node.Npm ci --ignore-scripts --no-audit --no-fund *> $logPath
                $ErrorActionPreference = $previousErrorPreference
                if ($LASTEXITCODE -ne 0) { throw "Instalacao de $name falhou. Diagnostico privado: $logPath" }
            } finally { $ErrorActionPreference = $previousErrorPreference; Pop-Location }
        }
        $receipt[$name] = @{ hash = $status.$name.hash; node = $Node.Version }
    }
    $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $script:LumeStateDirectory 'dependencies.json') -Encoding UTF8
}

function Get-LumeConfigurationStatus($Node) {
    # Parse the same dotenv files and Vite development precedence as the app.
    # Output is deliberately limited to variable names and boolean status.
    $javascript = @'
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
(async () => {
  const root = process.cwd(), errors = [], warnings = [];
  const backendRequire = createRequire(path.join(root, 'backend/package.json'));
  const frontendRequire = createRequire(path.join(root, 'frontend/package.json'));
  const backendPath = path.join(root, 'backend/.env');
  const backend = { ...(fs.existsSync(backendPath) ? backendRequire('dotenv').parse(fs.readFileSync(backendPath)) : {}), ...process.env };
  const { loadEnv } = await import(pathToFileURL(frontendRequire.resolve('vite')).href);
  const frontend = loadEnv('development', path.join(root, 'frontend'), 'VITE_');
  function required(env, name) {
    const value = env[name]?.trim();
    if (!value || /^(?:your-|your_|replace|changeme|<)/i.test(value)) { errors.push(name + ': ausente ou exemplo'); return ''; }
    return value;
  }
  function origin(value, name) {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error();
      return url.origin;
    } catch { errors.push(name + ': URL HTTPS invalida'); return null; }
  }
  function keyRole(value) {
    if (value.startsWith('sb_secret_')) return 'service_role';
    if (value.startsWith('sb_publishable_')) return 'anon';
    try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role; } catch { return null; }
  }
  const backendOrigin = origin(required(backend, 'SUPABASE_URL'), 'SUPABASE_URL');
  const frontendOrigin = origin(required(frontend, 'VITE_SUPABASE_URL'), 'VITE_SUPABASE_URL');
  if (backendOrigin && frontendOrigin && backendOrigin !== frontendOrigin) errors.push('SUPABASE_URL / VITE_SUPABASE_URL: projetos diferentes');
  const serviceKey = required(backend, 'SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && keyRole(serviceKey) !== 'service_role') errors.push('SUPABASE_SERVICE_ROLE_KEY: tipo invalido');
  const publicKey = required(frontend, 'VITE_SUPABASE_ANON_KEY');
  if (publicKey && keyRole(publicKey) !== 'anon') errors.push('VITE_SUPABASE_ANON_KEY: exige chave publica anon/publishable');
  if (backend.SUPABASE_ANON_KEY && keyRole(backend.SUPABASE_ANON_KEY) !== 'anon') errors.push('SUPABASE_ANON_KEY: exige chave publica');
  for (const [name, value] of Object.entries(frontend)) {
    if (value && (/SERVICE_ROLE|SECRET|PRIVATE|DATABASE_URL|AI_API_KEY/i.test(name) || keyRole(value) === 'service_role' || (serviceKey && value === serviceKey))) errors.push(name + ': segredo proibido no frontend');
  }
  const api = required(frontend, 'VITE_API_URL');
  if (api && !['http://localhost:5001/api', 'http://127.0.0.1:5001/api'].includes(api)) errors.push('VITE_API_URL: deve apontar para a API local na porta 5001, caminho /api');
  let ocr = 'disabled';
  if (backend.LUME_OCR_ENABLED === 'true') {
    ocr = 'configured';
    for (const name of ['LUME_TESSERACT_PATH', 'LUME_TESSDATA_PATH', 'LUME_PDFTOPPM_PATH']) {
      const value = backend[name];
      if (!value || !path.isAbsolute(value) || !fs.existsSync(value)) { errors.push(name + ': caminho local absoluto inexistente'); ocr = 'unavailable'; }
    }
    if (backend.LUME_TESSDATA_PATH && !fs.existsSync(path.join(backend.LUME_TESSDATA_PATH, 'por.traineddata'))) { errors.push('LUME_TESSDATA_PATH: modelo por.traineddata ausente'); ocr = 'unavailable'; }
  }
  for (const name of ['PORT', 'FRONTEND_URL', 'LISTEN_HOST', 'IMPORT_WORKER_ENABLED', 'NODE_ENV']) {
    if (backend[name]) warnings.push(name + ': valor local definido pelo launcher');
  }
  process.stdout.write(JSON.stringify({ ok: errors.length === 0, errors, warnings, ocr }));
})().catch(() => { process.stdout.write(JSON.stringify({ ok: false, errors: ['Nao foi possivel validar a configuracao; verifique dependencias e sintaxe dos arquivos .env.'], warnings: [], ocr: 'unknown' })); process.exitCode = 1; });
'@
    Push-Location $script:LumeRoot
    $previousErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $Node.Path -e $javascript 2>$null
        $ErrorActionPreference = $previousErrorPreference
        try {
            $parsed = $output | ConvertFrom-Json
            if ($null -eq $parsed -or $null -eq $parsed.ok) { throw 'invalid validation output' }
            return $parsed
        }
        catch { return [pscustomobject]@{ ok = $false; errors = @('Validacao indisponivel. Instale as dependencias com Start-LumeLocal.ps1.'); warnings = @(); ocr = 'unknown' } }
    } finally { $ErrorActionPreference = $previousErrorPreference; Pop-Location }
}

function Start-LumeService($Node, [string]$Name, [string]$EntryPoint, [string[]]$Arguments, [hashtable]$Environment, [string]$RunId) {
    $saved = @{}
    foreach ($environmentName in $Environment.Keys) {
        $saved[$environmentName] = [Environment]::GetEnvironmentVariable($environmentName, 'Process')
        [Environment]::SetEnvironmentVariable($environmentName, $Environment[$environmentName], 'Process')
    }
    $stdout = Join-Path $script:LumeStateDirectory "$RunId-$Name.stdout.log"
    $stderr = Join-Path $script:LumeStateDirectory "$RunId-$Name.stderr.log"
    try {
        $process = Start-Process -FilePath $Node.Path -ArgumentList (@(('"{0}"' -f $EntryPoint)) + $Arguments) `
            -WorkingDirectory (Join-Path $script:LumeRoot $Name) -WindowStyle Hidden `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        $identity = Get-LumeProcessIdentity $process.Id
        if (-not $identity) {
            # We still hold the actual Process object returned by Start-Process.
            if (-not $process.HasExited) { $process.Kill() }
            throw "Nao foi possivel registrar $Name. Consulte o log privado em $script:LumeStateDirectory."
        }
        $identity | Add-Member -NotePropertyName stdout -NotePropertyValue $stdout
        $identity | Add-Member -NotePropertyName stderr -NotePropertyValue $stderr
        return $identity
    } finally {
        foreach ($environmentName in $saved.Keys) { [Environment]::SetEnvironmentVariable($environmentName, $saved[$environmentName], 'Process') }
    }
}

function Get-LumeDiagnostics($Node) {
    $state = Get-LumeState
    $dependencies = Get-LumeDependencyStatus $Node
    $configuration = if ($dependencies.backend.installed -and $dependencies.frontend.installed) {
        Get-LumeConfigurationStatus $Node
    } else { [pscustomobject]@{ ok = $false; errors = @('Dependencias ausentes. Execute Start-LumeLocal.ps1.'); warnings = @(); ocr = 'unknown' } }
    return [pscustomobject]@{
        node = $Node.Version
        dependencies = [pscustomobject]@{ backend = $dependencies.backend.current; frontend = $dependencies.frontend.current }
        configuration = $configuration
        managed = [pscustomobject]@{
            backend = [bool]($state -and (Test-LumeOwnedProcess $state.backend))
            frontend = [bool]($state -and (Test-LumeOwnedProcess $state.frontend))
        }
        endpoints = [pscustomobject]@{
            health = Get-LumeHttpStatus 'http://127.0.0.1:5001/health'
            ready = Get-LumeHttpStatus 'http://127.0.0.1:5001/ready'
            frontend = Get-LumeHttpStatus 'http://127.0.0.1:5173/'
        }
        logDirectory = $script:LumeStateDirectory
    }
}

function Write-LumeDiagnostics($Diagnostics) {
    Write-Host "Node: $($Diagnostics.node)"
    Write-Host "Configuracao valida: $($Diagnostics.configuration.ok) | OCR: $($Diagnostics.configuration.ocr)"
    foreach ($problem in $Diagnostics.configuration.errors) { Write-Host "  - $problem" }
    Write-Host "Dependencias verificadas: API=$($Diagnostics.dependencies.backend), interface=$($Diagnostics.dependencies.frontend)"
    Write-Host "Processos gerenciados: API=$($Diagnostics.managed.backend), interface=$($Diagnostics.managed.frontend)"
    Write-Host "API /health: $($Diagnostics.endpoints.health.code) $($Diagnostics.endpoints.health.status)"
    Write-Host "API /ready: $($Diagnostics.endpoints.ready.code) $($Diagnostics.endpoints.ready.status)"
    Write-Host "Interface: $($Diagnostics.endpoints.frontend.code)"
    Write-Host "Logs privados: $($Diagnostics.logDirectory)"
}
