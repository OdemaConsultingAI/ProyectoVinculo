# Plan de notificaciones push (por etapas)

Objetivo: que el usuario reciba notificaciones push en el teléfono (recordatorios de gestos, riego, cumpleaños, etc.) de forma progresiva y sin colapsar.

---

## Estado actual

- **Cliente (mobile):** Ya usa `expo-notifications`. Se piden permisos y se obtiene el **Expo Push Token**, que se guarda en **AsyncStorage** (`pushNotificationService.js`). Al iniciar sesión se llama a `registerForPushNotificationsAsync()` desde `App.js`.
- **Backend:** No guarda tokens ni envía push todavía.

---

## Etapa 1 – Permisos y token en el cliente ✅ (ya hecho)

- [x] Permisos de notificaciones.
- [x] Obtener Expo Push Token (solo en dispositivo físico; en Expo Go puede ser limitado).
- [x] Guardar token en AsyncStorage.
- [x] Llamar al registro al estar autenticado (import en `App.js` corregido).

**Nota:** Para recibir push en dispositivo real necesitas un **build de desarrollo o producción** (EAS Build), no solo Expo Go, salvo que uses el flujo de notificaciones de Expo Go.

---

## Etapa 2 – Enviar token al backend y guardarlo

1. **Backend**
   - Añadir campo `expoPushTokens` (array de strings) al modelo **Usuario** (por si en el futuro hay varios dispositivos).
   - Endpoint autenticado, por ejemplo: `PUT /api/users/me/push-token` (body: `{ "expoPushToken": "ExponentPushToken[xxx]" }`).
   - Lógica: añadir el token al array si no existe (evitar duplicados); opcional: límite de N tokens por usuario.

2. **Cliente (mobile)**
   - Tras login (y cuando se obtenga/actualice el token): llamar al nuevo endpoint con el token guardado en AsyncStorage.
   - Hacerlo desde `App.js` después de `registerForPushNotificationsAsync()` cuando haya token, o desde el flujo de login/refresh.

**Resultado:** El backend conoce el token del usuario y podrá enviar notificaciones en etapas posteriores.

---

## Etapa 3 – Enviar notificaciones desde el backend

1. **Servicio de envío**
   - En el backend, usar la [API de Expo Push](https://docs.expo.dev/push-notifications/sending-notifications/) (POST a `https://exp.host/--/api/v2/push/send`).
   - Crear un helper, por ejemplo `services/pushService.js`: recibir lista de tokens y payload (título, cuerpo, `data` opcional).

2. **Cuándo enviar**
   - **Recordatorios de gestos:** al tener una tarea/job (cron o similar) que cada X tiempo revise gestos con `fechaHoraEjecucion` cercana y envíe un push al usuario dueño del contacto.
   - **Riego (degradación):** job que revise contactos con “necesidad de riego” y envíe un resumen o un push por contacto.
   - **Cumpleaños:** job diario que detecte cumpleaños del día y envíe push.

3. **Datos mínimos del payload**
   - `to`: Expo Push Token.
   - `title`, `body`.
   - `data`: ej. `{ type: 'gesto', contactoId: '...', tareaId: '...' }` para luego abrir pantalla concreta (Etapa 4).

**Resultado:** El usuario recibe notificaciones push reales en el teléfono cuando el backend decide enviarlas.

---

## Etapa 4 – Manejar tap y notificaciones en primer/segundo plano

1. **Listeners en el cliente**
   - `Notifications.addNotificationReceivedListener`: notificación recibida (app en primer plano).
   - `Notifications.addNotificationResponseReceivedListener`: usuario tocó la notificación (abrir pantalla concreta).

2. **Navegación al tocar**
   - Según `data.type` (y `data.contactoId`, `data.tareaId`, etc.), navegar a Vínculos, Gestos, o a un contacto/modal concreto (usando `navigationRef` o React Navigation).

3. **Canales Android (opcional)**
   - Configurar canal de notificaciones para Android para mejor comportamiento y prioridad.

**Resultado:** Al tocar una notificación, la app abre la pantalla o el detalle adecuado.

---

## Etapa 5 – Notificaciones locales (opcional)

- Usar `expo-notifications` para programar **notificaciones locales** en el dispositivo (sin depender del backend), por ejemplo recordatorios de gestos con `fechaHoraEjecucion` cercana.
- Útil como respaldo si el backend no está disponible o para reducir dependencia del servidor en ciertos recordatorios.

---

## Orden recomendado

1. **Etapa 1** – Ya hecha; solo asegurar import y que el token se obtenga en build real.
2. **Etapa 2** – Implementar ahora: modelo Usuario + endpoint + envío del token desde la app.
3. **Etapa 3** – Añadir jobs + envío real de push desde el backend.
4. **Etapa 4** – Listeners y navegación al tocar.
5. **Etapa 5** – Opcional: notificaciones locales.

---

## Referencias

- [Expo Push Notifications](https://docs.expo.dev/push-notifications/overview/)
- [Sending notifications (Expo)](https://docs.expo.dev/push-notifications/sending-notifications/)
- [EAS Build](https://docs.expo.dev/build/introduction/) (necesario para push en dispositivo real con tu propio proyecto).
