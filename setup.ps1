[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$SmokeTest
)

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Install Node.js 22.12 or newer, reopen PowerShell, then rerun this script."
    }
    $version = [version]((& node --version).TrimStart("v").Split("-")[0])
    if ($version -lt [version]"22.12.0") {
        throw "Node.js 22.12 or newer is required."
    }
    if (-not (Test-Path ".\node_modules\@github\copilot-sdk\package.json") -or
        -not (Test-Path ".\node_modules\.bin\copilot.cmd")) {
        & npm.cmd ci --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
    }

    Write-Host "Checking GitHub Copilot sign-in. Azure CLI authentication is not used."
    & node ".\scripts\check-auth.mjs"
    $authResult = $LASTEXITCODE
    if ($authResult -eq 2 -and -not $CheckOnly) {
        Write-Host "Complete the Copilot CLI's GitHub login in your browser."
        & ".\node_modules\.bin\copilot.cmd" login
        if ($LASTEXITCODE -ne 0) { throw "GitHub Copilot login was not completed." }
        & node ".\scripts\check-auth.mjs"
        $authResult = $LASTEXITCODE
    }
    if ($authResult -ne 0) {
        throw "Copilot authentication is unavailable. Run .\setup.ps1 and complete GitHub sign-in."
    }
    if ($SmokeTest) {
        & npm.cmd run smoke
        if ($LASTEXITCODE -ne 0) { throw "The live Copilot smoke test failed." }
    }
    Write-Host "Ready. Run npm start, then open http://127.0.0.1:4317."
} finally {
    Pop-Location
}
