# Solución: EAS Build incluye backend/ (monorepo)

Si el build falla con errores de `backend/` y "Permission denied", EAS está empaquetando **todo el repo** (raíz de Git) en lugar de solo la carpeta **mobile**. Es un comportamiento conocido de EAS cuando la app está en un subdirectorio.

---

## Opción 1: Script que empaqueta solo mobile (recomendado)

En la raíz del repo hay un script que **copia solo la carpeta mobile** a una carpeta temporal (sin .git padre) y ejecuta el build desde ahí. Así EAS solo sube el contenido de la app.

**Desde PowerShell, en la raíz del repo:**

```powershell
cd C:\DEV\ProyectoVinculo
.\eas-build-solo-mobile.ps1
```

El script crea una carpeta temporal (por ejemplo en `%TEMP%\vinculos-eas-build-...`), copia ahí el contenido de `mobile` (sin node_modules), entra en esa carpeta y ejecuta `eas build --platform android --profile preview --clear-cache`. En el servidor de EAS solo llega la app, no el backend.

---

## Opción 2: Configurar la ruta en Expo (si el build usa GitHub)

Si tu proyecto en Expo está conectado a GitHub, EAS puede estar **clonando el repo completo** y usando la raíz. En ese caso hay que decirle la subcarpeta:

1. Entra en **https://expo.dev** e inicia sesión.
2. Abre tu **proyecto** (Vínculos / vinculos-app).
3. Ve a **Project settings** (o **Settings**).
4. Busca la sección **GitHub** o **Build**.
5. Si hay un campo **"Root directory"**, **"Working directory"** o **"Source path"**, pon: **`mobile`** (sin barra final).
6. Guarda los cambios.
7. Vuelve a lanzar el build:
   ```powershell
   cd C:\DEV\ProyectoVinculo\mobile
   eas build --platform android --profile preview --clear-cache
   ```

---

## Opción 3: Asegurarte de que el build sube solo desde `mobile/`

Cuando ejecutas `eas build` en tu PC, EAS empaqueta **el directorio actual**. Si en el tarball aparece `backend/`, es que el directorio actual no es `mobile/`.

1. Abre una **nueva** terminal en VS Code o PowerShell.
2. Navega solo a la carpeta de la app:
   ```powershell
   cd C:\DEV\ProyectoVinculo\mobile
   ```
3. Comprueba que estás en la carpeta correcta:
   ```powershell
   pwd
   dir app.json
   ```
   - `pwd` debe mostrar una ruta que **termine en** `\mobile` (o `\ProyectoVinculo\mobile`).
   - `dir app.json` debe mostrar el archivo (no "no encontrado").
4. Lanza el build:
   ```powershell
   eas build --platform android --profile preview --clear-cache
   ```

No ejecutes `eas build` desde `C:\DEV\ProyectoVinculo` (raíz del repo). Tienes que estar dentro de `mobile`.

---

## Opción 4: Build solo con archivos locales (sin GitHub)

Para forzar que EAS use **solo los archivos de tu PC** y no el repo de GitHub:

1. Entra en **https://expo.dev** → tu proyecto → **Settings**.
2. Si hay una opción tipo **"Use GitHub for builds"** o **"Build from GitHub"**, **desactívala** o desvincula el repo para este proyecto (así EAS usará la subida local).
3. En tu PC, desde **solo** la carpeta `mobile`:
   ```powershell
   cd C:\DEV\ProyectoVinculo\mobile
   eas build --platform android --profile preview --clear-cache
   ```

(La opción exacta puede llamarse distinto; busca algo relacionado con "GitHub" o "source" en la configuración del proyecto.)

---

## Resumen

| Causa probable | Qué hacer |
|----------------|-----------|
| EAS empaqueta desde la raíz de Git (monorepo) | Usar **`.\eas-build-solo-mobile.ps1`** desde la raíz del repo (Opción 1) |
| Build desde GitHub / dashboard | Expo → Project settings → Root/Working directory = **`mobile`** |
| Estás en la raíz del repo al ejecutar | No basta con `cd mobile`; EAS sigue usando la raíz de Git. Usar el script (Opción 1). |
| EAS usa el repo en lugar de la subida local | Desvincular GitHub para el build o configurar la ruta `mobile` en Expo |

Cuando EAS use **solo** la carpeta `mobile`, el tarball ya no contendrá `backend/` y el build debería completarse.
