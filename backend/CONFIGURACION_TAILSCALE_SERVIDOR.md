# Configuración de Tailscale en el Servidor

## Configuración Necesaria para Permitir Conexiones Entrantes

### 1. Verificar que Tailscale esté Corriendo

En PowerShell del servidor:
```powershell
tailscale status
```

Deberías ver tu máquina listada con su IP de Tailscale (ej: `100.121.1.120`).

### 2. Configurar el Servidor como "Subnet Router" (Opcional pero Recomendado)

Si quieres que otros dispositivos puedan acceder a través de Tailscale:

**Opción A: Desde la línea de comandos (Recomendado)**

```powershell
# Habilitar como subnet router (permite que otros dispositivos accedan)
tailscale up --advertise-routes=0.0.0.0/0 --accept-routes=false
```

**Opción B: Desde el Dashboard de Tailscale**

1. Ve a https://login.tailscale.com/admin/machines
2. Busca tu máquina Windows (servidor)
3. Haz clic en los tres puntos (⋯) → "Edit route settings"
4. Marca "Use as exit node" si quieres que otros dispositivos usen tu conexión
5. O configura "Subnet routes" si necesitas compartir una subnet específica

### 3. Aprobar el Servidor en el Dashboard (IMPORTANTE)

1. Ve a https://login.tailscale.com/admin/machines
2. Busca tu máquina Windows
3. Si aparece con un ícono de "pending" o "needs approval":
   - Haz clic en "Approve" o "Authorize"
   - Esto permite que otros dispositivos se conecten a este servidor

### 4. Verificar Configuración del Firewall de Windows

El servidor ya está configurado para escuchar en `0.0.0.0` (todas las interfaces), pero necesitas permitir el puerto en el firewall:

**Desde PowerShell (como Administrador):**
```powershell
# Permitir conexiones entrantes en el puerto 3000
New-NetFirewallRule -DisplayName "Vínculo Backend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

O manualmente:
1. Abre "Windows Defender Firewall"
2. "Configuración avanzada"
3. "Reglas de entrada" → "Nueva regla"
4. Puerto → TCP → 3000
5. Permitir la conexión
6. Aplica a todos los perfiles
7. Nombre: "Vínculo Backend"

### 5. Verificar que el Servidor Esté Escuchando Correctamente

El archivo `index.js` ya está configurado para escuchar en `0.0.0.0`, lo cual es correcto. Verifica que el servidor esté corriendo:

```powershell
npm start
```

Deberías ver:
```
🚀 Servidor ejecutándose en puerto 3000
🌐 Host: 0.0.0.0
```

### 6. Probar la Conexión desde Otro Dispositivo

**Desde tu teléfono (con Tailscale activo):**

1. Abre un navegador
2. Ve a: `http://100.121.1.120:3000/api/health`
3. Deberías ver un JSON con el estado de la conexión

## Configuración Específica para Tu Caso de Uso

Para que la app móvil se conecte al servidor, NO necesitas configurar "Exit Node" ni "Subnet Routes". Solo necesitas:

✅ **Tailscale corriendo en ambos dispositivos**
✅ **Ambos dispositivos aprobados en el dashboard**
✅ **Firewall de Windows permitiendo el puerto 3000**
✅ **Servidor escuchando en 0.0.0.0** (ya está configurado)

## Troubleshooting

### "Connection refused" o "Network request failed"

1. **Verifica que Tailscale esté activo en ambos dispositivos**
   ```powershell
   # En el servidor
   tailscale status
   ```

2. **Verifica el firewall de Windows**
   ```powershell
   # Ver reglas del firewall
   Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Vínculo*"}
   ```

3. **Verifica que el servidor esté corriendo**
   ```powershell
   # Ver qué está escuchando en el puerto 3000
   netstat -ano | findstr :3000
   ```

4. **Prueba desde el mismo servidor**
   ```powershell
   # Debería funcionar
   curl http://localhost:3000/api/health
   ```

### El servidor no aparece en el dashboard

1. Reinicia Tailscale:
   ```powershell
   # Detener
   tailscale down
   # Iniciar
   tailscale up
   ```

2. Verifica que estés usando la misma cuenta en ambos dispositivos

## Comandos Útiles de Tailscale

```powershell
# Ver estado
tailscale status

# Ver tu IP de Tailscale
tailscale ip

# Ver información detallada
tailscale status --json

# Reiniciar Tailscale
tailscale down
tailscale up
```
