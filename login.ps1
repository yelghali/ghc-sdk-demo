[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$WebFlow
)

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    $copilot = ".\node_modules\.bin\copilot.cmd"
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or
        -not (Test-Path $copilot)) {
        throw "Missing Node.js or local Copilot CLI. Run .\setup.ps1 first."
    }

    Write-Host "Checking your GitHub Copilot CLI login. No Azure or provider API key is used."
    & node ".\scripts\check-auth.mjs"
    $authResult = $LASTEXITCODE
    if ($authResult -eq 0) {
        Write-Host "Your existing Copilot login is ready."
    } elseif ($authResult -eq 2) {
        if ($CheckOnly) {
            throw "Copilot is not signed in. Run .\login.ps1 to complete GitHub sign-in."
        }
        $loginMode = if ($WebFlow) { "--web-flow" } else { "--device-code" }
        Write-Host "Sign in with your own Copilot-enabled GitHub account. Never share tokens or device codes."
        & $copilot login $loginMode
        if ($LASTEXITCODE -ne 0) {
            throw "GitHub Copilot login was not completed."
        }
        & node ".\scripts\check-auth.mjs"
        if ($LASTEXITCODE -ne 0) {
            throw "Login completed but the SDK cannot use it. Review the authentication error above."
        }
    } else {
        throw "Could not check Copilot authentication. Review the error above before retrying."
    }
} finally {
    Pop-Location
}
