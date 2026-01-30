# Qué sigue después del push

## 1. Render (backend en la nube)

- **Si el repo está conectado a Render**: el deploy suele iniciarse solo al hacer push. Entra al dashboard de Render → tu servicio → pestaña **Logs** y espera a que termine el build y el start.
- **Si no se desplegó solo**: en el servicio → **Manual Deploy** → **Deploy latest commit**.
- **Variables de entorno**: en Render → **Environment** comprueba que estén definidas (no hace falta reiniciar solo por el push):
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `OPENAI_API_KEY` (si usas notas de voz con IA)
- No hace falta “reiniciar” nada más en Render; con un deploy correcto el nuevo código ya está en marcha.

---

## 2. App móvil

- **No hace falta reinstalar ni reiniciar** el backend por tu cuenta; la app usa la URL de producción (`https://proyectovinculo.onrender.com`).
- Si tenías la app abierta: cierra completamente la app y ábrela de nuevo (o recarga con “Reload” en Expo) para asegurarte de que no quede caché raro.
- Prueba: graba una nota de voz → al detener debería subir a `/api/ai/voice-temp` sin 404.

---

## 3. Resumen

| Dónde        | Acción |
|-------------|--------|
| **Render**  | Esperar a que termine el deploy (o hacer Manual Deploy) y revisar Logs. |
| **Variables**| Comprobar en Render que MONGODB_URI, JWT_SECRET y OPENAI_API_KEY estén bien. |
| **App móvil**| Cerrar y abrir la app (o Reload); probar grabación de voz. |
| **Local**   | No hace falta reiniciar nada más. |

Cuando el deploy en Render esté en verde y la app use esa URL, los cambios (incluida la subida de notas de voz temporales) deberían funcionar.
