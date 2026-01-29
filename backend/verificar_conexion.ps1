# Script para verificar la configuración de Tailscale y el servidor
# Ejecutar en PowerShell

Write-Host "=== VERIFICACIÓN DE CONFIGURACIÓN TAILSCALE ===" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar Tailscale
Write-Host "1. Verificando Tailscale..." -ForegroundColor Yellow
$tailscaleIP = tailscale ip 2>$null
if ($tailscaleIP) {
    Write-Host "   ✅ IP de Tailscale: $tailscaleIP" -ForegroundColor Green
} else {
    Write-Host "   ❌ Tailscale no está corriendo o no está configurado" -ForegroundColor Red
    Write-Host "   💡 Ejecuta: tailscale up" -ForegroundColor Yellow
}

Write-Host ""

# 2. Verificar estado de Tailscale
Write-Host "2. Estado de Tailscale..." -ForegroundColor Yellow
$tailscaleStatus = tailscale status 2>$null
if ($tailscaleStatus) {
    Write-Host "   ✅ Tailscale está activo" -ForegroundColor Green
    Write-Host "   📋 Primeras líneas del estado:" -ForegroundColor Cyan
    $tailscaleStatus | Select-Object -First 3 | ForEach-Object { Write-Host "      $_" }
} else {
    Write-Host "   ⚠️ No se pudo obtener el estado" -ForegroundColor Yellow
}

Write-Host ""

# 3. Verificar puerto 3000
Write-Host "3. Verificando puerto 3000..." -ForegroundColor Yellow
$port3000 = netstat -ano | findstr :3000
if ($port3000) {
    Write-Host "   ✅ Puerto 3000 está en uso (servidor corriendo)" -ForegroundColor Green
    Write-Host "   📋 Detalles:" -ForegroundColor Cyan
    $port3000 | ForEach-Object { Write-Host "      $_" }
} else {
    Write-Host "   ❌ Puerto 3000 no está en uso" -ForegroundColor Red
    Write-Host "   💡 Ejecuta: npm start" -ForegroundColor Yellow
}

Write-Host ""

# 4. Verificar firewall
Write-Host "4. Verificando reglas del firewall..." -ForegroundColor Yellow
$firewallRules = Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Vínculo*" -or $_.DisplayName -like "*3000*"} -ErrorAction SilentlyContinue
if ($firewallRules) {
    Write-Host "   ✅ Reglas del firewall encontradas:" -ForegroundColor Green
    $firewallRules | ForEach-Object {
        Write-Host "      - $($_.DisplayName): $($_.Direction) - $($_.Action)" -ForegroundColor Cyan
    }
} else {
    Write-Host "   ⚠️ No se encontraron reglas específicas del firewall" -ForegroundColor Yellow
    Write-Host "   💡 Puede que necesites crear una regla para el puerto 3000" -ForegroundColor Yellow
}

Write-Host ""

# 5. Resumen
Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host ""
if ($tailscaleIP) {
    Write-Host "📱 IP para usar en la app móvil: http://$tailscaleIP:3000" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔍 Prueba desde tu teléfono (con Tailscale activo):" -ForegroundColor Yellow
    Write-Host "   1. Abre el navegador" -ForegroundColor White
    Write-Host "   2. Ve a: http://$tailscaleIP:3000/api/health" -ForegroundColor White
    Write-Host "   3. Deberías ver un JSON con el estado de la conexión" -ForegroundColor White
} else {
    Write-Host "❌ Tailscale no está configurado correctamente" -ForegroundColor Red
}

Write-Host ""
Write-Host "Presiona Enter para continuar..."
Read-Host
