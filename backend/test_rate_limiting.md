# 🧪 Prueba de Rate Limiting

## ⚠️ IMPORTANTE
**Reinicia el servidor** después de cambiar `skipSuccessfulRequests` para que los cambios surtan efecto.

```bash
# Detener el servidor actual (Ctrl+C)
# Luego reiniciar:
cd backend
npm start
```

## 📋 Cómo Probar Rate Limiting

### 1. Prueba de Login (5 intentos máximo)

Después de reiniciar el servidor, ejecuta este comando en PowerShell:

```powershell
$body = @{email='test@example.com'; password='wrongpassword'} | ConvertTo-Json
for ($i=1; $i -le 6; $i++) {
    Write-Host "Intento $i :" -NoNewline
    try {
        $response = Invoke-WebRequest -Uri http://localhost:3000/api/auth/login -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing -ErrorAction Stop
        Write-Host " OK (Status: $($response.StatusCode))"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        $reader.Close()
        try {
            $json = $responseBody | ConvertFrom-Json
            if ($status -eq 429) {
                Write-Host " 🔴 BLOQUEADO - $($json.error)" -ForegroundColor Red
            } else {
                Write-Host " Status $status - $($json.error)"
            }
        } catch {
            if ($status -eq 429) {
                Write-Host " 🔴 BLOQUEADO - Rate limit alcanzado" -ForegroundColor Red
            } else {
                Write-Host " Status $status"
            }
        }
    }
    Start-Sleep -Milliseconds 300
}
```

### Resultado Esperado:
- **Intentos 1-5**: Status 401 (Credenciales inválidas)
- **Intento 6**: Status 429 (Too Many Requests) con mensaje de rate limit

### 2. Verificar Headers de Rate Limit

Los headers deberían incluir:
- `X-RateLimit-Limit`: 5
- `X-RateLimit-Remaining`: disminuye con cada intento
- `X-RateLimit-Reset`: timestamp de cuando se resetea el contador

### 3. Esperar y Probar Nuevamente

Después de 15 minutos, deberías poder hacer login nuevamente (o cambiar el tiempo en el código para pruebas más rápidas).

## 🔧 Configuración Actual

- **Login**: 5 intentos / 15 minutos
- **Registro**: 3 intentos / hora  
- **Cambio de contraseña**: 5 intentos / 15 minutos
- **API general**: 100 requests / minuto

## ✅ Qué Verificar

1. ✅ El 6to intento debe devolver Status 429
2. ✅ El mensaje debe ser claro: "Demasiados intentos de login..."
3. ✅ Los headers deben mostrar información del rate limit
4. ✅ Después del tiempo de espera, debe permitir intentos nuevamente
