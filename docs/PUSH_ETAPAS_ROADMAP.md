# Notificaciones push – roadmap por etapas

Objetivo: que el usuario reciba notificaciones push en el teléfono (recordatorios de gestos, momentos, cumpleaños, etc.) usando **Expo Push Notifications**.

---

## Estado actual

| Etapa | Descripción | Estado |
|-------|-------------|--------|
| **1** | App: permisos, token Expo, guardar en AsyncStorage | ✅ Hecho |
| **2a** | Backend: guardar token por usuario (`PUT /api/auth/push-token`) | ✅ Hecho |
| **2b** | Backend: servicio que envía push vía Expo Push API | ✅ Hecho |
| **3** | Programar recordatorios (gestos hoy, cumpleaños, “regar”) | 🔄 En curso |
| **4** | Al tocar la notificación: abrir contacto/pantalla | Pendiente |
| **5** | Pruebas en dispositivo real (EAS Build) | Pendiente |

---

## Etapa 1 + 2 (ya hecho)

- **App:** `pushNotificationService.js` pide permisos, obtiene el Expo Push Token, lo guarda en AsyncStorage y lo envía al backend con `registerAndSendPushToken()`.
- **App:** Tras login, `App.js` llama a `registerAndSendPushToken()`.
- **Backend:** `PUT /api/auth/push-token` guarda el token en `Usuario.expoPushTokens[]` (máx. 5 por usuario).
- **Backend:** `pushService.js` tiene `sendPush()` y `sendPushToUser()`; `POST /api/auth/send-test-push` envía una notificación de prueba.

**Nota:** En Expo Go el push en Android puede no funcionar; hace falta un **development build** (EAS Build) para probar en dispositivo real.

---

## Etapa 3 – Recordatorios programados (en curso)

### 3a – Recordatorios de gestos “hoy”
- Backend: función que busca contactos con tareas no completadas cuya `fechaHoraEjecucion` sea hoy.
- Agrupa por usuario y envía un push por usuario con resumen (ej. “Tienes 2 gestos hoy: Llamar a María, Escribir a Juan”).
- Endpoint `POST /api/cron/send-reminders` (protegido por clave de cron) para que un cron externo (p. ej. Render Cron) lo llame cada mañana.

### 3b – Cumpleaños (opcional, siguiente)
- Job que detecte contactos con cumpleaños hoy y envíe push al usuario.

### 3c – “Regar” / degradación (opcional)
- Contactos que llevan muchos días sin interacción según su frecuencia; enviar recordatorio.

---

## Etapa 4 – Al tocar la notificación

- En la app: `Notifications.addNotificationResponseReceivedListener` para cuando el usuario toca la notificación.
- Incluir en el payload del push `data: { tipo, contactoId, gestoId?, ... }`.
- Navegar a la pantalla correspondiente (contacto, gestos del contacto) según `data`.

---

## Etapa 5 – Pruebas y pulido

- Probar en dispositivo físico con EAS Build (Android e iOS si aplica).
- Android: canales de notificación.
- iOS: permisos y configuración en `app.json` / EAS.

---

## Referencias

- [Expo Push Notifications Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Sending notifications (Expo Push API)](https://docs.expo.dev/push-notifications/sending-notifications/)
- [expo-notifications SDK](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
