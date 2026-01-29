# Troubleshooting: Error de Registro "Network request failed"

## 🔍 Diagnóstico del Problema

El error "Network request failed" indica que la app móvil no puede conectarse al servidor backend. Sigue estos pasos para diagnosticar:

## ✅ Checklist de Verificación

### 1. Verificar que el Backend esté Corriendo

En el servidor (donde corre el backend), ejecuta:

```powershell
# Verificar que el servidor esté corriendo
netstat -ano | findstr :3000

# O verifica en el proceso de Node
Get-Process node
```

**Solución**: Si no está corriendo, inicia el servidor:
```powershell
cd backend
npm start
```

Deberías ver:
```
🚀 Servidor ejecutándose en puerto 3000
🌐 Host: 0.0.0.0
💚 Health check: http://localhost:3000/api/health
```

### 2. Verificar IP de Tailscale

En el servidor, ejecuta:
```powershell
tailscale ip
```

Debería mostrar algo como: `100.121.1.120`

**Solución**: Si la IP cambió, actualiza `mobile/constants/api.js`:
```javascript
export const API_BASE_URL = 'http://TU_NUEVA_IP:3000';
```

### 3. Probar Conexión desde el Teléfono

Abre el navegador en tu teléfono y visita:
```
http://100.121.1.120:3000/api/health
```

**Deberías ver**:
```json
{
  "estado": "conectado",
  "readyState": 1,
  "timestamp": "..."
}
```

**Si no funciona**:
- Verifica que Tailscale esté activo en ambos dispositivos
- Verifica que el firewall del servidor permita conexiones en el puerto 3000

### 4. Verificar Logs del Backend

Cuando intentas registrar, deberías ver en la consola del servidor:
```
POST /api/auth/register
```

**Si no ves nada**: El servidor no está recibiendo la petición (problema de red/firewall)

### 5. Verificar Logs de la App

En Metro Bundler, deberías ver:
```
📡 Intentando registrar usuario en: http://100.121.1.120:3000/api/auth/register
📧 Email: ...
👤 Nombre: ...
```

**Si ves estos logs pero falla**: Problema de conexión de red

## 🔧 Soluciones Comunes

### Problema 1: Servidor no está corriendo
**Solución**: Inicia el servidor backend

### Problema 2: IP de Tailscale incorrecta
**Solución**: 
1. Obtén la IP actual: `tailscale ip` en el servidor
2. Actualiza `mobile/constants/api.js`
3. Reinicia la app móvil

### Problema 3: Firewall bloqueando conexiones
**Solución**: En el servidor Windows, permite el puerto 3000:
```powershell
# Verificar reglas de firewall
netsh advfirewall firewall show rule name=all | findstr 3000

# Agregar regla si no existe
netsh advfirewall firewall add rule name="Node.js Server" dir=in action=allow protocol=TCP localport=3000
```

### Problema 4: Tailscale no conectado
**Solución**: 
1. Verifica que Tailscale esté activo en ambos dispositivos
2. Verifica que ambos dispositivos estén en la misma red Tailscale
3. Prueba hacer ping desde el teléfono al servidor

### Problema 5: CORS o configuración del servidor
**Solución**: Verifica que `backend/index.js` tenga:
```javascript
app.use(cors()); // Debe estar antes de las rutas
```

## 📱 Prueba Rápida

1. **Desde el navegador del teléfono**, visita:
   ```
   http://100.121.1.120:3000/api/health
   ```
   Si funciona → El problema es en la app móvil
   Si no funciona → El problema es de red/servidor

2. **Desde la app móvil**, revisa los logs en Metro Bundler:
   - Busca los mensajes con 📡
   - Verifica la URL que está intentando usar
   - Verifica si hay errores adicionales

## 🆘 Si Nada Funciona

1. **Reinicia el servidor backend**
2. **Reinicia la app móvil** (cierra completamente Expo Go)
3. **Verifica que ambos dispositivos estén en la misma red Tailscale**
4. **Prueba con la IP local** si estás en la misma red WiFi:
   ```javascript
   export const API_BASE_URL = 'http://192.168.0.6:3000';
   ```

## 📝 Logs Útiles

Cuando intentes registrar, deberías ver en Metro Bundler:
```
🔗 API_URL configurada: http://100.121.1.120:3000/api/contacto
🌐 API_BASE_URL: http://100.121.1.120:3000
🔐 URL de registro: http://100.121.1.120:3000/api/auth/register
📡 Intentando registrar usuario en: http://100.121.1.120:3000/api/auth/register
📧 Email: Agonzalezc80@gmail.com
👤 Nombre: Arquimedes González
```

Si ves estos logs pero luego falla, el problema es de conexión de red.
