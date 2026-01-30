# 🔧 Solución: Error 500 en Render (Backend)

## Problema
La app muestra: `Error interno del servidor` (status 500) al intentar hacer login o **registro**.

Esto significa que el backend en Render está respondiendo, pero hay un error interno (variables de entorno, MongoDB no conectado o cold start).

---

## 🚨 Si ves 500 al registrar: revisa los Logs en Render

1. Entra a **Render** → tu servicio **proyectovinculo** → pestaña **Logs**.
2. Intenta registrar de nuevo desde la app y mira qué aparece en los logs.
3. Busca líneas como:
   - `❌ Error en registro: <mensaje>` → ahí verás la causa real (MongoDB, JWT, etc.).
   - `⚠️ Register: MongoDB no conectado` → la base aún no estaba lista (cold start).

**Posibles causas del 500 en registro:**

| Lo que ves en Logs | Causa | Qué hacer |
|--------------------|--------|-----------|
| `MongoDB no conectado` o `readyState` distinto de 1 | Cold start o base desconectada | Espera 10–20 s y vuelve a intentar registrar. Si sigue, revisa `MONGODB_URI` en Render. |
| `JWT_SECRET` o error al firmar token | Falta o error en `JWT_SECRET` | Añade `JWT_SECRET` en Environment (Render) y redespliega. |
| `MongoNetworkError` / `MongoServerSelectionError` | No puede conectar a Atlas | Revisa `MONGODB_URI` y Network Access en MongoDB Atlas (permite `0.0.0.0/0` si quieres). |
| Nada nuevo en logs | El error ocurre antes de nuestro log | Comprueba que `MONGODB_URI` y `JWT_SECRET` estén en Render (ver pasos abajo). |
| **`Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"`** | `MONGODB_URI` en Render está vacía, mal escrita o no configurada | En Render → Environment, añade o corrige **MONGODB_URI**. El valor debe ser **exactamente** la URI de Atlas que empieza por `mongodb+srv://...` (sin comillas extra, sin espacios). Ver PASO 6 abajo. |
| **`X-Forwarded-For` / `trust proxy`** | Rate limit detrás del proxy de Render | Ya está corregido en el código con `trust proxy`. Haz push y redespliega. |

Si en lugar de 500 recibes **503** con mensaje tipo *"Base de datos no disponible. Espera unos segundos..."*, es **cold start**: espera unos segundos y vuelve a intentar.

---

## ✅ Solución: Verificar Variables de Entorno en Render

### PASO 1: Entrar al Dashboard de Render

1. Ve a https://dashboard.render.com
2. Inicia sesión
3. Busca tu servicio **"proyectovinculo"** (o el nombre que le pusiste)
4. Haz clic en el servicio

---

### PASO 2: Ir a la sección "Environment"

1. En el menú lateral del servicio, busca **"Environment"** o **"Variables de Entorno"**
2. Haz clic ahí

---

### PASO 3: Verificar que estas variables estén configuradas

Debes tener **exactamente** estas variables (con sus valores reales):

| Variable | Ejemplo de Valor | ¿Qué es? |
|----------|------------------|----------|
| **MONGODB_URI** | `mongodb+srv://usuario:password@cluster.mongodb.net/vinculosDB?retryWrites=true&w=majority` | Tu connection string de MongoDB Atlas |
| **JWT_SECRET** | `aB3xY9mK2pL8qR5tW7vN4cF6hJ1dG0sA` (clave aleatoria larga) | Clave secreta para tokens JWT |
| **NODE_ENV** | `production` | Indica que está en producción |
| **HOST** | `0.0.0.0` | Para escuchar en todas las interfaces |
| **PORT** | *(dejar vacío)* | Render lo asigna automáticamente |

---

### PASO 4: Si falta alguna variable, agregarla

1. Haz clic en **"Add Environment Variable"** o **"Add Variable"**
2. Escribe el **Key** (nombre de la variable)
3. Escribe el **Value** (valor)
4. Haz clic en **"Save"** o **"Add"**

---

### PASO 5: Generar JWT_SECRET si no lo tienes

Si no tienes un `JWT_SECRET` seguro, genera uno:

