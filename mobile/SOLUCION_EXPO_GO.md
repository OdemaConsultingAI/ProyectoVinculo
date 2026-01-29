# Solución para Expo Go - Conexión vía Tailscale

## No necesitas hacer build nativo

Si estás usando **Expo Go**, NO necesitas ejecutar `expo run:android`. Solo necesitas:

## Pasos para Solucionar

### 1. Recargar la App en Expo Go

En la terminal de Metro donde está corriendo `expo start -c`:

1. Presiona `r` para recargar la app
2. O cierra completamente Expo Go en tu teléfono y ábrelo de nuevo
3. Escanea el QR code de nuevo

### 2. Verificar los Logs en la Consola

Cuando la app se carga, deberías ver en la consola de Metro:

```
🔗 API_URL configurada: http://100.121.1.120:3000/api/contacto
🌐 API_BASE_URL: http://100.121.1.120:3000
```

Y cuando intenta cargar datos:

```
📡 Intentando conectar a: http://100.121.1.120:3000/api/contacto
```

### 3. Si Aún No Funciona - Verificar Tailscale en el Teléfono

1. **Abre la app Tailscale en tu teléfono**
2. **Verifica que esté conectado** (debe mostrar "Connected" o el ícono verde)
3. **Verifica que puedas ver tu servidor** en la lista de dispositivos de Tailscale

### 4. Probar desde el Navegador del Teléfono Primero

1. Con Tailscale activo en el teléfono
2. Abre Chrome/Safari
3. Ve a: `http://100.121.1.120:3000/api/health`
4. Si esto funciona, el problema está en la configuración de la app

### 5. Verificar que la App Esté Usando la Nueva URL

Los logs deberían mostrar la URL. Si ves `192.168.0.6` en lugar de `100.121.1.120`, significa que la app está usando código cacheado.

**Solución:**
- Cierra completamente Expo Go
- Mata el proceso de Metro (`Ctrl+C`)
- Ejecuta de nuevo: `npx expo start -c`
- Abre Expo Go de nuevo y escanea el QR

## Nota Importante sobre Expo Go

Expo Go puede tener limitaciones con conexiones HTTP personalizadas. Si después de todos estos pasos aún no funciona, puede ser necesario:

1. **Usar un desarrollo build** (requiere Android Studio)
2. **O usar la IP local cuando estés en la misma red WiFi**

## Alternativa Temporal

Si necesitas que funcione AHORA mientras solucionamos Tailscale:

1. Cambia temporalmente en `mobile/constants/api.js`:
   ```javascript
   export const API_BASE_URL = 'http://192.168.0.6:3000'; // IP local
   ```
2. Asegúrate de estar en la misma red WiFi
3. Recarga la app (`r` en Metro)
