# EAS Build solo con la carpeta mobile (evita que EAS empaquete todo el repo)
# Ejecutar desde la raíz del proyecto: C:\DEV\ProyectoVinculo
# Requisitos: Git, Node/npm, EAS CLI (npm i -g eas-cli)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$mobileSrc = Join-Path $repoRoot "mobile"
$tempBuild = Join-Path $env:TEMP "vinculos-eas-build-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# Comprobar requisitos
$gitOk = Get-Command git -ErrorAction SilentlyContinue
$easOk = Get-Command eas -ErrorAction SilentlyContinue
if (-not $gitOk) {
    Write-Host "Error: no se encuentra Git. Instálalo o añádelo al PATH." -ForegroundColor Red
    exit 1
}
if (-not $easOk) {
    Write-Host "Error: no se encuentra EAS CLI. Instálalo con: npm i -g eas-cli" -ForegroundColor Red
    exit 1
}

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

Write-Host "Entrando en carpeta temporal..." -ForegroundColor Cyan
$exitCode = 0
Push-Location $tempBuild
try {
    # Repo git (EAS lo necesita para el build)
    Write-Host "Inicializando Git y creando commit..." -ForegroundColor Cyan
    & git init
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: git init falló." -ForegroundColor Red
        exit 1
    }
    & git config user.email "build@vinculos.local"
    & git config user.name "EAS Build"
    & git add .
    & git commit -m "Build"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: git commit falló." -ForegroundColor Red
        exit 1
    }
    Write-Host "Instalando dependencias (npm install)..." -ForegroundColor Cyan
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: npm install falló." -ForegroundColor Red
        exit 1
    }
    Write-Host "Ejecutando EAS build..." -ForegroundColor Cyan
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
