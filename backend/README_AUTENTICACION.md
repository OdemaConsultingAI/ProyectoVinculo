# Sistema de Autenticación - Vínculo SaaS

## Resumen

Se ha implementado un sistema completo de autenticación multi-usuario para convertir Vínculo en un SaaS (Software as a Service). Cada usuario tiene su propia data aislada y segura.

## Arquitectura

### Backend

1. **Modelo de Usuario** (`models/Usuario.js`)
   - Email único
   - Password hasheado con bcrypt
   - Nombre del usuario
   - Timestamps automáticos

2. **Modelo de Contacto** (`models/Contacto.js`)
   - Campo `usuarioId` para asociar cada contacto con un usuario
   - Índice compuesto único: `usuarioId + telefono` (evita duplicados por usuario)
   - Eliminada restricción `unique` global del teléfono

3. **Middleware de Autenticación** (`middleware/auth.js`)
   - Verificación de tokens JWT
   - Generación de tokens con expiración de 30 días
   - Extracción de información del usuario del token

4. **Rutas de Autenticación**
   - `POST /api/auth/register` - Registro de nuevo usuario
   - `POST /api/auth/login` - Login de usuario existente
   - `GET /api/auth/verify` - Verificar token (opcional)

5. **Rutas de Contactos (Protegidas)**
   - Todas las rutas ahora requieren autenticación (`authenticateToken`)
   - Filtrado automático por `usuarioId`
   - GET, POST, PUT, DELETE solo acceden a contactos del usuario autenticado

### Frontend (Mobile)

1. **Servicio de Autenticación** (`services/authService.js`)
   - `register()` - Registro de usuario
   - `login()` - Login de usuario
   - `logout()` - Cerrar sesión
   - `getToken()` - Obtener token guardado
   - `getUser()` - Obtener datos del usuario
   - `getAuthHeaders()` - Headers con token para peticiones API
   - Almacenamiento en AsyncStorage

2. **Pantalla de Login** (`screens/LoginScreen.js`)
   - Formulario de login/registro
   - Validación de campos
   - Manejo de errores
   - Interfaz moderna y limpia

3. **Navegación Condicional** (`App.js`)
   - Verifica autenticación al iniciar
   - Muestra LoginScreen si no está autenticado
   - Muestra tabs principales si está autenticado

4. **Pantalla de Configuración** (`screens/ConfiguracionScreen.js`)
   - Muestra información del usuario
   - Botón de logout con confirmación

5. **Llamadas API Actualizadas**
   - Todas las llamadas ahora usan `fetchWithAuth()` que incluye el token automáticamente
   - Headers `Authorization: Bearer <token>` en todas las peticiones

## Configuración

### Variables de Entorno (Backend)

Agregar al archivo `.env`:

```env
JWT_SECRET=tu_clave_secreta_super_segura_cambiar_en_produccion_2024
```

**⚠️ IMPORTANTE:** Cambiar `JWT_SECRET` por una clave segura y única en producción.

### Instalación de Dependencias

Backend:
```bash
npm install jsonwebtoken bcryptjs
```

Mobile:
- Ya incluye `@react-native-async-storage/async-storage` (usado para guardar token)

## Flujo de Autenticación

1. **Registro/Login**
   - Usuario ingresa email y password (y nombre si es registro)
   - Backend valida y crea/verifica usuario
   - Backend genera token JWT
   - Frontend guarda token y datos del usuario en AsyncStorage

2. **Peticiones API**
   - Frontend obtiene token de AsyncStorage
   - Agrega header `Authorization: Bearer <token>` a cada petición
   - Backend verifica token y extrae `userId`
   - Backend filtra datos por `usuarioId`

3. **Logout**
   - Frontend elimina token y datos del usuario de AsyncStorage
   - Redirige a pantalla de login

## Seguridad

- ✅ Passwords hasheados con bcrypt (salt rounds: 10)
- ✅ Tokens JWT con expiración (30 días)
- ✅ Validación de email y password mínimo
- ✅ Filtrado de datos por usuario en todas las consultas
- ✅ Middleware de autenticación en todas las rutas protegidas
- ✅ Índices de base de datos para optimizar búsquedas por usuario

## Migración de Datos Existentes

⚠️ **IMPORTANTE:** Si tienes datos existentes en la base de datos:

1. Los contactos existentes NO tienen `usuarioId`
2. Necesitarás crear un script de migración o asignar manualmente los contactos a usuarios
3. O simplemente empezar con usuarios nuevos (los contactos antiguos quedarán huérfanos)

## Próximos Pasos Sugeridos

1. **Recuperación de contraseña** - Implementar reset de password vía email
2. **Refresh tokens** - Implementar renovación automática de tokens
3. **Verificación de email** - Validar emails antes de activar cuenta
4. **Roles y permisos** - Si necesitas diferentes niveles de acceso
5. **Rate limiting** - Limitar intentos de login para prevenir ataques

## Testing

Para probar el sistema:

1. Inicia el backend: `npm start`
2. Inicia la app móvil: `npm start`
3. Registra un nuevo usuario
4. Verifica que solo veas tus propios contactos
5. Cierra sesión y registra otro usuario
6. Verifica que cada usuario ve solo sus contactos

## Notas Técnicas

- El token se guarda en AsyncStorage con la clave `@vinculo:token`
- Los datos del usuario se guardan con la clave `@vinculo:user`
- El token expira en 30 días (configurable en `middleware/auth.js`)
- El JWT_SECRET debe ser una cadena larga y aleatoria en producción
