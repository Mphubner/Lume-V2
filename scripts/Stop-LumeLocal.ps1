[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot 'lib\LumeLocal.Common.ps1')
$lock = $null
try {
    if (-not (Test-Path -LiteralPath $script:LumeStateDirectory)) { Write-Host 'Nenhum ambiente local gerenciado foi encontrado.'; exit 0 }
    $lock = Open-LumeLauncherLock
    $state = Get-LumeState
    if (-not $state) { Write-Host 'Nenhum ambiente local gerenciado foi encontrado.'; exit 0 }
    foreach ($name in @('frontend', 'backend')) {
        $service = $state.$name
        if (Stop-LumeOwnedProcess $service) { Write-Host "$name encerrado." }
        else { Write-Host "$name ja encerrado ou PID sem identidade correspondente; nenhum processo externo foi alterado." }
    }
    Remove-Item -LiteralPath $script:LumeStatePath -Force
    Write-Host 'Ambiente local parado. Logs privados preservados em .lume-local.'
} catch { Write-Error $_.Exception.Message; exit 1 }
finally { if ($lock) { $lock.Dispose() } }