**En PowerShell (tu PC):**
```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Copia el resultado y pégalo como valor de `JWT_SECRET` en Render.

---

### PASO 6: Verificar MONGODB_URI (obligatorio)

Si en los logs ves **"Invalid scheme, expected connection string to start with mongodb:// or mongodb+srv://"**, la variable **MONGODB_URI** en Render no está bien configurada.

1. Ve a https://cloud.mongodb.com
2. Inicia sesión
3. Ve a tu cluster → **"Connect"** → **"Connect your application"**
4. Copia la connection string (empieza por `mongodb+srv://`)
5. Reemplaza `<password>` con tu contraseña real de MongoDB (los caracteres especiales en la contraseña a veces hay que codificarlos en URL, por ejemplo `@` → `%40`)
6. Asegúrate de que la URI termine con `/vinculosDB?retryWrites=true&w=majority` (o añade `/vinculosDB` antes de `?` si no está)
7. En **Render** → tu servicio → **Environment** → variable **MONGODB_URI**:
   - Si no existe, **Add** → Key: `MONGODB_URI`, Value: pega la URI completa (sin comillas).
   - Si existe, **Edit** y pega de nuevo la URI correcta. Debe empezar por `mongodb+srv://` y no tener espacios ni comillas alrededor.
8. Guarda y **redespliega** el servicio (Manual Deploy → Deploy latest commit, o espera al siguiente push).

---

### PASO 7: Reiniciar el servicio en Render

Después de agregar/modificar variables:

1. Ve a la pestaña **"Events"** o **"Logs"** del servicio
2. Haz clic en **"Manual Deploy"** → **"Deploy latest commit"** (o similar)
3. O simplemente espera unos minutos; Render puede detectar cambios y redesplegar

---

### PASO 8: Verificar los logs

1. En Render, ve a la pestaña **"Logs"** del servicio
2. Busca mensajes como:
   - ✅ `Conexión a MongoDB exitosa`
   - ✅ `Servidor ejecutándose en puerto...`
   - ❌ `Error de MongoDB:` (si hay problema)
   - ⚠️ `JWT_SECRET no está configurado` (si falta)

Si ves errores de MongoDB, verifica que:
- La `MONGODB_URI` sea correcta
- MongoDB Atlas tenga tu IP de Render permitida (o `0.0.0.0/0` para permitir todas)

---

## 🔍 Verificar que funciona

### Opción 1: Desde el navegador

Abre:
```
https://proyectovinculo.onrender.com/api/health
```

Deberías ver un JSON con:
```json
{
  "estado": "conectado",
  "readyState": 1,
  ...
}
```

Si `readyState` es `0` o `estado` es `desconectado`, MongoDB no está conectado.

### Opción 2: Desde PowerShell

```powershell
Invoke-WebRequest -Uri "https://proyectovinculo.onrender.com/api/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

---

## ⚠️ Errores comunes

| Error en Logs | Causa | Solución |
|---------------|-------|----------|
| `Error de MongoDB:` | `MONGODB_URI` incorrecta o no configurada | Verificar connection string en Render |
| `JWT_SECRET no está configurado` | Falta `JWT_SECRET` | Generar y agregar en Render |
| `readyState: 0` en health | MongoDB no conectado | Verificar `MONGODB_URI` y Network Access en MongoDB Atlas |
| `CORS error` | Origen bloqueado | Verificar `ALLOWED_ORIGINS` o dejar vacío para permitir todos |

---

## 📝 Checklist rápido

- [ ] `MONGODB_URI` configurada en Render con tu connection string real
- [ ] `JWT_SECRET` configurado en Render (clave aleatoria segura)
- [ ] `NODE_ENV` = `production`
- [ ] `HOST` = `0.0.0.0`
- [ ] `PORT` vacío (Render lo asigna)
- [ ] MongoDB Atlas permite conexiones desde `0.0.0.0/0` (Network Access)
- [ ] Servicio redesplegado después de cambiar variables
- [ ] Health check muestra `readyState: 1` (conectado)

---

## 💡 Nota importante

Después de cambiar variables de entorno en Render, **siempre** debes redesplegar el servicio para que los cambios surtan efecto.

Si todo está bien configurado y aún hay error 500, revisa los **Logs** en Render para ver el error exacto que está ocurriendo.
