# ✅ Checklist antes de probar de nuevo

## 1. Render – Variables de entorno

En **Render** → tu servicio **proyectovinculo** → **Environment**, verifica:

| Variable      | Valor correcto |
|---------------|----------------|
| **MONGODB_URI** | `mongodb+srv://ag_db_user:r8d8n60M8ucOeEzw@clustervinculo.0foy93k.mongodb.net/vinculosDB?retryWrites=true&w=majority&appName=ClusterVinculo` |
| **JWT_SECRET**  | Una clave larga y aleatoria (ej. generada en PowerShell) |
| **NODE_ENV**    | `production` |
| **HOST**        | `0.0.0.0` |
| **PORT**       | *(dejar vacío)* |
| **ALLOWED_ORIGINS** | *(dejar vacío para permitir la app móvil)* |

Si cambiaste algo, haz **Manual Deploy** en Render.

---

## 2. Health check

Abre en el navegador:

```
https://proyectovinculo.onrender.com/api/health
```

Debe devolver algo como:

```json
{"estado":"conectado","readyState":1,...}
```

Si `readyState` es **0**, MongoDB no está conectado → revisa **MONGODB_URI** en Render.

---

## 3. App móvil

- **config.js** está en modo **production** (`FORCE_ENV = 'production'`).
- La app usa **https://proyectovinculo.onrender.com**.
- En la app deberías ver el indicador **"Nube"**.

---

## 4. Usuario para login

- Si **no tienes usuario**: regístrate desde la app (Registrarse) o crea uno por API.
- Si **cambiaste contraseña** con el script: asegúrate de que tu `backend\.env` local tenga la **misma MONGODB_URI** que Render y vuelve a ejecutar el script de restablecer.

---

## 5. Cambio en el backend (CORS)

- Si **ALLOWED_ORIGINS** está vacío en Render, el backend ahora permite todos los orígenes (para que la app móvil funcione).
- Después de este cambio, haz **commit y push** a GitHub para que Render redespliegue con el código nuevo.

---

## Resumen rápido

1. Render: **MONGODB_URI**, **JWT_SECRET**, **NODE_ENV**, **HOST** correctos.
2. Health: **readyState: 1**.
3. App: **production** y URL de Render.
4. Usuario: existe y conoces email/contraseña.
5. Subir cambio de CORS a GitHub y dejar que Render redespliegue.

Cuando todo esté ✓, prueba login/registro en la app.
