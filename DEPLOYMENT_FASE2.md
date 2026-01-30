# Deployment Fase 2: App instalable (EAS Build)

En esta fase generas un **APK** (o IPA) para instalar la app en el móvil sin usar Expo Go.

---

## Lo que ya está preparado en el repo

- **`mobile/eas.json`** — Perfiles de build (preview con APK, production).
- **`mobile/app.json`** — Nombre "Vínculos", slug `vinculos-app`, package Android `com.vinculos.app`.

---

## Paso 1: Instalar EAS CLI

En PowerShell:

```powershell
npm install -g eas-cli
```

Comprueba la versión:

```powershell
eas --version
```

---

## Paso 2: Iniciar sesión en Expo

```powershell
eas login
```

- Si tienes cuenta en **expo.dev**, usa ese email y contraseña.
- Si no, crea una en https://expo.dev/signup (gratis).

---

## Paso 3: Configurar el proyecto en EAS (solo la primera vez)

Desde la carpeta **mobile**:

```powershell
cd C:\DEV\ProyectoVinculo\mobile
eas build:configure
```

Si pregunta si quieres crear `eas.json`, di **No** (ya existe). Si pregunta por el nombre del proyecto o la cuenta, elige tu cuenta de Expo.

---

## Paso 4: Generar un build de prueba (Android APK)

### Opción A: Script desde la raíz (recomendado si antes falló por backend/)

Desde la **raíz del repo** (no desde `mobile`), ejecuta el script que empaqueta solo la app y lanza EAS:

```powershell
cd C:\DEV\ProyectoVinculo
.\eas-build-solo-mobile.ps1
```

El script copia solo la carpeta `mobile` a una carpeta temporal y ejecuta `eas build` desde ahí. Así EAS no incluye `backend/` y evita errores de "Permission denied" o tar. Ver **EAS_BUILD_MONOREPO_FIX.md** si necesitas más detalle.

### Opción B: Desde la carpeta mobile

Si prefieres lanzar EAS directamente, **entra solo en `mobile`** (el prompt debe terminar en `\mobile`):

```powershell
cd C:\DEV\ProyectoVinculo\mobile
eas build --platform android --profile preview --clear-cache
```

No ejecutes `eas build` desde `C:\DEV\ProyectoVinculo` (raíz); EAS empaquetaría todo el repo.

- **preview** → genera un **APK** (instalable directamente, sin Play Store).
- Te preguntará si quieres subir una keystore o que EAS la gestione: elige **Let EAS handle it** (recomendado).

El build se ejecuta en la **nube de Expo** (no en tu PC). Puedes seguir el progreso en:

- La terminal (enlace que muestra EAS)
- https://expo.dev → **Builds**

Cuando termine, podrás **descargar el APK** desde el enlace que te da EAS o desde expo.dev.

---

## Si el build falla con "tar exited with non-zero code: 2"

1. **Comprueba que estás en la carpeta mobile:**
   ```powershell
   cd C:\DEV\ProyectoVinculo\mobile
   pwd
   ```
   Debe mostrar una ruta que termine en `...\mobile` (o `.../mobile`).

2. **Lanza el build desde ahí con caché limpia:**
   ```powershell
   eas build --platform android --profile preview --clear-cache
   ```

3. **No ejecutes `eas build` desde la raíz del repo** (C:\DEV\ProyectoVinculo). EAS debe empaquetar solo la carpeta `mobile`.

---

## Paso 5: Instalar el APK en el móvil

1. Descarga el APK en el teléfono (desde el enlace de EAS o expo.dev).
2. Si Android pide "Permitir instalación de fuentes desconocidas", actívalo para el navegador o el gestor de archivos que uses.
3. Abre el APK e instala.
4. Abre **Vínculos**; la app usará la API en la nube (config en producción).

---

## Perfiles de build (`eas.json`)

| Perfil        | Uso                    | Android      |
|---------------|------------------------|--------------|
| **preview**   | Pruebas internas       | APK          |
| **production** | Publicar / distribuir | APK (o AAB para Play Store) |

Para generar un build de **producción** (mismo código, perfil distinto):

```powershell
eas build --platform android --profile production
```

---

## Límites gratuitos de EAS (Expo)

- Cuenta gratuita: un número limitado de builds al mes (suele bastar para desarrollo y pruebas).
- Más información: https://expo.dev/pricing

---

## Resumen de comandos

```powershell
cd C:\DEV\ProyectoVinculo\mobile
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

Cuando el build termine, descarga el APK e instálalo en el móvil.
