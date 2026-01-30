# Plan por etapas: Notificaciones push

Objetivo: que la app envíe notificaciones push al teléfono (recordatorios de gestos, momentos, cumpleaños, etc.) usando **Expo Push Notifications**.

---

## Resumen de etapas

| Etapa | Descripción | Estado |
|-------|-------------|--------|
| **1** | Configuración base en la app: `expo-notifications`, permisos y token | En curso |
| **2** | Backend: guardar token por usuario y endpoint para enviar push | Pendiente |
| **3** | Programar envío: recordatorios según gestos y fechas | Pendiente |
| **4** | Al tocar la notificación: abrir contacto o pantalla relevante | Pendiente |
| **5** | Pruebas en dispositivo real y ajustes (canales Android, etc.) | Pendiente |

---

## Etapa 1: App – permisos y token

- Instalar `expo-notifications`, `expo-device`, `expo-constants`.
- Añadir plugin de notificaciones en `app.json`.
- Crear servicio que:
  - Solicite permiso de notificaciones.
  - Obtenga el **Expo Push Token** (solo en dispositivo físico).
  - Guarde el token en AsyncStorage para usarlo luego.
- Opcional: mostrar en Configuración si las notificaciones están activas y si hay token.

**Nota:** En Expo Go, el push en Android puede requerir un **development build** (EAS Build). Las notificaciones locales sí funcionan en Expo Go.

**Instalación (Etapa 1):** En la carpeta `mobile` ejecuta:
```bash
npm install
```
(o `npx expo install expo-notifications expo-device expo-constants` si prefieres que Expo fije versiones).

---

## Etapa 2: Backend – token y envío

- Modelo o campo en usuario: `expoPushTokens: [{ token, deviceId? }]`.
- Ruta `POST /api/usuarios/push-token` (autenticada): guardar/actualizar token.
- Ruta interna o job que llame a **Expo Push API** (`https://exp.host/--/api/v2/push/send`) para enviar a uno o varios tokens.
- Probar envío manual con el token obtenido en Etapa 1.

---

## Etapa 3: Programar recordatorios

- Definir qué eventos generan notificación:
  - Gesto con `fechaHoraEjecucion` hoy (o el día elegido).
  - Cumpleaños próximo (ej. día D o D-1).
  - Opción: “regar” – contacto sin interacción desde hace X días según frecuencia.
- Backend: job/cron (o trigger al guardar gestos/contactos) que:
  - Consulte gestos/contactos con fecha de recordatorio = hoy (o ventana).
  - Por cada usuario afectado, tome sus `expoPushTokens` y envíe un push con título/mensaje (ej. “Llama a María”, “Cumple de Juan mañana”).
- Ajustar mensajes y horarios (ej. recordatorio a las 9:00).

---

## Etapa 4: Al tocar la notificación

- En la app: `Notifications.addNotificationResponseReceivedListener` (o equivalente) para cuando el usuario toca la notificación.
- Incluir en el payload del push `data: { tipo, contactoId, gestoId?, ... }`.
- Navegar a la pantalla correspondiente (contacto, gestos del contacto, etc.) según `data`.

---

## Etapa 5: Pruebas y pulido

- Probar en dispositivo físico (Android e iOS si aplica).
- Android: canales de notificación y prioridad.
- iOS: permisos y configuración en `app.json`/EAS.
- Manejar rechazo de permisos y renovación del token.

---

## Referencias

- [Expo Push Notifications Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Sending notifications (Expo Push API)](https://docs.expo.dev/push-notifications/sending-notifications/)
- [expo-notifications SDK](https://docs.expo.dev/versions/latest/sdk/notifications/)
