# ☁️ Guía: Deploy del Backend a la Nube - Paso a Paso

## 🎯 Objetivo
Subir el backend a la nube para que la app móvil funcione desde cualquier lugar, antes del empaquetado.

---

## 📋 Opciones de Hosting Recomendadas (Gratis o Bajo Costo)

### Opción 1: Render.com (Recomendado - Gratis)
- ✅ Plan gratuito disponible
- ✅ HTTPS automático
- ✅ Fácil configuración
- ✅ Conecta con MongoDB Atlas fácilmente

### Opción 2: Railway.app
- ✅ Plan gratuito con créditos mensuales
- ✅ Muy fácil de usar
- ✅ HTTPS automático

### Opción 3: Heroku
- ⚠️ Ya no tiene plan gratuito, pero es muy estable
- ✅ Muy popular y confiable

### Opción 4: AWS/Google Cloud/Azure
- ⚠️ Más complejo pero más control
- ✅ Escalable

**Recomendación: Render.com para empezar**

---

## 🚀 PASO 1: Preparar el Backend para Producción

### 1.1 Verificar package.json
- [ ] Asegurar que tiene script `start`
- [ ] Verificar que todas las dependencias estén listadas

### 1.2 Crear archivo para producción
- [ ] Crear `Procfile` (para Render/Heroku)
- [ ] O verificar que `package.json` tenga script `start`

### 1.3 Variables de entorno
- [ ] Completar `.env.example` con todas las variables necesarias
- [ ] Documentar qué variables se necesitan en producción

---

## ☁️ PASO 2: Crear Cuenta y Proyecto en Render

### 2.1 Crear cuenta
- [ ] Ir a https://render.com
- [ ] Registrarse con GitHub (recomendado) o email

### 2.2 Crear nuevo servicio
- [ ] Click en "New +" → "Web Service"
- [ ] Conectar con tu repositorio de GitHub (o subir código)

---

## 🔧 PASO 3: Configurar el Servicio en Render

### 3.1 Configuración básica
- [ ] **Name**: `vinculos-backend` (o el nombre que prefieras)
- [ ] **Region**: Elegir la más cercana a tus usuarios
- [ ] **Branch**: `main` (o la rama que uses)
- [ ] **Root Directory**: `backend` (si el backend está en una carpeta)
- [ ] **Runtime**: `Node`
- [ ] **Build Command**: `npm install`
- [ ] **Start Command**: `npm start`

### 3.2 Variables de entorno
Configurar en Render:
- [ ] `MONGODB_URI` - Tu conexión de MongoDB Atlas
- [ ] `JWT_SECRET` - Una clave secreta fuerte (generar nueva)
- [ ] `NODE_ENV` - `production`
- [ ] `PORT` - Dejar vacío (Render lo asigna automáticamente)
- [ ] `ALLOWED_ORIGINS` - URLs permitidas para CORS (opcional por ahora)

---

## 🔐 PASO 4: Generar JWT_SECRET Seguro

### 4.1 Generar clave secreta
```bash
# En PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

O usar un generador online: https://randomkeygen.com/

### 4.2 Guardar la clave
- [ ] Copiar la clave generada
- [ ] Agregarla a las variables de entorno en Render
- [ ] **NO compartirla ni commitearla**

---

## 🌐 PASO 5: Configurar MongoDB Atlas

### 5.1 Verificar conexión
- [ ] Asegurar que MongoDB Atlas esté accesible desde internet
- [ ] Verificar que la IP 0.0.0.0/0 esté en la whitelist (o la IP de Render)

### 5.2 Obtener connection string
- [ ] Copiar la connection string de MongoDB Atlas
- [ ] Reemplazar `<password>` con tu contraseña real
- [ ] Agregarla como `MONGODB_URI` en Render

---

## 📱 PASO 6: Actualizar la App Móvil

### 6.1 Crear archivo de configuración por ambiente
- [ ] Crear `mobile/constants/config.js` para manejar URLs por ambiente

### 6.2 Actualizar API URL
- [ ] Cambiar `API_BASE_URL` en `mobile/constants/api.js` para usar la URL de producción

---

## ✅ PASO 7: Verificar que Funciona

### 7.1 Probar endpoints
- [ ] Health check: `https://tu-app.onrender.com/api/health`
- [ ] Probar registro de usuario
- [ ] Probar login

### 7.2 Probar desde la app móvil
- [ ] Actualizar la app con la nueva URL
- [ ] Probar registro/login desde la app
- [ ] Verificar que los datos se guarden correctamente

---

## 📝 Checklist Completo

### Preparación Backend
- [ ] Verificar `package.json` tiene script `start`
- [ ] Crear `Procfile` o verificar start command
- [ ] Completar `.env.example`

### Render.com Setup
- [ ] Crear cuenta en Render
- [ ] Crear nuevo Web Service
- [ ] Conectar con GitHub (o subir código)
- [ ] Configurar build y start commands
- [ ] Agregar variables de entorno

### Seguridad
- [ ] Generar `JWT_SECRET` seguro
- [ ] Configurar MongoDB Atlas whitelist
- [ ] Verificar que `NODE_ENV=production`

### App Móvil
- [ ] Actualizar `API_BASE_URL` con URL de Render
- [ ] Probar conexión desde la app
- [ ] Verificar que todo funcione

---

## 🎯 Siguiente Paso Inmediato

**Empezar con PASO 1: Preparar el Backend para Producción**

¿Quieres que empecemos creando el `Procfile` y verificando la configuración del backend?
