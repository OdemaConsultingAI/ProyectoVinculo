# Pasos para actualizar el backend en Render con los últimos cambios

Sigue estos pasos en orden para que Render despliegue la versión más reciente (incluida la ruta de transcripción de voz y GPT-4o-mini).

---

## 1. Subir los cambios a GitHub

Desde la raíz del proyecto (o desde `backend` si solo commiteas el backend):

```powershell
cd c:\DEV\ProyectoVinculo

# Ver qué archivos cambiaron
git status

# Añadir todos los cambios (o solo los que quieras)
git add .

# Commit con un mensaje claro
git commit -m "Backend: voice-temp transcribe con Whisper + GPT-4o-mini, prompt editable"

# Subir a la rama que usa Render (normalmente main)
git push origin main
```

Si tu rama principal se llama `master`:

```powershell
git push origin master
```

---

## 2. Deploy en Render

### Si tienes Auto-Deploy activado (por defecto)

- Render detecta el `git push` y **inicia un deploy automático**.
- En el dashboard de Render → tu Web Service → pestaña **Events** verás algo como: "Deploy triggered by push to main".
- Espera a que el build termine (Build → Deploy). Suele tardar 2–5 minutos.

### Si quieres lanzar el deploy a mano

1. Entra en [dashboard.render.com](https://dashboard.render.com).
2. Abre tu **Web Service** del backend (ej. `vinculos-backend`).
3. Pestaña **Manual Deploy**.
4. Elige la rama (ej. `main`) y pulsa **Deploy latest commit**.

---

## 3. Revisar variables de entorno en Render

Para que la **transcripción de voz** y la clasificación (tarea vs interacción) funcionen:

1. En tu servicio → **Environment**.
2. Comprueba que exista **OPENAI_API_KEY** con tu clave de OpenAI.
   - Si no está: **Add Environment Variable** → Key: `OPENAI_API_KEY`, Value: tu API key de [platform.openai.com](https://platform.openai.com/api-keys).

Las demás que ya tenías (MONGODB_URI, JWT_SECRET, NODE_ENV, etc.) no hace falta tocarlas salvo que hayas cambiado algo.

---

## 4. Comprobar que el deploy terminó bien

1. En Render → tu servicio → pestaña **Logs**: no debe haber errores al arrancar (ej. "Listening on port...").
2. Probar el health:
   - `https://tu-app.onrender.com/api/health`
   - Debe responder JSON con estado de conexión (y MongoDB si lo expone).
3. Probar la transcripción (solo si tienes un `tempId` válido):
   - Primero subir audio con `POST /api/ai/voice-temp` (desde la app o Postman) para obtener `tempId`.
   - Luego `POST /api/ai/voice-temp/transcribe` con body `{ "tempId": "..." }`.
   - Debe devolver `texto`, `tipo`, `vinculo`, `tarea`, `fecha`, etc.

---

## 5. App móvil

- La app ya usa la URL de producción (ej. `API_BASE_URL` apuntando a `https://tu-app.onrender.com`).
- No hace falta cambiar nada en el móvil para que use el backend actualizado; solo asegúrate de que la URL en `mobile/constants/config.js` (o donde definas la API) sea la del servicio en Render.

---

## Resumen rápido

| Paso | Acción |
|------|--------|
| 1 | `git add .` → `git commit -m "..."` → `git push origin main` |
| 2 | Esperar deploy automático en Render (o Manual Deploy) |
| 3 | Tener `OPENAI_API_KEY` en Environment del servicio |
| 4 | Probar `/api/health` y, si aplica, `/api/ai/voice-temp/transcribe` |
| 5 | La app móvil ya apunta a Render; no hay que cambiarla |

Si el servicio está en plan Free, el primer request tras un rato inactivo puede tardar ~30 s mientras el servicio “despierta”.
