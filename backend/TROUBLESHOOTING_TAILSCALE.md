# Troubleshooting - Acceso desde Teléfono vía Tailscale

## Checklist de Verificación

### ✅ 1. Servidor está corriendo correctamente
- ✅ Servidor en puerto 3000
- ✅ MongoDB Atlas conectado
- ✅ Escuchando en 0.0.0.0 (todas las interfaces)

### 🔍 2. Verificar Tailscale en el Servidor

Ejecuta en PowerShell:
```powershell
# Ver tu IP de Tailscale
tailscale ip

# Ver estado de Tailscale
tailscale status

# Verificar que Tailscale esté activo
Get-Process -Name tailscale -ErrorAction SilentlyContinue
```

**Deberías ver:**
- IP de Tailscale: `100.121.1.120` (o similar)
- Estado: "Connected"

### 🔍 3. Verificar Tailscale en el Teléfono

1. Abre la app Tailscale en tu teléfono
2. Verifica que esté **conectado** (debería mostrar "Connected" o "VPN activa")
3. Verifica que puedas ver tu servidor en la lista de dispositivos

### 🔍 4. Verificar Firewall de Windows

El firewall puede estar bloqueando las conexiones de Tailscale. Ejecuta:

```powershell
# Ver reglas del firewall relacionadas con el puerto 3000
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*3000*" -or $_.LocalPort -eq 3000}

# Crear regla para permitir conexiones en puerto 3000 (ejecutar como Administrador)
New-NetFirewallRule -DisplayName "Vínculo Backend Tailscale" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Any
```

### 🔍 5. Probar Conexión desde el Teléfono

**Paso 1: Probar desde navegador del teléfono**

1. Con Tailscale activo en el teléfono
2. Abre el navegador
3. Ve a: `http://100.121.1.120:3000/api/health`
4. Deberías ver un JSON con el estado

**Si NO funciona:**
- Verifica que Tailscale esté activo en el teléfono
- Verifica que la IP sea correcta (`tailscale ip` en el servidor)
- Verifica el firewall de Windows

**Paso 2: Verificar desde la app**

1. Abre la app móvil
2. Debería intentar conectarse automáticamente
3. Revisa los logs en la consola de desarrollo

### 🔍 6. Verificar Configuración de la App Móvil

Abre `mobile/constants/api.js` y verifica que tenga:
```javascript
export const API_BASE_URL = 'http://100.121.1.120:3000';
```

**Importante:** 
- Debe ser `http://` (no `https://`)
- Debe incluir el puerto `:3000`
- La IP debe ser la de Tailscale del servidor

### 🔍 7. Verificar que Ambos Dispositivos Estén en la Misma Red Tailscale

1. Ve a https://login.tailscale.com/admin/machines
2. Deberías ver:
   - Tu servidor Windows con IP `100.121.1.120`
   - Tu teléfono con otra IP de Tailscale
3. Ambos deben estar "Online" y "Authorized"

## Soluciones Comunes

### Problema: "Network request failed"

**Causa:** Firewall bloqueando conexiones o Tailscale no activo

**Solución:**
1. Verifica que Tailscale esté activo en ambos dispositivos
2. Configura el firewall de Windows (ver paso 4)
3. Reinicia Tailscale en ambos dispositivos

### Problema: "Connection refused"

**Causa:** Servidor no está escuchando en la IP correcta o firewall bloqueando

**Solución:**
1. Verifica que el servidor esté corriendo
2. Verifica el firewall
3. Prueba desde el navegador del teléfono primero

### Problema: La app carga pero no muestra datos

**Causa:** La conexión funciona pero hay un error en la API

**Solución:**
1. Revisa los logs del servidor
2. Verifica que MongoDB Atlas esté conectado
3. Prueba el endpoint `/api/health` desde el navegador

## Comandos de Diagnóstico

```powershell
# En el servidor - Ver IP de Tailscale
tailscale ip

# En el servidor - Ver qué está escuchando en puerto 3000
netstat -ano | findstr :3000

# En el servidor - Ver procesos de Node
Get-Process -Name node

# En el servidor - Ver reglas del firewall
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Vínculo*"}
```

## Prueba Rápida desde el Teléfono

1. **Con Tailscale activo**, abre el navegador
2. Ve a: `http://100.121.1.120:3000/api/health`
3. **Deberías ver:**
   ```json
   {
     "estado": "conectado",
     "readyState": 1,
     "timestamp": "..."
   }
   ```

Si esto funciona pero la app no, el problema está en la configuración de la app móvil.
