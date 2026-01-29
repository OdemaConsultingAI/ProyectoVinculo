# Dónde ver el workflow en GitHub

## 1. Subir el workflow a GitHub (si aún no lo hiciste)

En PowerShell, desde la raíz del proyecto:

```powershell
cd C:\DEV\ProyectoVinculo

# Ver si el archivo está pendiente de subir
git status

# Añadir el workflow (y la guía)
git add .github/workflows/keep-awake-render.yml
git add EVITAR_SUEÑO_RENDER.md
# Opcional: añadir todo lo pendiente
# git add .

git commit -m "Workflow: mantener Render despierto cada 14 min"
git push origin main
```

Si `git status` no muestra `.github/workflows/keep-awake-render.yml`, el archivo ya está en el último commit pero quizá no has hecho push. Haz entonces solo:

```powershell
git push origin main
```

---

## 2. Dónde ver el workflow en GitHub

1. Abre tu repositorio en **https://github.com/TU-USUARIO/TU-REPO** (sustituye por tu usuario y nombre del repo).

2. En la **barra superior** del repo (donde están Code, Issues, Pull requests...) haz clic en **"Actions"**.

3. En el **menú izquierdo** deberías ver la lista de workflows. Busca **"Keep Render awake"**.

4. Si no aparece en el menú:
   - Comprueba que hayas hecho **push** del archivo `.github/workflows/keep-awake-render.yml`.
   - En la pestaña **Actions**, mira si pone "No workflows have been run yet" o si hay algún mensaje de error. A veces el workflow aparece después de la **primera ejecución** (automática a los 14 min o manual).

5. **Ejecutar manualmente una vez:**
   - En **Actions** → clic en **"Keep Render awake"**.
   - Arriba a la derecha: **"Run workflow"** → **"Run workflow"** (botón verde).
   - En la lista de "Workflow runs" debería aparecer una ejecución. Así verificas que el workflow está activo.

---

## 3. Si Actions está desactivado

En algunos repos (sobre todo nuevos o de organización), Actions puede estar desactivado:

1. En el repo → **Settings** (solo si tienes permisos).
2. Menú izquierdo → **Actions** → **General**.
3. En "Actions permissions" elige **"Allow all actions and reusable workflows"** (o al menos permitir workflows del repo).
4. Guarda.

---

## 4. Comprobar que el archivo está en GitHub

1. En el repo, ve a la pestaña **Code**.
2. Entra en la carpeta **`.github`**.
3. Luego en **`workflows`**.
4. Deberías ver **`keep-awake-render.yml`**.

Si **no** ves la carpeta `.github`, el push no incluyó ese archivo. Vuelve al paso 1 y asegúrate de hacer `git add .github/workflows/keep-awake-render.yml` y `git push origin main`.
