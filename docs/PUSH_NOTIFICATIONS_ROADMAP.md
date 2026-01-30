# Notificaciones push – roadmap por etapas

Objetivo: que el usuario reciba notificaciones push en el teléfono (recordatorios de gestos, momentos, cumpleaños, riego) y que al tocar una notificación se abra la pantalla adecuada.

---

## Estado actual

| Etapa | Descripción | Estado |
|-------|-------------|--------|
| **1** | App: permisos, Expo Push Token, guardado en AsyncStorage | ✅ Hecho |
| **2a** | Backend: guardar token por usuario (`PUT /api/auth/push-token`) | ✅ Hecho |
| **2b** | Backend: servicio que envía push vía Expo Push API + test (`POST /api/auth/send-test-push`) | ✅ Hecho |
| **3** | Programar recordatorios (gestos, cumpleaños, “regar”) – jobs/cron | Pendiente |
| **4** | Al tocar la notificación: abrir pantalla según `data` (Vínculos, Gestos, etc.) | En curso |
| **5** | Pruebas en dispositivo real (EAS Build), canales Android, pulido | Pendiente |

---

## Etapa 1 + 2 (ya implementadas)

- **App:** `pushNotificationService.js` pide permisos, obtiene el Expo Push Token, lo guarda en AsyncStorage y lo envía al backend con `registerAndSendPushToken()`.
- **App:** Tras login, `App.js` llama a `registerAndSendPushToken()`.
- **Backend:** `PUT /api/auth/push-token` guarda el token en `Usuario.expoPushTokens[]` (máx. 5).
- **Backend:** `pushService.js` con `sendPush()` y `sendPushToUser()`; ruta de prueba `POST /api/auth/send-test-push`.

**Nota:** En Expo Go el push en Android puede no funcionar; para recibir push en dispositivo real suele hacer falta un **development build** (EAS Build).

---

## Etapa 3 – Programar recordatorios (siguiente paso lógico)

- Definir eventos que generan notificación:
  - **Gestos:** tarea con `fechaHoraEjecucion` hoy (o ventana configurable).
  - **Cumpleaños:** contacto con cumpleaños hoy o mañana.
  - **Regar:** contacto sin interacción desde hace X días según frecuencia.
- Backend: job/cron (o endpoint llamado por un cron externo, p. ej. Render Cron) que:
  - Consulte gestos/contactos con fecha de recordatorio en la ventana.
  - Por cada usuario afectado, tome sus `expoPushTokens` y llame a `pushService.sendPushToUser()` con título, cuerpo y `data` (tipo, contactoId, etc.).
- Ajustar mensajes y horarios (ej. recordatorio a las 9:00).

---

## Etapa 4 – Al tocar la notificación

- En la app: `Notifications.addNotificationResponseReceivedListener` para cuando el usuario toca la notificación.
- El payload del push debe incluir `data: { tipo, contactoId?, gestoId?, ... }`.
- Navegar a la pestaña/pantalla correspondiente según `data.tipo` (Vínculos, Gestos, etc.) usando `navigationRef`.

---

## Etapa 5 – Pruebas y pulido

- Probar en dispositivo físico con EAS Build (Android e iOS si aplica).
- Android: canales de notificación y prioridad.
- iOS: permisos y configuración en `app.json` / EAS.
- Manejar rechazo de permisos y renovación del token.

---

## Orden de trabajo recomendado

1. **Etapa 4** (ahora): listeners y navegación al tocar → cualquier push (incluido el de prueba) abre la pantalla correcta.
2. **Etapa 3**: jobs/cron para enviar recordatorios reales.
3. **Etapa 5**: pruebas en dispositivo real y ajustes.

---

## Referencias

- [Expo Push Notifications](https://docs.expo.dev/push-notifications/overview/)
- [Sending notifications (Expo Push API)](https://docs.expo.dev/push-notifications/sending-notifications/)
- [expo-notifications – listeners](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
