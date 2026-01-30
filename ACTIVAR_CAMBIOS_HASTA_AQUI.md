# Qué hacer para activar los cambios hasta aquí

Checklist para que todo lo hecho (UI, indicador de atención, notificaciones push, etc.) quede activo en tu entorno.

---

## 1. Subir el código a GitHub

En PowerShell, desde la carpeta del proyecto:

```powershell
cd C:\DEV\ProyectoVinculo
git add .
git commit -m "UI: indicador atención, centrado foto, push recordatorios con contactoId, docs push y cron"
git push origin main
```

- Si dice que no hay nada que commitear, es que no hay cambios; en ese caso no hace falta el commit/push.
- Si te pide usuario/contraseña al hacer `git push`, usa tu **Personal Access Token** de GitHub como contraseña.

---

## 2. Backend en la nube (Render)

- Si tienes **auto-deploy** en Render: al hacer `git push origin main`, Render detecta el cambio y vuelve a desplegar el backend. En unos minutos la API estará actualizada.
- Si no tienes auto-deploy: en Render → tu servicio (Web Service) → **Manual Deploy** → **Deploy latest commit**.

Con eso los cambios de backend (p. ej. recordatorios push con `contactoId`) ya están activos.

---

## 3. (Opcional) Activar recordatorios push cada día

Para que los usuarios reciban cada día el recordatorio de gestos pendientes:

1. En **Render** → tu **Web Service** → **Environment**: añade la variable **`CRON_SECRET`** con un valor secreto (p. ej. generado en [passwordgenerator.net](https://www.passwordgenerator.net/) o `openssl rand -hex 32`).
2. Crea un **Cron Job** en Render que cada día llame a:
   - `POST https://TU-BACKEND.onrender.com/api/cron/send-reminders`
   - Con cabecera: `X-Cron-Secret: <el mismo valor de CRON_SECRET>`.

Detalle paso a paso: ver **`docs/PUSH_CRON_CONFIGURAR.md`**.

---

## 4. App móvil

- Si usas **Expo Go**: cierra la app y vuelve a abrirla (o sacude y “Reload”). Los cambios de pantallas y lógica ya se aplican.
- Si usas un **build instalado** (EAS Build): los cambios de JavaScript se aplican al abrir la app (y actualizar si hay OTA). No hace falta generar un build nuevo solo por los cambios que hemos hecho.

---

## Resumen

| Paso | Acción |
|------|--------|
| 1 | `git add .` → `git commit -m "..."` → `git push origin main` |
| 2 | Esperar a que Render redespliegue (o hacer Manual Deploy) |
| 3 | (Opcional) Configurar `CRON_SECRET` y Cron Job para recordatorios diarios |
| 4 | En el móvil: reabrir la app (o Reload en Expo Go) |

Cuando hayas hecho el **paso 1 y 2**, los cambios hasta aquí estarán activos. El paso 3 solo es necesario si quieres que se envíen solos los recordatorios push cada día.
