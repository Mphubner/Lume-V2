[CmdletBinding()]
param([switch]$Json)

. (Join-Path $PSScriptRoot 'lib\LumeLocal.Common.ps1')
try {
    $node = Get-LumeNode
    $diagnostics = Get-LumeDiagnostics $node
    if ($Json) { $diagnostics | ConvertTo-Json -Depth 8 }
    else { Write-LumeDiagnostics $diagnostics }
    if (-not $diagnostics.configuration.ok -or -not $diagnostics.dependencies.backend -or -not $diagnostics.dependencies.frontend -or
        -not $diagnostics.managed.backend -or -not $diagnostics.managed.frontend -or
        $diagnostics.endpoints.health.status -ne 'alive' -or $diagnostics.endpoints.ready.status -ne 'ready' -or $diagnostics.endpoints.frontend.code -ne 200) { exit 2 }
} catch { Write-Error $_.Exception.Message; exit 1 }
