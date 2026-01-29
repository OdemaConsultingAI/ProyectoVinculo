# Cómo Limpiar el Caché de la App Móvil

## Problema: La app no se conecta aunque el navegador sí funciona

Esto generalmente es causado por caché de Metro Bundler o de la app.

## Solución: Limpiar Caché y Reiniciar

### Paso 1: Detener Metro Bundler

En la terminal donde está corriendo `expo start` o `npm start`:
- Presiona `Ctrl + C` para detenerlo

### Paso 2: Limpiar Caché de Metro

```bash
# Limpiar caché de Expo/Metro
npx expo start -c

# O si usas npm directamente
npm start -- --reset-cache
```

### Paso 3: Limpiar Caché de la App en el Dispositivo

**Android:**
1. Ve a Configuración → Aplicaciones
2. Busca tu app "mobile" o "Vínculo"
3. Toca "Almacenamiento"
4. Toca "Borrar datos" y "Borrar caché"
5. O desinstala y reinstala la app

**iOS:**
1. Mantén presionado el ícono de la app
2. Toca "Eliminar app"
3. Reinstala desde Expo Go o tu build

### Paso 4: Reiniciar la App

1. Cierra completamente la app (no solo minimizar)
2. Abre la app de nuevo
3. Debería cargar con la nueva configuración

## Verificar que Está Usando la URL Correcta

Después de limpiar el caché, deberías ver en la consola de Metro:

```
🔗 API_URL configurada: http://100.121.1.120:3000/api/contacto
🌐 API_BASE_URL: http://100.121.1.120:3000
```

Y cuando la app intente cargar datos:

```
📡 Intentando conectar a: http://100.121.1.120:3000/api/contacto
📡 Respuesta recibida, status: 200
```

## Si Aún No Funciona

1. **Verifica los logs de la consola** - Busca errores de red
2. **Verifica que Tailscale esté activo** en el teléfono
3. **Prueba desde el navegador del teléfono** primero para confirmar que Tailscale funciona
4. **Reinicia Tailscale** en ambos dispositivos
