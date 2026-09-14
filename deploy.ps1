# Sincroniza los archivos fuente a la carpeta pública limpia y publica en Firebase Hosting.
# Uso: powershell -File deploy.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Copy-Item -Path (Join-Path $root "index.html") -Destination (Join-Path $root "web-deploy\index.html") -Force
Copy-Item -Path (Join-Path $root "src\App.jsx") -Destination (Join-Path $root "web-deploy\src\App.jsx") -Force
# Sincroniza toda src/data (PDF de la Guía Rápida, catálogo de localidades, lo que se agregue después) —
# antes solo se copiaban index.html y App.jsx, así que cualquier archivo en src/data quedaba desactualizado
# en cada despliegue sin que nada lo avisara.
Copy-Item -Path (Join-Path $root "src\data\*") -Destination (Join-Path $root "web-deploy\src\data\") -Recurse -Force

Write-Output "Archivos sincronizados a web-deploy/. Desplegando..."

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
Push-Location $root
try {
    firebase deploy --only hosting
} finally {
    Pop-Location
}
