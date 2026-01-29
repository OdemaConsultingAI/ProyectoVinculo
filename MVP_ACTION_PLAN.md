# 🎯 Plan de Acción MVP - Vínculos App

## Objetivo
Convertir la app en un MVP funcional, seguro y listo para usuarios reales, **sin activar funciones premium**.

---

## 📋 Checklist MVP (En orden de prioridad)

### 🔴 FASE 1: Seguridad y Validación (CRÍTICO - 1-2 semanas)

#### 1.1 Validación Backend
- [ ] **Instalar express-validator**
  ```bash
  cd backend
  npm install express-validator
  ```

- [ ] **Crear middleware de validación** (`backend/middleware/validation.js`)
  - Validar registro de usuario (email, password, nombre)
  - Validar login (email, password)
  - Validar creación/actualización de contactos
  - Validar cambio de contraseña
  - Validar teléfonos (formato internacional)
  - Validar fechas (cumpleaños, tareas)

- [ ] **Aplicar validación en todas las rutas** (`backend/index.js`)
  - POST `/api/auth/register`
  - POST `/api/auth/login`
  - POST `/api/contacto`
  - PUT `/api/contacto/:id`
  - DELETE `/api/contacto/:id`
  - PUT `/api/auth/change-password`

#### 1.2 Sanitización
- [ ] **Sanitizar todos los inputs**
  - Trim espacios en blanco
  - Normalizar emails (lowercase)
  - Normalizar teléfonos (formato estándar)
  - Limitar longitud de campos de texto
  - Validar ObjectIds de MongoDB

#### 1.3 Seguridad HTTP
- [ ] **Instalar helmet**
  ```bash
  cd backend
  npm install helmet
  ```

- [ ] **Configurar helmet en backend** (`backend/index.js`)
  ```javascript
  const helmet = require('helmet');
  app.use(helmet());
  ```

- [ ] **Configurar CORS específico**
  - Solo permitir dominios de la app en producción
  - Configurar métodos HTTP permitidos

#### 1.4 Rate Limiting
- [ ] **Instalar express-rate-limit**
  ```bash
  cd backend
  npm install express-rate-limit
  ```

- [ ] **Implementar rate limiting**
  - Login: 5 intentos por IP cada 15 minutos
  - Registro: 3 intentos por IP cada hora
  - API general: 100 requests por minuto por IP

---

### 🟡 FASE 2: Manejo de Errores (CRÍTICO - 3-5 días)

#### 2.1 Error Handling Backend
- [ ] **Crear middleware de errores centralizado** (`backend/middleware/errorHandler.js`)
  - Capturar todos los errores
  - Formatear respuestas de error consistentes
  - Logging de errores
  - No exponer detalles técnicos al cliente

- [ ] **Códigos de error estándar**
  - USER_NOT_FOUND
  - INVALID_CREDENTIALS
  - VALIDATION_ERROR
  - UNAUTHORIZED
  - SERVER_ERROR

#### 2.2 Error Handling Frontend
- [ ] **Crear servicio de manejo de errores** (`mobile/services/errorService.js`)
  - Traducir códigos de error a mensajes user-friendly
  - Mostrar toasts/alertas apropiadas
  - Manejar errores de red
  - Manejar errores de autenticación

- [ ] **Error Boundaries**
  - Implementar Error Boundary en App.js
  - Pantalla de error amigable

#### 2.3 Logging
- [ ] **Instalar winston** (opcional, o usar console.log estructurado)
  ```bash
  cd backend
  npm install winston
  ```

- [ ] **Configurar logging estructurado**
  - Logs de errores
  - Logs de operaciones críticas
  - Logs de autenticación

---

### 🟢 FASE 3: Testing Básico (IMPORTANTE - 1 semana)

#### 3.1 Testing Backend
- [ ] **Instalar Jest**
  ```bash
  cd backend
  npm install --save-dev jest supertest
  ```

- [ ] **Tests críticos**
  - Tests de autenticación (login, registro)
  - Tests de CRUD de contactos
  - Tests de validación
  - Tests de autorización (multi-tenancy)

#### 3.2 Testing Frontend (Opcional para MVP)
- [ ] **Tests básicos de componentes críticos**
  - LoginScreen
  - VinculosScreen (carga de datos)

---

### 🔵 FASE 4: Performance Básica (IMPORTANTE - 2-3 días)

#### 4.1 Database Optimization
- [ ] **Agregar índices en MongoDB**
  - `usuarioId` en Contacto (ya existe)
  - `email` en Usuario (único)
  - `telefono` en Contacto (si es único por usuario)

#### 4.2 Frontend Optimization
- [ ] **Paginación en listas grandes**
  - Implementar paginación en VinculosScreen si hay muchos contactos
  - Implementar paginación en TareasScreen

- [ ] **Optimizar imágenes**
  - Comprimir imágenes antes de subirlas
  - Usar thumbnails para listas

#### 4.3 Caching Básico
- [ ] **Mejorar cache offline**
  - Ya tienes AsyncStorage, asegurar que funcione bien
  - Validar que la sincronización offline funcione correctamente

---

### 🟣 FASE 5: Build y Deployment (CRÍTICO - 1 semana)

