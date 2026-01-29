# Subir tu código a GitHub — Modo dummie

Guía para quien **solo tiene cuenta de GitHub** y no ha configurado nada más. Paso a paso, sin asumir que sabes Git.

---

## Antes de empezar

- ✅ Tienes cuenta en GitHub (ya la creaste).
- ❓ No sabes si tienes Git instalado.
- ❓ No has configurado nombre ni email en Git.

Sigue los pasos en orden.

---

## PASO 0: ¿Tienes Git instalado?

1. Abre **PowerShell** o **Símbolo del sistema** (busca "PowerShell" o "cmd" en el menú de Windows).
2. Escribe exactamente esto y pulsa Enter:

   ```powershell
   git --version
   ```

3. **Si sale algo como** `git version 2.xx.x` → tienes Git. Sigue al **Paso 1**.
4. **Si sale** `'git' no se reconoce...` → tienes que instalar Git:
   - Entra en: https://git-scm.com/download/win
   - Descarga e instala (siguiente, siguiente, dejar opciones por defecto).
   - Cierra y vuelve a abrir PowerShell.
   - Vuelve a escribir `git --version` para comprobar.

---

## PASO 1: Configurar tu nombre y email (solo la primera vez)

Git necesita saber quién eres para los commits. Sustituye por tu nombre y tu email de GitHub:

```powershell
git config --global user.name "Tu Nombre"
git config --global user.email "tu-email@ejemplo.com"
```

- Usa el **mismo email** que en tu cuenta de GitHub.
- Las comillas son necesarias.

---

## PASO 2: Ir a la carpeta de tu proyecto

En la misma ventana de PowerShell:

```powershell
cd C:\DEV\ProyectoVinculo
```

Pulsa Enter. A partir de aquí, todos los comandos se ejecutan en esta carpeta.

---

## PASO 3: Crear el repositorio en GitHub (desde el navegador)

1. Abre el navegador y entra en: **https://github.com/new**
2. Inicia sesión si te lo pide.
3. **Repository name:** pon un nombre, por ejemplo: `proyecto-vinculo`
4. **Description:** opcional (ej: "App Vínculos").
5. Elige **Public**.
6. **Importante:** no marques nada de:
   - "Add a README file"
   - "Add .gitignore"
   - "Choose a license"
   Debe quedar todo vacío.
7. Pulsa **Create repository**.

Verás una página con instrucciones. No hace falta seguir las de la web; sigue los pasos de esta guía.

---

## PASO 4: Inicializar Git en tu carpeta (si es la primera vez)

En PowerShell, dentro de `C:\DEV\ProyectoVinculo`, ejecuta:

```powershell
git init
```

Deberías ver algo como: `Initialized empty Git repository...`

**Si ya habías hecho `git init` antes**, puede decir que el repositorio ya existe. No pasa nada, sigue al Paso 5.

---

## PASO 5: Decirle a Git qué archivos subir

```powershell
git add .
```

El punto (`.`) significa "todos los archivos de esta carpeta". No verás mucho mensaje; es normal.

### Si sale: `'mobile/' does not have a commit checked out` o `fatal: adding files failed`

Significa que dentro de la carpeta **mobile** hay otro repositorio Git (por ejemplo, creado por Expo). Hay que quitarlo para que todo el proyecto sea un solo repo.

En PowerShell, desde `C:\DEV\ProyectoVinculo`, ejecuta:

```powershell
Remove-Item -Recurse -Force mobile\.git
```

Luego vuelve a ejecutar:

```powershell
git add .
```

Los avisos de "LF will be replaced by CRLF" son normales en Windows; no son errores.

---

## PASO 6: Hacer el primer "guardado" (commit)

```powershell
git commit -m "Initial commit - App Vinculos"
```

- Si es la primera vez, puede pedirte configurar nombre/email; en ese caso vuelve al **Paso 1**.
- Si todo va bien, verás algo como "X files changed".

---

## PASO 7: Poner tu rama como "main"

```powershell
git branch -M main
```

Así GitHub y tu PC usan el mismo nombre de rama (main).

---

## PASO 8: Enlazar tu carpeta con el repositorio de GitHub

Tienes que usar **tu usuario de GitHub** y **el nombre del repositorio** que creaste en el Paso 3.

Sustituye en esta línea:
- `TU-USUARIO` → tu usuario de GitHub (ej: si tu perfil es github.com/pepito, es "pepito").
- `TU-REPO` → el nombre del repo (ej: `proyecto-vinculo`).

```powershell
git remote add origin https://github.com/OdemaConsultingAI/Proyectovinculo.git
```

Ejemplo real:
```powershell
git remote add origin https://github.com/pepito/proyecto-vinculo.git
```

Si te dice que `origin` ya existe, puedes usar:
```powershell
git remote set-url origin https://github.com/TU-USUARIO/TU-REPO.git
```

---

## PASO 9: Subir el código

```powershell
git push -u origin main
```

- La primera vez puede abrirse el navegador o una ventana para **iniciar sesión en GitHub**.
- Si te pide **usuario y contraseña**:
  - Usuario: tu usuario de GitHub.
  - Contraseña: **no** uses la contraseña de tu cuenta. GitHub pide un **Personal Access Token (PAT)**:
    1. En GitHub: **Settings** (de tu cuenta) → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
    2. **Generate new token (classic)**.
    3. Ponle un nombre (ej: "Mi PC") y marca al menos **repo**.
    4. Genera y **copia el token** (solo se muestra una vez).
    5. En PowerShell, cuando pida "Password", pega ese token (no se verá nada al escribir; es normal).

Si todo va bien, verás algo como "Branch 'main' set up to track...". Tu código ya está en GitHub.

---

## Resumen rápido (cuando ya hayas hecho todo una vez)

Para futuras subidas, desde `C:\DEV\ProyectoVinculo`:

```powershell
git add .
git commit -m "Descripción de lo que cambiaste"
git push
```

---

## Errores frecuentes

| Mensaje / problema | Qué hacer |
|--------------------|-----------|
| `'git' no se reconoce` | Instalar Git (Paso 0). |
| `Please tell me who you are` | Configurar nombre y email (Paso 1). |
| `failed to push... authentication failed` | Usar Personal Access Token en lugar de la contraseña (Paso 9). |
| `remote origin already exists` | Usar `git remote set-url origin https://github.com/TU-USUARIO/TU-REPO.git` con tu usuario y repo. |
| `branch 'main' not found` | Ejecutar antes `git branch -M main` (Paso 7). |

Si algo no coincide con lo que ves, copia el mensaje de error y búscalo o pregúntame con el mensaje exacto.
