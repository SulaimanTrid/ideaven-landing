$ErrorActionPreference = "Continue"
# TASK 64 helper: stop any API on 8090, then start the freshly built binary
# with go on PATH (the extbuild worker shells out to `go run`).
$c = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { Stop-Process -Id $c.OwningProcess -Force; Start-Sleep -Seconds 1 }
Set-Location "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\ideaven-landing-v7\apps\api"
$env:Path = "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\tools\go\bin;" + $env:Path
$env:API_ADDR = ":8090"
$env:API_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:8787,http://localhost:8787"
& .\ideaven-api.exe
