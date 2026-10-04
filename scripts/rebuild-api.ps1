$ErrorActionPreference = "Stop"
Set-Location "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\ideaven-landing-v7\apps\api"
$env:Path = "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\tools\go\bin;" + $env:Path
go build -o ideaven-api.exe ./cmd/api
Write-Host "GO_BUILD=$LASTEXITCODE"
