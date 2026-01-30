# Notificaciones push – trabajo por etapas

Objetivo: que el usuario reciba notificaciones push en el teléfono (recordatorios de gestos, momentos, cumpleaños, etc.) y que al tocar una notificación se abra la pantalla adecuada.

---

## Resumen del estado actual

| Etapa | Descripción | Estado |
|-------|-------------|--------|
| **1** | App: permisos, token Expo, guardar en AsyncStorage | ✅ Hecho |
| **2a** | Backend: guardar token por usuario (`PUT /api/auth/push-token`) | ✅ Hecho |
| **2b** | Backend: envío push vía Expo Push API + test (`POST /api/auth/send-test-push`) | ✅ Hecho |
| **3a** | Recordatorios de gestos “hoy” + endpoint cron | ✅ Hecho |
| **3b** | Programar el cron (Render Cron o similar) cada mañana | 📋 Configurar |
| **3c** | Cumpleaños y “regar” (opcional, después) | Pendiente |
| **4** | Al tocar la notificación: abrir pantalla (Gestos/Vínculos) | ✅ Hecho (alineado con payload) |
| **5** | Pruebas en dispositivo real (EAS Build) | Pendiente |

---

## Etapa 1 + 2 (ya hecho)

- **App:** `pushNotificationService.js` pide permisos, obtiene el Expo Push Token, lo guarda en AsyncStorage y lo envía al backend con `registerAndSendPushToken()`.
- **App:** Tras login, `App.js` llama a `registerAndSendPushToken()`.
- **Backend:** `PUT /api/auth/push-token` guarda el token en `Usuario.expoPushTokens[]` (máx. 5).
- **Backend:** `pushService.js` con `sendPush()` y `sendPushToUser()`; ruta de prueba `POST /api/auth/send-test-push`.

**Nota:** En Expo Go el push en Android puede no funcionar; para recibir push en dispositivo real suele hacer falta un **development build** (EAS Build).

---

## Etapa 3a – Recordatorios de gestos “hoy”

- **Backend:** `reminderService.js` busca contactos con tareas no completadas cuya `fechaHoraEjecucion` sea hoy, agrupa por usuario y envía un push por usuario con resumen.
- **Endpoint:** `POST /api/cron/send-reminders` (protegido por cabecera `X-Cron-Secret` o query `secret`). Debe llamarse cada día (p. ej. a las 9:00).

---

## Etapa 3b – Programar el cron (siguiente paso)

1. En **Render** (o tu proveedor): crear un **Cron Job** que llame cada día a:
   - `POST https://tu-backend.onrender.com/api/cron/send-reminders`
   - Cabecera: `X-Cron-Secret: <valor de CRON_SECRET>`
2. En el backend (Render → Environment): definir la variable **`CRON_SECRET`** con un valor secreto largo y aleatorio. Ese mismo valor se usa en el Cron Job.
3. Probar manualmente con curl o Postman:
   ```bash
   curl -X POST https://tu-backend.onrender.com/api/cron/send-reminders -H "X-Cron-Secret: TU_CRON_SECRET"
   ```

---

## Etapa 4 – Al tocar la notificación

- En la app: `Notifications.addNotificationResponseReceivedListener` en `App.js`.
- El payload del push incluye `data: { tipo, contactoId?, ... }`.
- Navegación:
  - `tipo === 'gesto'` → pestaña Gestos (opcionalmente con `contactoId` para abrir ese contacto).
  - `tipo === 'riego'` / `'cumpleaños'` / `'contacto'` → pestaña Vínculos con `contactoId`.
  - `tipo === 'test'` → Configuración.

---

## Etapa 5 – Pruebas en dispositivo real

- Generar un **development build** con EAS Build (Android/iOS).
- Probar: activar notificaciones en la app → enviar push de prueba desde Configuración → recibir en el dispositivo.
- Probar: ejecutar el cron (o llamar a `send-reminders` a mano) y comprobar que llega el recordatorio de gestos del día.

---

## Referencias

- [Expo Push Notifications](https://docs.expo.dev/push-notifications/overview/)
- [Sending notifications (Expo Push API)](https://docs.expo.dev/push-notifications/sending-notifications/)
- [expo-notifications – listeners](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
