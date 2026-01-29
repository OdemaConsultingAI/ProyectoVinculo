# Verificar conexión de MongoDB (solo nube)

El proyecto usa **solo MongoDB Atlas** (nube). No hay conexión a MongoDB local.

---

## 1. Verificar desde el backend en Render

Abre en el navegador:

```
https://proyectovinculo.onrender.com/api/health
```

**Conexión correcta:** el JSON debe incluir algo como:

```json
{
  "estado": "conectado",
  "readyState": 1,
  "timestamp": "...",
  "uptime": ...,
  "environment": "production"
}
```

- **`readyState: 1`** → MongoDB conectado.
- **`readyState: 0`** → MongoDB desconectado (revisa `MONGODB_URI` en Render).

---

## 2. Verificar desde PowerShell

```powershell
Invoke-WebRequest -Uri "https://proyectovinculo.onrender.com/api/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Comprueba que en la respuesta aparezca `"readyState":1`.

---

## 3. Verificar desde tu PC (scripts que usan la misma base)

Los scripts en `backend/scripts/` (verificarUsuario, restablecerPassword, etc.) usan la **misma base de datos** que Render si en tu `backend/.env` tienes la **misma** `MONGODB_URI` que en Render.

Para comprobar que la conexión desde tu PC funciona:

```powershell
cd C:\DEV\ProyectoVinculo\backend
node scripts/verificarUsuario.js listar
```

Si muestra usuarios o "No hay usuarios", la conexión a la nube desde tu PC es correcta.

---

## 4. Dónde se configura la conexión

| Dónde        | Variable     | Uso                          |
|-------------|--------------|------------------------------|
| **Render**  | `MONGODB_URI`| Backend en producción        |
| **Tu PC**   | `backend/.env` → `MONGODB_URI` | Scripts y pruebas locales |

La URI debe ser la de **MongoDB Atlas** (formato `mongodb+srv://...`). No se usa `mongodb://127.0.0.1`.

---

## 5. Usar la base de datos correcta: vinculosDB (no "test")

Si la URI **no incluye** el nombre de la base, MongoDB usa **"test"** por defecto. Los usuarios y datos deben estar en **vinculosDB**.

**URI correcta** (fíjate en `/vinculosDB` antes del `?`):
```
mongodb+srv://usuario:password@cluster.mongodb.net/vinculosDB?retryWrites=true&w=majority
```

**URI incorrecta** (conecta a "test"):
```
mongodb+srv://usuario:password@cluster.mongodb.net/?retryWrites=true&w=majority
```

En **Render** y en tu **backend/.env**, la variable `MONGODB_URI` debe tener **/vinculosDB** en la ruta. Si el backend conecta a "test", el arranque fallará con un mensaje indicando que debe usarse vinculosDB.

---

## 6. Si la conexión falla

1. **Render:** en el servicio → **Environment** → revisa que `MONGODB_URI` sea la URI de Atlas (con contraseña correcta) y que incluya **/vinculosDB** antes del `?`.
2. **MongoDB Atlas:** en **Network Access** permite `0.0.0.0/0` para que Render pueda conectarse.
3. **Atlas:** usuario y contraseña correctos en la URI; si la contraseña tiene caracteres especiales, debe estar codificada en la URL.

Cuando `readyState` sea **1** en `/api/health` y los logs del backend muestren **Base de datos: vinculosDB**, la conexión es correcta.
