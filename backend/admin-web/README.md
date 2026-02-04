# Panel administrativo – Vínculo

Panel web para ver estadísticas de la app y listado de usuarios. **Solo usuarios con plan Administrador** pueden acceder.

## Cómo acceder

1. Asigna el rol Administrador a un usuario desde el backend:
   ```bash
   node scripts/setAdministrador.js tu@email.com
   ```
2. Con el servidor corriendo, abre en el navegador:
   - Local: `http://localhost:3000/admin`
   - Producción: `https://tu-dominio.com/admin`
3. Inicia sesión con ese email y contraseña.

## Qué muestra

- **Estadísticas globales**: total de usuarios, registros últimos 7/30 días, usuarios por plan (Free/Premium/Administrador), total de contactos, total de interacciones, uso de IA (hoy y mes), coste estimado en USD.
- **Listado de usuarios**: tabla paginada con email, nombre, plan, fecha de registro, último acceso, número de contactos, interacciones, uso de IA y coste por usuario.

## APIs (solo Administrador)

- `GET /api/admin/stats` – Estadísticas agregadas.
- `GET /api/admin/users?page=1&limit=20` – Lista de usuarios con métricas.

El backend actualiza `lastLoginAt` en cada login para reflejar el último acceso en el panel.