#### 5.1 Environment Configuration
- [ ] **Completar .env.example**
  ```env
  MONGODB_URI=
  JWT_SECRET=
  PORT=3000
  HOST=0.0.0.0
  NODE_ENV=production
  API_URL=
  ```

- [ ] **Crear .env.production**
  - Variables para producción
  - NO commitear este archivo

#### 5.2 CI/CD Básico
- [ ] **GitHub Actions básico** (`.github/workflows/deploy.yml`)
  - Lint y tests en cada push
  - Build automático en merge a main

#### 5.3 Build Mobile
- [ ] **Configurar EAS Build**
  ```bash
  cd mobile
  npm install -g eas-cli
  eas login
  eas build:configure
  ```

- [ ] **Configurar app.json/app.config.js**
  - Versión de app
  - Bundle identifier
  - Iconos y splash screens

- [ ] **Build de prueba**
  ```bash
  eas build --platform android --profile preview
  ```

#### 5.4 Backend Deployment
- [ ] **Dockerizar backend** (opcional pero recomendado)
  - Crear Dockerfile
  - Crear docker-compose.yml para desarrollo

- [ ] **Deploy en servidor**
  - Configurar servidor (VPS, AWS, etc.)
  - Configurar HTTPS con Let's Encrypt
  - Configurar PM2 o similar para mantener proceso corriendo

---

### 🟠 FASE 6: Monitoreo Básico (IMPORTANTE - 2-3 días)

#### 6.1 Error Tracking
- [ ] **Integrar Sentry** (gratis hasta cierto límite)
  ```bash
  # Backend
  cd backend
  npm install @sentry/node

  # Frontend
  cd mobile
  npm install @sentry/react-native
  ```

- [ ] **Configurar Sentry**
  - Backend: Capturar errores de API
  - Frontend: Capturar crashes de la app

#### 6.2 Health Checks
- [ ] **Mejorar endpoint de health** (`/api/health`)
  - Verificar conexión a MongoDB
  - Verificar estado del servidor
  - Retornar información útil

#### 6.3 Uptime Monitoring
- [ ] **Configurar servicio básico**
  - UptimeRobot (gratis) o similar
  - Monitorear endpoint `/api/health`
  - Alertas por email si cae

---

### ⚪ FASE 7: Documentación Mínima (IMPORTANTE - 1-2 días)

#### 7.1 Documentación Técnica
- [ ] **README.md completo**
  - Cómo instalar y ejecutar
  - Variables de entorno necesarias
  - Cómo hacer build
  - Estructura del proyecto

- [ ] **API Documentation básica**
  - Documentar endpoints principales
  - Ejemplos de requests/responses
  - Códigos de error

#### 7.2 Documentación de Usuario
- [ ] **Guía básica de usuario**
  - Cómo registrarse
  - Cómo agregar contactos
  - Cómo crear tareas
  - Cómo usar interacciones

---

## 🚫 NO Incluir en MVP (Post-MVP)

### Features Premium (Desactivadas)
- Voice notes to text con IA
- AI suggestions
- Advanced analytics

### Features Avanzadas (Post-MVP)
- 2FA
- Social login
- Refresh tokens (puede esperar)
- Multi-language
- Dark mode completo
- Push notifications avanzadas
- Widgets
- Export/Import avanzado

---

## 📅 Timeline Estimado

### Opción 1: Desarrollador Full-Time
- **Fase 1-2**: 2 semanas
- **Fase 3**: 1 semana
- **Fase 4**: 3 días
- **Fase 5**: 1 semana
- **Fase 6**: 3 días
- **Fase 7**: 2 días

**Total: ~4-5 semanas**

### Opción 2: Tiempo Parcial (20 horas/semana)
- **Total: ~8-10 semanas**

---

## 🎯 Criterios de Éxito MVP

### Funcionalidad
- ✅ Usuarios pueden registrarse y loguearse
- ✅ Usuarios pueden crear/editar/eliminar contactos
- ✅ Usuarios pueden crear/editar/eliminar tareas
- ✅ Usuarios pueden agregar interacciones
- ✅ Funciona offline básico
- ✅ Sincronización cuando vuelve online

### Seguridad
- ✅ Validación de todos los inputs
- ✅ Autenticación segura
- ✅ Multi-tenancy funcionando
- ✅ HTTPS en producción
- ✅ Rate limiting activo

### Confiabilidad
- ✅ Manejo de errores robusto
- ✅ Logging de errores
- ✅ Error tracking (Sentry)
- ✅ Tests básicos pasando

### Performance
- ✅ App carga en < 3 segundos
- ✅ Operaciones responden en < 1 segundo
- ✅ No hay memory leaks
- ✅ Funciona con 100+ contactos

### Deployment
- ✅ Builds automatizados funcionando
- ✅ App instalable en Android/iOS
- ✅ Backend deployado y accesible
- ✅ HTTPS configurado

---

## 🚀 Siguiente Paso Inmediato

**Empezar con FASE 1: Seguridad y Validación**

¿Quieres que empecemos implementando la validación y sanitización del backend? Es lo más crítico para un MVP seguro.
