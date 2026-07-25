$ErrorActionPreference = 'Stop'
$errorFile = Join-Path (Get-Location).Path 'PHASE1B_CI_ERROR.txt'
Remove-Item $errorFile -Force -ErrorAction SilentlyContinue
try {
    & .\scripts\run-phase1b-ci.ps1
    if ($LASTEXITCODE -ne 0) {
        throw "Phase 1B validator returned exit code $LASTEXITCODE."
    }
} catch {
    @(
        'Phase 1B CI failure evidence',
        "Generated: $(Get-Date -Format o)",
        "Message: $($_.Exception.Message)",
        "Category: $($_.CategoryInfo.Category)",
        "Target: $($_.CategoryInfo.TargetName)",
        "Position: $($_.InvocationInfo.PositionMessage)",
        'Script stack:',
        $_.ScriptStackTrace
    ) | Set-Content $errorFile -Encoding utf8
    Get-Content $errorFile
    exit 1
}
