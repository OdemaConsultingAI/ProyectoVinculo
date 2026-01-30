# EAS Build solo con la carpeta mobile (evita que EAS empaquete todo el repo)
# Ejecutar desde: C:\DEV\ProyectoVinculo

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$mobileSrc = Join-Path $repoRoot "mobile"
$tempBuild = Join-Path $env:TEMP "vinculos-eas-build-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

if (-not (Test-Path $mobileSrc)) {
    Write-Host "No se encuentra la carpeta mobile en: $repoRoot" -ForegroundColor Red
    exit 1
}

Write-Host "Creando carpeta temporal para el build: $tempBuild" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $tempBuild -Force | Out-Null

# Copiar contenido de mobile (excluyendo node_modules, .expo, etc.)
$exclude = @("node_modules", ".expo", "dist", "web-build", "*.log")
Write-Host "Copiando solo la carpeta mobile..." -ForegroundColor Cyan
Get-ChildItem -Path $mobileSrc -Force | Where-Object {
    $name = $_.Name
    $excluded = $false
    foreach ($e in $exclude) {
        if ($name -like $e -or $name -eq $e) { $excluded = $true; break }
    }
    -not $excluded
} | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $tempBuild $_.Name) -Recurse -Force
}

Write-Host "Entrando en carpeta temporal y ejecutando EAS build..." -ForegroundColor Cyan
$exitCode = 0
Push-Location $tempBuild
try {
    & eas build --platform android --profile preview --clear-cache
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

# Opcional: eliminar carpeta temporal al terminar
if (Test-Path $tempBuild) {
    Write-Host "Carpeta temporal: $tempBuild (puedes borrarla manualmente)" -ForegroundColor Gray
}

exit $exitCode
