# Notificaciones push – trabajo por etapas

Objetivo: que el usuario reciba notificaciones push en el teléfono (recordatorios de gestos, momentos, cumpleaños, etc.) usando **Expo Push Notifications**.

---

## Estado actual

| Etapa | Descripción | Estado |
|-------|-------------|--------|
| **1** | App: permisos, token Expo y envío al backend | ✅ Hecho |
| **2a** | Backend: guardar token por usuario (`PUT /api/auth/push-token`) | ✅ Hecho |
| **2b** | Backend: servicio que envía push vía Expo Push API | 🔄 En curso |
| **3** | Programar recordatorios (gestos, cumpleaños, “regar”) | Pendiente |
| **4** | Al tocar la notificación: abrir contacto/pantalla | Pendiente |
| **5** | Pruebas en dispositivo real (EAS Build, canales Android) | Pendiente |

---

## Etapa 1 + 2a (ya hecho)

- **App:** `expo-notifications`, `expo-device`, `expo-constants` instalados. Servicio `pushNotificationService.js` pide permisos, obtiene el Expo Push Token, lo guarda en AsyncStorage y lo envía al backend con `registerAndSendPushToken()`.
- **App:** Tras login, `App.js` llama a `registerAndSendPushToken()`.
- **Backend:** `PUT /api/auth/push-token` (autenticado) guarda el token en `Usuario.expoPushTokens[]` (máx. 5 por usuario).
- **Configuración:** Pantalla de configuración muestra estado de notificaciones y botón “Activar notificaciones”.

**Nota:** En Expo Go el push en Android puede no funcionar; hace falta un **development build** (EAS Build) para probar en dispositivo real.

---

## Etapa 2b – Servicio backend para enviar push (hecho)

- **`backend/services/pushService.js`:** `sendPush(tokens, { title, body, data })` y `sendPushToUser(usuario, options)` que llaman a la Expo Push API (`https://exp.host/--/api/v2/push/send`).
- **Ruta de prueba:** `POST /api/auth/send-test-push` (autenticada): envía una notificación de prueba a los tokens del usuario actual. Útil para comprobar que el envío funciona desde la app o desde Postman.

---

## Etapa 3 – Programar recordatorios

- Definir eventos que generan notificación:
  - **Gestos:** tarea con `fechaHoraEjecucion` hoy (o en la ventana elegida).
  - **Cumpleaños:** contacto con cumpleaños hoy o mañana.
  - **Regar:** contacto sin interacción desde hace X días según frecuencia.
- Backend: job/cron (o endpoint llamado por un cron externo, p. ej. Render Cron) que:
  - Consulte gestos/contactos con fecha de recordatorio en la ventana.
  - Por cada usuario afectado, tome sus `expoPushTokens` y llame a `pushService.sendPush(...)` con título y cuerpo.
- Ajustar mensajes y horarios (ej. recordatorio a las 9:00).

---

## Etapa 4 – Al tocar la notificación

- En la app: `Notifications.addNotificationResponseReceivedListener` para cuando el usuario toca la notificación.
- Incluir en el payload del push `data: { tipo, contactoId, gestoId?, ... }`.
- Navegar a la pantalla correspondiente (contacto, gestos del contacto, etc.) según `data`.

---

## Etapa 5 – Pruebas y pulido

- Probar en dispositivo físico con EAS Build (Android e iOS si aplica).
- Android: canales de notificación y prioridad.
- iOS: permisos y configuración en `app.json` / EAS.
- Manejar rechazo de permisos y renovación del token.

---

## Referencias

- [Expo Push Notifications Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Sending notifications (Expo Push API)](https://docs.expo.dev/push-notifications/sending-notifications/)
- [expo-notifications SDK](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [EAS Build](https://docs.expo.dev/build/introduction/) (para push en dispositivo real)
