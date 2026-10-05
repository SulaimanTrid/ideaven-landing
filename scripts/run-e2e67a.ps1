$ErrorActionPreference = "Continue"
Set-Location "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\ideaven-landing-v7"
$env:PLAYWRIGHT_MODULE = "../../tools/e2e-runner/node_modules/playwright/index.js"
& "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\tools\node-v24.21.0-win-x64\node.exe" scripts\e2e-task67-security-hardening.mjs 2>&1 | Out-String
