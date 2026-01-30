# Paso a paso: actualizar servidores y probar últimas funciones

Funciones recientes: **notas de voz** (grabar → subir base64 temporal → transcribir con Whisper → mostrar transcripción → borrar temp al cerrar/guardar).

---

## 1. Backend en Render (nube)

### 1.1 Comprobar que el último código está desplegado

- Entra a **https://dashboard.render.com**
- Abre tu **Web Service** del backend (ProyectoVinculo).
- Pestaña **Events** o **Logs**: revisa que el último deploy sea **después** de tu último `git push` y que haya terminado en **verde** (Build + Start OK).

### 1.2 Si no se desplegó solo o quieres forzar la última versión

- En el servicio → botón **Manual Deploy** → **Deploy latest commit**.
- Espera a que termine (Build + Start, suele ser 2–5 min).

### 1.3 Variables de entorno (necesarias para transcripción)

En el servicio → **Environment**:

| Variable          | Uso |
|-------------------|-----|
| `MONGODB_URI`     | Conexión a MongoDB Atlas (obligatoria). |
| `JWT_SECRET`      | Firmar tokens de login (obligatoria). |
| `OPENAI_API_KEY`  | Transcripción de voz con Whisper (necesaria para que funcione la transcripción). |

Si falta `OPENAI_API_KEY`, créala en OpenAI (API keys), pégala en Render y guarda. Render reiniciará el servicio solo.

### 1.4 Comprobar que el backend responde

- En el navegador: **https://proyectovinculo.onrender.com/api/health**  
  Deberías ver algo como `{"estado":"conectado",...}`.
- Si la primera vez tarda o da error, espera 30 s (Render puede estar “durmiendo”) y vuelve a probar.

---

## 2. App móvil (Expo)

### 2.1 Asegurarte de tener el código actual

En la carpeta del proyecto (donde está el repo):

```powershell
cd C:\DEV\ProyectoVinculo
git status
```

Si hay cambios sin commitear y quieres la versión que ya subiste a GitHub:

```powershell
git pull origin main
```

### 2.2 Instalar dependencias (solo si cambiaste algo en package.json)

```powershell
cd C:\DEV\ProyectoVinculo\mobile
npm install
```

### 2.3 Arrancar la app

```powershell
cd C:\DEV\ProyectoVinculo\mobile
npx expo start
```

- Escanea el código QR con Expo Go (Android) o cámara (iOS), o pulsa la tecla para abrir en emulador.
- La app usa por defecto **producción** (`https://proyectovinculo.onrender.com`), según `mobile/constants/config.js`.

### 2.4 Refrescar si ya estaba abierta

- En el dispositivo/emulador: **agita** el dispositivo o usa el menú de desarrollo y elige **Reload**.
- O en la terminal de Expo pulsa **`r`** para recargar.

---

## 3. Prueba rápida de notas de voz

1. **Inicia sesión** en la app.
2. Ve a **Tareas** o **Vínculos**.
3. Pulsa el **botón del micrófono** (estrella).
4. **Graba** una frase corta y pulsa **Stop**.
5. Deberías ver:
   - Modal “Nota grabada”.
   - “Transcribiendo...” y luego la **transcripción** del texto.
   - Botón **Reproducir nota** (audio local).
   - Al **Cerrar** o **Guardar**, la nota temporal se borra en el servidor.

Si la transcripción no aparece y ves error 404 o 503, revisa que en Render el último deploy esté en verde y que `OPENAI_API_KEY` esté definida.

---

## 4. (Opcional) Backend local para desarrollo

Solo si quieres probar contra tu PC en lugar de Render:

### 4.1 Variables de entorno local

En `C:\DEV\ProyectoVinculo\backend` crea o edita `.env` (no subas este archivo) con al menos:

- `MONGODB_URI=...` (tu URI de Atlas)
- `JWT_SECRET=...` (una clave secreta)
- `OPENAI_API_KEY=...` (para transcripción)

### 4.2 Arrancar backend local

```powershell
cd C:\DEV\ProyectoVinculo\backend
npm install
node index.js
```

Debería escuchar en `http://0.0.0.0:3000` (o el puerto que uses).

### 4.3 Usar la app contra el backend local

En `mobile/constants/config.js` cambia temporalmente:

```javascript
const FORCE_ENV = 'development';  // estaba 'production'
```

Y en `config.development` asegúrate de que `API_BASE_URL` sea la IP de tu PC (ej. `http://192.168.x.x:3000` o tu IP de Tailscale). Reinicia o recarga la app (Expo) y prueba de nuevo.

---

## Resumen

| Dónde        | Acción |
|-------------|--------|
| **Render**  | Comprobar último deploy en verde; si no, Manual Deploy. Revisar MONGODB_URI, JWT_SECRET, OPENAI_API_KEY. |
| **App**     | `git pull` si hace falta, `npm install` en mobile si cambiaste deps, `npx expo start`, Reload en el dispositivo. |
| **Probar**  | Login → Tareas o Vínculos → micrófono → grabar → stop → ver transcripción y reproducir. |

Cuando Render tenga el último código y `OPENAI_API_KEY` configurada, las últimas funciones (voz temporal + transcripción) deberían funcionar en la app.
