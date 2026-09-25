# Sincroniza los archivos fuente a la carpeta de pruebas y publica en el proyecto Firebase de
# pruebas (proyector-voe-pruebas), completamente separado de producción (proyector-voe). Uso:
# powershell -File deploy-staging.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Copy-Item -Path (Join-Path $root "index.staging.html") -Destination (Join-Path $root "web-deploy-staging\index.html") -Force
Copy-Item -Path (Join-Path $root "src\App.jsx") -Destination (Join-Path $root "web-deploy-staging\src\App.jsx") -Force
Copy-Item -Path (Join-Path $root "src\data\*") -Destination (Join-Path $root "web-deploy-staging\src\data\") -Recurse -Force
Copy-Item -Path (Join-Path $root "src\utils\*") -Destination (Join-Path $root "web-deploy-staging\src\utils\") -Recurse -Force

Write-Output "Archivos sincronizados a web-deploy-staging/. Desplegando a proyector-voe-pruebas..."

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
Push-Location $root
try {
    firebase deploy --only hosting --project proyector-voe-pruebas --config firebase.staging.json
} finally {
    Pop-Location
}
