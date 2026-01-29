# 🚀 Instrucciones de Deploy a Render.com

## ✅ PASO 1: COMPLETADO
- ✅ `package.json` tiene script `start`
- ✅ `Procfile` creado
- ✅ `.env.example` completado

---

## 📋 PASO 2: Crear Cuenta y Proyecto en Render

### 2.1 Crear cuenta
1. Ir a https://render.com
2. Click en "Get Started for Free"
3. Registrarse con GitHub (recomendado) o email

### 2.2 Preparar repositorio GitHub (si aún no lo tienes)
1. Crear repositorio en GitHub
2. Subir tu código:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/tu-usuario/tu-repo.git
   git push -u origin main
   ```

---

## 🔧 PASO 3: Crear Web Service en Render

### 3.1 Crear nuevo servicio
1. En Render dashboard, click "New +"
2. Seleccionar "Web Service"
3. Conectar con tu repositorio de GitHub
4. Seleccionar el repositorio

### 3.2 Configuración del servicio
- **Name**: `vinculos-backend` (o el nombre que prefieras)
- **Region**: `Oregon (US West)` o la más cercana
- **Branch**: `main` (o tu rama principal)
- **Root Directory**: `backend` (si el backend está en una carpeta)
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### 3.3 Plan
- Seleccionar **Free** (tiene limitaciones pero suficiente para empezar)

---

## 🔐 PASO 4: Configurar Variables de Entorno

En la sección "Environment" del servicio en Render, agregar:

### Variables Requeridas:

1. **MONGODB_URI**
   - Valor: Tu connection string de MongoDB Atlas
   - Ejemplo: `mongodb+srv://usuario:password@cluster.mongodb.net/vinculosDB?retryWrites=true&w=majority`

2. **JWT_SECRET**
   - Valor: Generar una clave segura (ver abajo)
   - Ejemplo: `tu_clave_secreta_super_segura_minimo_32_caracteres_2024`

3. **NODE_ENV**
   - Valor: `production`

4. **PORT** (opcional)
   - Dejar vacío - Render lo asigna automáticamente

5. **HOST** (opcional)
   - Valor: `0.0.0.0`

6. **ALLOWED_ORIGINS** (opcional por ahora)
   - Dejar vacío o agregar URLs permitidas separadas por coma

### Generar JWT_SECRET Seguro

En PowerShell:
```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

O usar: https://randomkeygen.com/ (usar "CodeIgniter Encryption Keys")

---

## 🌐 PASO 5: Configurar MongoDB Atlas

### 5.1 Whitelist de IPs
1. Ir a MongoDB Atlas → Network Access
2. Agregar IP: `0.0.0.0/0` (permite desde cualquier lugar)
   - ⚠️ Solo para desarrollo/testing. En producción usar IPs específicas

### 5.2 Verificar Connection String
1. Ir a MongoDB Atlas → Database → Connect
2. Copiar connection string
3. Reemplazar `<password>` con tu contraseña real
4. Agregar como `MONGODB_URI` en Render

---

## 🚀 PASO 6: Deploy

1. Click en "Create Web Service" en Render
2. Render comenzará a construir y desplegar tu aplicación
3. Esperar a que termine (puede tomar 2-5 minutos)
4. Verás la URL de tu servicio: `https://vinculos-backend.onrender.com`

---

## ✅ PASO 7: Verificar que Funciona

### 7.1 Probar Health Check
Abrir en navegador:
```
https://tu-app.onrender.com/api/health
```

Debería responder con:
```json
{
  "estado": "conectado",
  "readyState": 1,
  "timestamp": "..."
}
```

### 7.2 Probar Registro
```bash
curl -X POST https://tu-app.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","nombre":"Test User"}'
```

---

## 📱 PASO 8: Actualizar App Móvil

### 8.1 Crear archivo de configuración
Crear `mobile/constants/config.js`:

```javascript
// Configuración por ambiente
const ENV = __DEV__ ? 'development' : 'production';

const CONFIG = {
  development: {
    API_BASE_URL: 'http://100.121.1.120:3000', // Tu IP de Tailscale local
  },
  production: {
    API_BASE_URL: 'https://tu-app.onrender.com', // URL de Render
  }
};

export const API_BASE_URL = CONFIG[ENV].API_BASE_URL;
```

### 8.2 Actualizar api.js
Modificar `mobile/constants/api.js` para usar la configuración por ambiente.

---

## 🎯 Checklist Final

- [ ] Backend deployado en Render
- [ ] Health check funciona
- [ ] Variables de entorno configuradas
- [ ] MongoDB Atlas accesible
- [ ] App móvil actualizada con URL de producción
- [ ] Probar registro/login desde la app

---

## 📝 Notas Importantes

1. **Render Free Plan**:
   - El servicio se "duerme" después de 15 minutos de inactividad
   - La primera petición después de dormir puede tardar ~30 segundos
   - Para producción real, considerar plan pago

2. **HTTPS**:
   - Render proporciona HTTPS automáticamente
   - No necesitas configurar certificados SSL

3. **Logs**:
   - Ver logs en tiempo real en Render dashboard
   - Útil para debugging

4. **Actualizaciones**:
   - Cada push a GitHub despliega automáticamente
   - O hacer "Manual Deploy" desde el dashboard

---

## 🆘 Troubleshooting

### El servicio no inicia
- Verificar logs en Render
- Verificar que `PORT` no esté hardcodeado (usar `process.env.PORT`)
- Verificar que todas las variables de entorno estén configuradas

### Error de conexión a MongoDB
- Verificar que la IP whitelist incluya `0.0.0.0/0`
- Verificar que la connection string sea correcta
- Verificar usuario y contraseña

### CORS errors
- Verificar `ALLOWED_ORIGINS` en variables de entorno
- Verificar configuración de CORS en `index.js`
