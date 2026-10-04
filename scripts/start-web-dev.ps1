$ErrorActionPreference = "Continue"
$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { Stop-Process -Id $c.OwningProcess -Force; Start-Sleep -Seconds 1 }
Set-Location "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\ideaven-landing-v7\apps\web"
$env:Path = "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\tools\node-v24.21.0-win-x64;" + $env:Path
npx.cmd next dev -p 3000 2>&1 | Out-String
