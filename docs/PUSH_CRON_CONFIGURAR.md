# Configurar el cron para recordatorios push

Para que los usuarios reciban cada día un recordatorio de gestos pendientes, hay que llamar al endpoint de cron desde un **Cron Job** (p. ej. en Render).

---

## 1. Variable de entorno en el backend

En **Render** → tu servicio (Web Service) → **Environment**:

- Añade la variable **`CRON_SECRET`** con un valor secreto largo y aleatorio (p. ej. generado con `openssl rand -hex 32`).
- Guarda los cambios. No hace falta redeploy solo por añadir la variable; el próximo deploy la usará.

---

## 2. Crear un Cron Job en Render

1. En el dashboard de Render, **New** → **Cron Job**.
2. Conecta el mismo repositorio que tu Web Service.
3. Configuración:
   - **Name:** por ejemplo `recordatorios-push`.
   - **Schedule:** expresión cron, por ejemplo `0 14 * * *` (todos los días a las 14:00 UTC; ajusta a la hora deseada en tu zona).
   - **Command:** llamada HTTP al endpoint de tu backend. Opciones:
     - **curl:**  
       `curl -X POST https://TU-SERVICIO.onrender.com/api/cron/send-reminders -H "X-Cron-Secret: TU_CRON_SECRET"`
     - O usar un script que haga el `fetch`/`curl` y guardarlo en el repo; el comando del Cron Job sería `node scripts/cron-send-reminders.js` (y en el script leer `process.env.CRON_SECRET` y la URL del backend desde env).
4. En el Cron Job, define la variable **`CRON_SECRET`** (mismo valor que en el Web Service) y, si usas script, la URL del backend.
5. Guarda y activa el Cron Job.

---

## 3. Probar a mano

Desde tu máquina (sustituye URL y secreto):

```bash
curl -X POST https://TU-BACKEND.onrender.com/api/cron/send-reminders -H "X-Cron-Secret: TU_CRON_SECRET"
```

Respuesta esperada (ejemplo):

```json
{
  "ok": true,
  "message": "Recordatorios enviados",
  "sent": 1,
  "failed": 0,
  "details": [{ "usuarioId": "...", "success": true }]
}
```

Si `CRON_SECRET` no coincide o no está definido, recibirás `401 No autorizado`.
