# Comandos Git y Render — Paso a paso detallado

Usa este documento cada vez que debas subir cambios del backend y desplegar en Render.

---

## 1. Abrir la terminal en la raíz del proyecto

En PowerShell o CMD:

```powershell
cd c:\DEV\ProyectoVinculo
```

O si ya estás en otra carpeta del proyecto:

```powershell
cd c:\DEV\ProyectoVinculo
```

Comprueba que estás en la raíz (debe existir la carpeta `backend` y `mobile`):

```powershell
dir
```

Deberías ver algo como: `backend`, `mobile`, `.github`, `ACTUALIZAR_SERVIDORES_Y_PROBAR.md`, etc.

---

## 2. Ver el estado actual de Git

Antes de hacer commit, revisa qué archivos cambiaron:

```powershell
git status
```

Verás:
- **Modified**: archivos que ya estaban en el repo y fueron modificados.
- **Untracked**: archivos nuevos que Git aún no sigue.
- **Staged**: archivos ya añadidos con `git add` (listos para commit).

Si quieres ver el contenido concreto de los cambios:

```powershell
git diff
```

(para cambios en archivos ya seguidos pero no staged)

```powershell
git diff --staged
```

(para cambios ya añadidos con `git add`)

---

## 3. Añadir los archivos al área de preparación (staging)

**Opción A — Añadir todo (recomendado si solo tocaste backend/mobile del proyecto):**

```powershell
git add .
```

El punto (`.`) significa “todos los archivos modificados o nuevos desde aquí abajo”.

**Opción B — Añadir solo la carpeta backend (si solo cambiaste backend):**

```powershell
git add backend/
```

**Opción C — Añadir archivos concretos:**

```powershell
git add backend/index.js
git add backend/models/Contacto.js
```

Comprueba qué quedó preparado:

```powershell
git status
```

Los archivos listados en verde (o como “to be committed”) son los que se incluirán en el próximo commit.

---

## 4. Hacer el commit (guardar los cambios en tu historial local)

```powershell
git commit -m "from-voice: guardar transcripción íntegra sin audio"
```

- `-m "..."` es el mensaje del commit. Debe describir brevemente qué cambiaste.
- Si no pones `-m`, Git abrirá un editor para que escribas el mensaje.

Ejemplos de mensajes útiles para otros commits:

```powershell
git commit -m "Backend: nuevas rutas from-voice para interacción y tarea"
git commit -m "Backend: transcripción íntegra en from-voice, sin audio"
git commit -m "Fix: pasar texto en saveInteractionFromVoice y saveTaskFromVoice"
```

Comprueba que el commit se creó:

```powershell
git log -1 --oneline
```

Verás la última línea del historial, por ejemplo:  
`a1b2c3d from-voice: guardar transcripción íntegra sin audio`

---

## 5. Subir los cambios a GitHub (rama main)

Primero asegúrate de estar en la rama que usa Render (normalmente `main`):

```powershell
git branch
```

El asterisco (*) indica la rama actual. Debe ser `main` (o `master` en repos antiguos).

Si estás en otra rama y quieres subir a `main`:

```powershell
git checkout main
```

Luego sube los commits:

```powershell
git push origin main
```

- `origin`: nombre del remoto (tu repo en GitHub).
- `main`: rama que quieres actualizar en GitHub.

Si tu rama principal se llama `master`:

```powershell
git push origin master
```

Si Git pide usuario/contraseña:
- En GitHub ya no se usa contraseña normal; se usa **Personal Access Token** (PAT) como contraseña, o **SSH**.
- Si usas PAT: en la contraseña pega el token.
- Si tienes error de permisos, revisa en GitHub: Settings → Developer settings → Personal access tokens.

Comprueba que GitHub tiene los últimos cambios:

```powershell
git status
```

Debería decir: `Your branch is up to date with 'origin/main'.` (o `origin/master`).

---

## 6. Render — Esperar deploy automático o hacer Manual Deploy

### 6.1 Si tienes Auto-Deploy activado (habitual)

1. Entra en **https://dashboard.render.com**
2. Inicia sesión.
3. Abre tu **Web Service** del backend (ej. “ProyectoVinculo” o “vinculos-backend”).
4. Pestaña **Events** (o **Deploys**).
5. Deberías ver un nuevo deploy iniciado por “Push to main” (o “Push to master”).
6. Espera a que el estado pase a **Succeeded** (verde). Suele tardar **2–5 minutos**.
7. Si ves **Failed** (rojo), abre el deploy y revisa la pestaña **Logs** para ver el error.

### 6.2 Si no se desplegó solo o quieres forzar la última versión (Manual Deploy)

1. Entra en **https://dashboard.render.com**
2. Abre tu **Web Service** del backend.
3. Arriba a la derecha, botón **Manual Deploy**.
4. Despliega y elige **Deploy latest commit** (o la rama `main` / `master`).
5. Pulsa **Deploy**.
6. Espera a que el build y el start terminen (2–5 min) y el estado sea **Succeeded**.

---

## 7. Comprobar que el backend responde

En el navegador abre:

```
https://proyectovinculo.onrender.com/api/health
```

Deberías ver algo como:

```json
{"estado":"conectado","readyState":1,"timestamp":"..."}
```

- Si la primera vez tarda o da error, espera **30 segundos** (Render puede estar “despertando”) y vuelve a probar.
- Si sigue fallando, revisa en Render la pestaña **Logs** del servicio para ver errores de arranque o variables de entorno.

---

## Resumen rápido (copiar y pegar)

```powershell
cd c:\DEV\ProyectoVinculo
git status
git add .
git commit -m "from-voice: guardar transcripción íntegra sin audio"
git branch
git push origin main
```

Luego en Render: **Events** → comprobar que el deploy termine en **Succeeded** → probar **https://proyectovinculo.onrender.com/api/health**.

---

## Errores frecuentes

| Error | Qué hacer |
|-------|-----------|
| `git push` pide usuario/contraseña | Usar Personal Access Token (GitHub) como contraseña, o configurar SSH. |
| `Everything up-to-date` y no hay deploy nuevo | Ya habías hecho `git push` antes; no hay commits nuevos. Haz commit antes. |
| `failed to push some refs` / rechazo | Alguien más subió cambios. Haz `git pull origin main` y luego `git push origin main`. |
| Deploy en Render en rojo | Abrir el deploy → **Logs** y revisar el mensaje de error (dependencias, variables, sintaxis). |
| Health devuelve 404 o no responde | Comprobar que la URL sea la de tu servicio en Render y que el último deploy haya sido **Succeeded**. |
