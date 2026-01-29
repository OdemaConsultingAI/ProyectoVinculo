# 🔧 Solución: Contraseña cambiada pero sigue sin funcionar

## Problema
Cambiaste la contraseña con el script pero sigues recibiendo "Credenciales inválidas" al hacer login.

---

## 🔍 Causa más probable

El script se ejecutó contra una **base de datos diferente** a la que usa Render:
- **Render** usa: MongoDB Atlas (en la nube)
- **Tu script local** puede estar usando: MongoDB local (`mongodb://127.0.0.1:27017`) o una base de datos diferente en Atlas

---

## ✅ Solución paso a paso

### PASO 1: Verificar qué base de datos usa tu script local

1. Abre `C:\DEV\ProyectoVinculo\backend\.env` (si existe) o verifica qué `MONGODB_URI` tiene configurado
2. Debe ser **exactamente la misma** que tienes en Render

**En Render:**
- Ve a tu servicio → **Environment**
- Copia el valor de `MONGODB_URI`

**En tu PC:**
- Abre `backend\.env` (si no existe, créalo basándote en `.env.example`)
- Asegúrate de que `MONGODB_URI` tenga **exactamente el mismo valor** que en Render

---

### PASO 2: Verificar que el usuario existe en la base de datos correcta

Ejecuta el nuevo script de verificación:

```powershell
cd C:\DEV\ProyectoVinculo\backend
node scripts/verificarUsuario.js tu-email@ejemplo.com
```

Este script te mostrará:
- ✅ Qué base de datos está usando
- ✅ Si el usuario existe
- ✅ Si la contraseña es correcta (si la proporcionas)

---

### PASO 3: Verificar la contraseña

Si el usuario existe, prueba la contraseña:

```powershell
node scripts/verificarUsuario.js tu-email@ejemplo.com tuPassword123
```

Esto te dirá si la contraseña es correcta o no.

---

### PASO 4: Resetear la contraseña (si es necesario)

Si el usuario existe pero la contraseña no funciona, resetea usando el script:

```powershell
node scripts/restablecerPassword.js restablecer tu-email@ejemplo.com nuevaPassword123
```

**⚠️ IMPORTANTE:** Asegúrate de que `backend\.env` tenga la misma `MONGODB_URI` que Render antes de ejecutar este comando.

---

### PASO 5: Verificar que funciona

Después de resetear, verifica de nuevo:

```powershell
node scripts/verificarUsuario.js tu-email@ejemplo.com nuevaPassword123
```

Debería decir: **✅ Contraseña CORRECTA**

---

## 🔄 Alternativa: Crear usuario nuevo desde la API

Si prefieres empezar de cero, puedes crear un usuario nuevo directamente en la API de Render:

**Desde PowerShell:**

```powershell
$body = @{
    email = "nuevo-email@ejemplo.com"
    password = "miPassword123"
    nombre = "Mi Nombre"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://proyectovinculo.onrender.com/api/auth/register" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
```

Si funciona, verás un JSON con `token` y `usuario`. Luego puedes hacer login en la app con esas credenciales.

---

## 📋 Checklist

- [ ] `backend\.env` tiene la misma `MONGODB_URI` que Render
- [ ] Script de verificación muestra que el usuario existe
- [ ] Contraseña verificada con el script
- [ ] Si no funciona, contraseña reseteada con el script
- [ ] Login funciona en la app

---

## 💡 Nota importante

**Render y tu script local deben usar la MISMA base de datos** (MongoDB Atlas). Si tu `.env` local apunta a `mongodb://127.0.0.1:27017` (MongoDB local), los cambios no se reflejarán en Render.

**Solución:** Copia la `MONGODB_URI` de Render a tu `backend\.env` local antes de ejecutar los scripts.
