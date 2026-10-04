$ErrorActionPreference = "Stop"
Set-Location "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\ideaven-landing-v7\apps\api"
$env:Path = "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\tools\go\bin;" + $env:Path
go vet ./...
Write-Host "VET=$LASTEXITCODE"
go test -count=1 ./internal/extension/
Write-Host "TEST=$LASTEXITCODE"
