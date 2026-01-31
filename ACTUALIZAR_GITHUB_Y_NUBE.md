
# Paso a paso: Actualizar GitHub y que todo quede en la nube

Guía **actual** para subir tus cambios a GitHub y que el backend en Render (nube) se actualice.

---

## Resumen rápido

1. Abres PowerShell en la carpeta del proyecto.
2. Añades los cambios, haces commit y subes con `git push`.
3. Render (si está conectado a tu repo) vuelve a desplegar el backend automáticamente.
4. La app móvil ya está configurada para usar la nube (`config.js` → producción).

---

## PASO 1: Abrir PowerShell en el proyecto

```powershell
cd C:\DEV\ProyectoVinculo
```

---

## PASO 2: Ver qué archivos cambiaron

```powershell
git status
```

Verás archivos en rojo (sin añadir) o en verde (listos para commit). No hace falta memorizar nada; el siguiente paso añade todo.

---

## PASO 3: Añadir todos los cambios

```powershell
git add .
```

El punto (`.`) significa “todos los archivos modificados o nuevos”.

---

## PASO 4: Hacer commit (guardar una “foto” del proyecto)

```powershell
git commit -m "Descripción corta de lo que cambiaste"
```

Ejemplos de mensaje:
- `"Config app para nube y fix require cycle"`
- `"Indicador PC/Nube en headers"`
- `"Fix AbortSignal y auth con backend en Render"`

Si te dice que no hay nada que commitear, es que no hay cambios nuevos; en ese caso no hace falta hacer más.

---

## PASO 5: Subir a GitHub

```powershell
git push origin main
```

- **Este proyecto usa la rama `main`.** No uses `master` (daría error: "src refspec master does not match any").
- Si tu rama se llamara `master`, entonces usarías: `git push origin master`
- Si te pide usuario y contraseña, **contraseña** = tu **Personal Access Token** de GitHub (no la contraseña de la cuenta).

Después de esto, tu código ya está en GitHub.

---

## PASO 6: Qué pasa en la nube (Render)

- Si en Render conectaste el servicio a tu repositorio de GitHub con **auto-deploy**:
  - Render detecta el nuevo `push` a `main` (o la rama que configuraste).
  - Vuelve a construir y desplegar el **backend** con el código nuevo.
  - En unos minutos tu API en `https://proyectovinculo.onrender.com` estará actualizada.

- Si no tienes auto-deploy: en el dashboard de Render, entra al servicio y usa **“Manual Deploy”** → **“Deploy latest commit”** (o similar) después de hacer `git push`.

---

## Resumen de comandos (copiar y pegar)

Desde `C:\DEV\ProyectoVinculo`:

```powershell
cd C:\DEV\ProyectoVinculo
git status
git add .
git commit -m "Tu mensaje aquí"
git push origin main
```

Sustituye `"Tu mensaje aquí"` por una descripción breve de los cambios.

---

## Checklist rápido

| Paso | Acción | Comando |
|------|--------|--------|
| 1 | Ir al proyecto | `cd C:\DEV\ProyectoVinculo` |
| 2 | Ver cambios | `git status` |
| 3 | Añadir todo | `git add .` |
| 4 | Guardar commit | `git commit -m "mensaje"` |
| 5 | Subir a GitHub | `git push origin main` |
| 6 | Nube | Render redespliega el backend (si está conectado) |

---

## Notas importantes

- **Backend en la nube:** Lo que está “en la nube” es el **backend** (Render). Cada `git push` a la rama que usa Render actualiza ese backend.
- **App móvil:** El código de la app también se sube a GitHub (todo el repo), pero la app en el teléfono se actualiza cuando tú recargas en Expo Go o generas un nuevo build. La app ya está configurada para usar la API en la nube (`https://proyectovinculo.onrender.com`).
- **Primera vez:** Si aún no has hecho `git remote add origin ...`, sigue antes la guía **SUBIR_A_GITHUB_MODO_DUMMIE.md** (pasos iniciales de crear repo y conectar `origin`).

---

## Si algo falla

| Mensaje / problema | Qué hacer |
|--------------------|-----------|
| `nothing to commit` | No hay cambios; no hace falta commit ni push. |
| `failed to push ... authentication failed` | Usar **Personal Access Token** de GitHub como contraseña. |
| `branch 'main' not found` | Usar `git push origin master` si tu rama es `master`. |
| Render no se actualiza | En Render, revisar que el servicio esté vinculado al repo y a la rama correcta, y que auto-deploy esté activado. |

Cuando sigues este paso a paso, **actualizas GitHub y todo queda alineado con la nube** (backend en Render).
