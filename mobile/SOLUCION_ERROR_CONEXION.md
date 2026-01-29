# 🔧 Solución: Error "Network request failed"

## Problema
La app muestra: `ERROR Error verificando autenticación: [TypeError: Network request failed]`

Esto significa que la app **no puede conectarse** al backend.

---

## ✅ Soluciones (elige una)

### Opción 1: Usar la Nube (Render) - MÁS FÁCIL para pruebas

Si tu backend ya está desplegado en Render (`https://proyectovinculo.onrender.com`), puedes usar esa URL:

1. Abre `mobile/constants/config.js`
2. Cambia la línea 5:
   ```javascript
   const FORCE_ENV = 'production'; // Cambiar de 'auto' a 'production'
   ```
3. Guarda el archivo
4. Reinicia Expo Go (sacude el teléfono y presiona "Reload")

**Ventaja:** No necesitas tener el backend corriendo en tu PC.

---

### Opción 2: Usar tu PC local (Tailscale)

Si quieres usar tu backend local:

#### Paso 1: Verificar que el backend esté corriendo

En PowerShell:
```powershell
cd C:\DEV\ProyectoVinculo\backend
npm start
```

Deberías ver:
```
🚀 Servidor ejecutándose en puerto 3000
🌐 Host: 0.0.0.0
💚 Health check: http://localhost:3000/api/health
```

#### Paso 2: Verificar tu IP de Tailscale

En PowerShell:
```powershell
tailscale ip
```

Debería mostrar algo como: `100.121.1.120` (o similar)

#### Paso 3: Actualizar la IP en config.js

1. Abre `mobile/constants/config.js`
2. Si tu IP cambió, actualiza la línea 8:
   ```javascript
   API_BASE_URL: 'http://TU-IP-TAILSCALE:3000', // Ejemplo: 'http://100.121.1.120:3000'
   ```
3. Asegúrate que `FORCE_ENV` esté en `'auto'` o `'development'`
4. Guarda y reinicia Expo Go

#### Paso 4: Probar la conexión

Abre en el navegador de tu PC:
```
http://TU-IP-TAILSCALE:3000/api/health
```

Deberías ver un JSON con `{ "status": "ok" }` o similar.

---

## 🔍 Verificar qué está pasando

### En la consola de Expo (donde ejecutaste `npm start`)

Busca estos mensajes:
- `🔧 Ambiente: development` o `production`
- `🔗 API_BASE_URL: http://...` o `https://...`
- `🔐 Verificando token en: ...`

Si ves `API_BASE_URL` con una IP incorrecta o `undefined`, hay un problema de configuración.

---

## ⚠️ Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `Network request failed` | Backend no accesible | Usar Opción 1 (Nube) o verificar backend local |
| IP incorrecta | Tailscale cambió la IP | Actualizar IP en `config.js` |
| Puerto incorrecto | Backend en otro puerto | Verificar que backend esté en puerto 3000 |
| CORS error | Backend rechaza la conexión | Verificar CORS en `backend/index.js` |

---

## 💡 Recomendación

**Para pruebas rápidas:** Usa la **Opción 1** (Nube) cambiando `FORCE_ENV` a `'production'`.  
**Para desarrollo activo:** Usa la **Opción 2** (PC local) con Tailscale.

---

## 📝 Nota

El indicador **"PC"** o **"Nube"** en la app te muestra qué URL está usando actualmente.
