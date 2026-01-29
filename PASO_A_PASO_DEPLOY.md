# ☁️ Deploy a la Nube - Paso a Paso Simplificado

## ✅ PASO 1: COMPLETADO ✅
- ✅ `Procfile` creado
- ✅ `.env.example` actualizado
- ✅ Sistema de configuración por ambiente creado en la app móvil

---

## 📋 PASO 2: Subir Código a GitHub

### Si ya tienes repositorio:
```bash
git add .
git commit -m "Preparado para deploy"
git push
```

### Si NO tienes repositorio:
1. Crear cuenta en GitHub (si no tienes)
2. Crear nuevo repositorio: https://github.com/new
3. Nombre: `proyecto-vinculo` (o el que prefieras)
4. **NO** inicializar con README, .gitignore, o licencia
5. Ejecutar en tu terminal:

```bash
cd C:\DEV\ProyectoVinculo
git init
git add .
git commit -m "Initial commit - App Vínculos"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

---

## 🌐 PASO 3: Crear Cuenta en Render

1. Ir a https://render.com
2. Click "Get Started for Free"
3. Registrarse con GitHub (más fácil) o email
4. Verificar email si es necesario

---

## 🔧 PASO 4: Crear Web Service en Render

1. En el dashboard de Render, click **"New +"**
2. Seleccionar **"Web Service"**
3. Conectar con GitHub:
   - Click "Connect account" si no está conectado
   - Autorizar acceso a tu repositorio
   - Seleccionar el repositorio `proyecto-vinculo`

### Configuración:
- **Name**: `vinculos-backend`
- **Region**: `Oregon (US West)` o la más cercana
- **Branch**: `main`
- **Root Directory**: `backend` ⚠️ IMPORTANTE
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: `Free`

4. Click **"Create Web Service"**

---

## 🔐 PASO 5: Configurar Variables de Entorno

En la página del servicio, ir a **"Environment"** y agregar:

### Variable 1: MONGODB_URI
- **Key**: `MONGODB_URI`
- **Value**: Tu connection string de MongoDB Atlas
  - Ejemplo: `mongodb+srv://ag_db_user:r8d8n60M8ucOeEzw@cluster.mongodb.net/vinculosDB?retryWrites=true&w=majority`

### Variable 2: JWT_SECRET
- **Key**: `JWT_SECRET`
- **Value**: Generar clave segura (ver abajo)

### Variable 3: NODE_ENV
- **Key**: `NODE_ENV`
- **Value**: `production`

### Variable 4: HOST (opcional)
- **Key**: `HOST`
- **Value**: `0.0.0.0`

### Variable 5: PORT (dejar vacío)
- Render lo asigna automáticamente

---

## 🔑 PASO 6: Generar JWT_SECRET Seguro

En PowerShell ejecutar:
```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

O usar: https://randomkeygen.com/ (sección "CodeIgniter Encryption Keys")

**Copiar la clave generada y agregarla como `JWT_SECRET` en Render**

---

## ⏳ PASO 7: Esperar el Deploy

1. Render comenzará a construir automáticamente
2. Verás los logs en tiempo real
3. Esperar 2-5 minutos
4. Cuando termine, verás: **"Your service is live at https://proyectovinculo.onrender.com"**

**✅ Tu URL de producción es:** `https://proyectovinculo.onrender.com`

---

## ✅ PASO 8: Verificar que Funciona

### 8.1 Probar Health Check
Abrir en navegador:
```
https://vinculos-backend.onrender.com/api/health
```

Debería responder con JSON indicando que está conectado.

### 8.2 Probar desde PowerShell:
```powershell
Invoke-WebRequest -Uri "https://vinculos-backend.onrender.com/api/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

---

## 📱 PASO 9: Actualizar App Móvil

### 9.1 Editar `mobile/constants/config.js`

Cambiar la línea de producción:
```javascript
production: {
  API_BASE_URL: 'https://proyectovinculo.onrender.com', // ✅ Tu URL de Render
},
```

**⚠️ IMPORTANTE:** No incluyas la barra final (`/`) al final de la URL.

### 9.2 Para probar en desarrollo:
- La app seguirá usando la IP local mientras `__DEV__` sea `true`
- Para probar con producción, cambiar temporalmente `ENV` a `'production'`

---

## 🎯 Checklist Final

- [ ] Código subido a GitHub
- [ ] Cuenta creada en Render
- [ ] Web Service creado y configurado
- [ ] Variables de entorno agregadas
- [ ] Deploy completado exitosamente
- [ ] Health check funciona
- [ ] App móvil actualizada con URL de producción

---

## 🆘 Problemas Comunes

### El servicio no inicia
- Verificar logs en Render (sección "Logs")
- Verificar que `Root Directory` sea `backend`
- Verificar que todas las variables de entorno estén configuradas

### Error de MongoDB
- Verificar que MongoDB Atlas tenga `0.0.0.0/0` en Network Access
- Verificar que la connection string sea correcta
- Verificar usuario y contraseña

### CORS errors
- Verificar configuración de CORS en `backend/index.js`
- En desarrollo, CORS permite todos los orígenes

---

## 📝 Nota Importante sobre Render Free

- El servicio se "duerme" después de 15 minutos de inactividad
- La primera petición después de dormir puede tardar ~30 segundos
- Para producción real, considerar plan pago ($7/mes)

---

## 🚀 Siguiente Paso

**Cuando tengas la URL de Render, actualiza `mobile/constants/config.js` y prueba la app!**
