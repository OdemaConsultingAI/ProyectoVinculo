# Cómo Iniciar Expo

## Pasos Rápidos

1. **Abre una terminal PowerShell** en la carpeta del proyecto móvil:
   ```powershell
   cd C:\DEV\ProyectoVinculo\mobile
   ```

2. **Inicia Expo con tunnel** (para que funcione desde cualquier lugar con Tailscale):
   ```powershell
   npm start
   ```
   
   O directamente:
   ```powershell
   npx expo start --tunnel
   ```

3. **Escanea el QR code** que aparece en la terminal con la app Expo Go en tu teléfono.

## Comandos Disponibles

- `npm start` - Inicia con tunnel (recomendado para Tailscale)
- `npm run start:local` - Inicia en modo local (solo WiFi local)
- `npm run android` - Inicia y abre en Android directamente
- `npm run ios` - Inicia y abre en iOS directamente

## Notas Importantes

- **Tunnel**: Usa `--tunnel` para que funcione desde cualquier lugar con Tailscale
- **Cache**: Si hay problemas, limpia el cache con `npx expo start -c`
- **Puerto**: Expo usa el puerto 8081 por defecto
- **Backend**: Asegúrate de que el backend esté corriendo en el puerto 3000

## Solución de Problemas

Si tienes problemas de conexión:
1. Verifica que el backend esté corriendo: `cd ..\backend && npm start`
2. Verifica la IP de Tailscale en `mobile/constants/api.js`
3. Limpia el cache: `npx expo start -c`
4. Reinicia completamente la app en el teléfono
