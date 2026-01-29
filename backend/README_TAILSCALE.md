# Configuración Tailscale para Acceso Remoto

## ¿Qué es Tailscale?

Tailscale es una VPN que permite acceder a tu servidor desde cualquier lugar usando una red privada virtual segura.

## Pasos para Configurar Tailscale

### 1. Instalar Tailscale en el Servidor (Windows)

1. Descarga Tailscale desde: https://tailscale.com/download
2. Instala Tailscale en tu computadora Windows
3. Inicia sesión con tu cuenta (puedes usar Google, Microsoft, etc.)
4. Verifica que Tailscale esté corriendo (deberías ver el ícono en la bandeja del sistema)

### 2. Obtener la IP de Tailscale del Servidor

**Opción A: Desde la línea de comandos**
```powershell
tailscale ip
```

**Opción B: Desde el Dashboard de Tailscale**
1. Ve a https://login.tailscale.com/admin/machines
2. Busca tu máquina Windows
3. Copia la IP que aparece (formato: `100.x.x.x`)

### 3. Instalar Tailscale en tu Teléfono

1. **Android**: Descarga "Tailscale" desde Google Play Store
2. **iOS**: Descarga "Tailscale" desde App Store
3. Inicia sesión con la misma cuenta que usaste en el servidor
4. Activa la VPN desde la app

### 4. Configurar la App Móvil

1. Abre el archivo: `mobile/constants/api.js`
2. Reemplaza `100.x.x.x` con tu IP de Tailscale real:
   ```javascript
   export const API_BASE_URL = 'http://100.123.45.67:3000'; // Tu IP de Tailscale
   ```
3. Guarda el archivo

### 5. Verificar que el Servidor Esté Escuchando Correctamente

El servidor ya está configurado para escuchar en `0.0.0.0` (todas las interfaces), lo cual es correcto para Tailscale.

### 6. Probar la Conexión

1. Asegúrate de que Tailscale esté activo en tu teléfono
2. Abre la app móvil
3. Debería conectarse al servidor usando la IP de Tailscale

## Troubleshooting

### La app no se conecta

1. **Verifica que Tailscale esté activo en ambos dispositivos**
   - Servidor: Verifica el ícono en la bandeja del sistema
   - Teléfono: Verifica que la VPN esté activa en la app

2. **Verifica la IP de Tailscale**
   ```powershell
   tailscale ip
   ```
   Asegúrate de usar esta IP exacta en `mobile/constants/api.js`

3. **Verifica que el servidor esté corriendo**
   ```powershell
   npm start
   ```

4. **Prueba la conexión desde el teléfono**
   - Abre un navegador en tu teléfono
   - Ve a: `http://TU_IP_TAILSCALE:3000/api/health`
   - Deberías ver un JSON con el estado de la conexión

### El servidor no responde

1. Verifica que el firewall de Windows permita conexiones en el puerto 3000
2. Verifica que Tailscale esté corriendo en el servidor
3. Reinicia Tailscale si es necesario

## Ventajas de Usar Tailscale

✅ Acceso desde cualquier lugar (no necesitas estar en la misma red WiFi)
✅ Coneexión segura y encriptada
✅ No necesitas configurar port forwarding en tu router
✅ Funciona detrás de NAT/firewalls
✅ Fácil de configurar

## Notas Importantes

- La IP de Tailscale puede cambiar si reinicias Tailscale, pero generalmente es estable
- Si cambias de red WiFi, Tailscale seguirá funcionando
- Asegúrate de mantener Tailscale activo en ambos dispositivos
