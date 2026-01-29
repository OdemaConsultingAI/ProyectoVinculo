# Solución: Expo Go con Tailscale

## Problema Identificado

El error "Failed to download remote update" ocurre porque:
1. **Expo Go** necesita conectarse a **Metro Bundler** (puerto 8081)
2. Metro está escuchando en `192.168.0.6:8081` (IP local)
3. Cuando estás fuera de WiFi, Expo Go no puede alcanzar esa IP
4. Aunque Tailscale esté activo, Expo Go no sabe usar la IP de Tailscale para Metro

## Soluciones

### Opción 1: Usar Tunnel de Expo (Recomendado)

Expo tiene un modo "tunnel" que funciona desde cualquier lugar:

```bash
# Detén Metro actual (Ctrl+C)
# Luego ejecuta:
npx expo start --tunnel
```

Esto crea un túnel público que funciona desde cualquier lugar, pero puede ser más lento.

### Opción 2: Configurar Expo para Usar IP de Tailscale

1. **Obtén la IP de Tailscale del servidor:**
   ```powershell
   tailscale ip
   ```
   Ejemplo: `100.121.1.120`

2. **Inicia Expo con la IP de Tailscale:**
   ```bash
   npx expo start --host tunnel
   # O específicamente:
   EXPO_DEVTOOLS_LISTEN_ADDRESS=100.121.1.120 npx expo start
   ```

### Opción 3: Usar Tunnel de Expo (Más Simple)

```bash
npx expo start --tunnel
```

Esto usa los servidores de Expo para crear un túnel, funciona desde cualquier lugar pero requiere conexión a internet.

## Configuración Recomendada

Actualiza `package.json` para facilitar el uso:

```json
"scripts": {
  "start": "expo start --tunnel",
  "start:local": "expo start --offline",
  "start:tailscale": "EXPO_DEVTOOLS_LISTEN_ADDRESS=100.121.1.120 expo start"
}
```

## Pasos Inmediatos

1. **Detén Metro actual** (Ctrl+C)
2. **Ejecuta con tunnel:**
   ```bash
   npx expo start --tunnel
   ```
3. **Escanea el nuevo QR code** que aparecerá
4. **La app debería cargar** desde cualquier lugar

## Nota Importante

- El modo `--tunnel` puede ser más lento que conexión local
- Requiere conexión a internet (usa servidores de Expo)
- Es la forma más fácil de hacer que funcione desde cualquier lugar
