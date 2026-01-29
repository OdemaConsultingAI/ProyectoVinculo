# Script para detener el proceso que usa el puerto 3000
# Ejecutar como Administrador: PowerShell -ExecutionPolicy Bypass -File detener_puerto_3000.ps1

Write-Host "Buscando proceso en puerto 3000..." -ForegroundColor Yellow

$process = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($process) {
    Write-Host "Proceso encontrado: PID $process" -ForegroundColor Cyan
    $processInfo = Get-Process -Id $process -ErrorAction SilentlyContinue
    if ($processInfo) {
        Write-Host "Nombre del proceso: $($processInfo.ProcessName)" -ForegroundColor Cyan
        Write-Host "Deteniendo proceso..." -ForegroundColor Yellow
        Stop-Process -Id $process -Force
        Write-Host "✅ Proceso detenido exitosamente" -ForegroundColor Green
    } else {
        Write-Host "⚠️ No se pudo obtener información del proceso" -ForegroundColor Yellow
    }
} else {
    Write-Host "✅ No hay proceso usando el puerto 3000" -ForegroundColor Green
}

Write-Host "`nPresiona Enter para continuar..."
Read-Host
