$ErrorActionPreference = "Continue"
Set-Location "C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\ideaven-landing-v7\apps\api"
$env:API_ADDR = ":8090"
$env:API_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:8787,http://localhost:8787"
& .\ideaven-api.exe
