# Comandos Git para actualizar todo y desplegar en Render

Ejecuta estos comandos **en orden** desde la raíz del proyecto (`c:\DEV\ProyectoVinculo`).

---

## 1. Ir a la carpeta del proyecto

```powershell
cd c:\DEV\ProyectoVinculo
```

---

## 2. Ver qué hay cambiado (opcional)

```powershell
git status
```

---

## 3. Añadir todos los cambios (backend, mobile, docs)

```powershell
git add .
```

---

## 4. Hacer commit con un mensaje claro

```powershell
git commit -m "Notas de voz temporales: rutas /api/voice/temp y /api/ai/voice-temp, subida base64 y borrado al guardar o cerrar"
```

Si Git pide configurar usuario/email la primera vez:

```powershell
git config user.email "tu@email.com"
git config user.name "Tu Nombre"
```

Luego repite el `git commit` del paso 4.

---

## 5. Subir a GitHub (origin main)

```powershell
git push origin main
```

Si tu rama se llama `master` en lugar de `main`:

```powershell
git push origin master
```

---

## Resumen en una sola línea (PowerShell)

```powershell
cd c:\DEV\ProyectoVinculo; git add .; git commit -m "Notas de voz temporales: rutas voice/temp, subida base64 y borrado al guardar"; git push origin main
```

---

## Si algo falla

- **"nothing to commit"** → No hay cambios; `git add .` no añadió nada o ya hiciste commit.
- **"failed to push"** → Revisa que tengas `git remote -v` y que tengas permisos (token/SSH). Si hay cambios en remoto: `git pull origin main --rebase` y luego `git push origin main`.
- **Render no se actualiza** → En el dashboard de Render, comprueba que el servicio esté conectado a la rama correcta (`main`) y haz **Manual Deploy** si hace falta.
