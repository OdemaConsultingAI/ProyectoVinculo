# Retomar la creación del APK

Pasos para volver a intentar el build del APK con EAS (después del fallo en "Prepare project").

---

## Qué está listo

- **`mobile/eas.json`**: perfil `preview` con `buildType: "apk"` y `appVersionSource: "local"`.
- **Script `eas-build-solo-mobile.ps1`**: empaqueta solo la carpeta `mobile` (sin backend ni raíz del repo) y lanza el build desde una carpeta temporal. Así se evitan errores de monorepo en EAS.
- **Dependencias alineadas con Expo 54:** `react-native-reanimated` ~4.1.1, `react-native-worklets` ~0.7.0, y `newArchEnabled: true` en `app.json` (ruta oficial recomendada por Expo).
- **Nombre e icono:** En `app.json` el nombre de la app es **"Vinculo"** (sin tilde) y el icono usa `./assets/icon.png` y `./assets/adaptive-icon.png`. El script copia la carpeta `assets`, así que el próximo build instalará la app con ese nombre e icono.

---

## Opción A: Build con el script (recomendada)

Usa el script para que EAS solo reciba la app, no todo el repo. Solo hay que ejecutarlo desde la raíz del proyecto.

**Requisitos previos:** Git instalado, Node/npm, y EAS CLI (`npm i -g eas-cli`). Si falta algo, el script lo indicará.

**0. (Solo si cambiaste dependencias)** En `mobile` ejecuta `npm install` para que `package-lock.json` esté alineado con `package.json`. Así el build usará Reanimated 4 y worklets.

**1. Abrir PowerShell y ir a la raíz del proyecto:**

```powershell
cd C:\DEV\ProyectoVinculo
```

**2. Ejecutar el script:**

```powershell
.\eas-build-solo-mobile.ps1
```

El script hace todo lo necesario; solo hay que ejecutarlo:
- Crea una carpeta temporal.
- Copia solo el contenido de `mobile` (sin `node_modules`, `.expo`, etc.).
- Inicializa Git y crea un commit (EAS lo requiere).
- Ejecuta `npm install` para instalar dependencias y resolver plugins.
- Ejecuta `eas build --platform android --profile preview --clear-cache`.
- EAS sube esa copia y compila el APK.

**4. Cuando termine:** en [expo.dev](https://expo.dev) → tu cuenta → proyecto **vinculos-app** → **Builds** verás el APK listo para descargar.

---

## Opción B: Build desde la carpeta `mobile`

Si prefieres no usar el script:

```powershell
cd C:\DEV\ProyectoVinculo\mobile
eas build --platform android --profile preview --clear-cache
```

Si vuelve a fallar en "Prepare project", revisa los **logs** del build en expo.dev (enlace que muestra EAS) y usa la **Opción A** con el script.

---

## Si el build vuelve a fallar

1. **Ver el error real:** EAS solo muestra "Gradle build failed with unknown error". Para ver el motivo:
   - Abre el **enlace del build** que EAS imprime en la consola (o en [expo.dev](https://expo.dev) → tu proyecto → **Builds** → último build).
   - Entra en **Logs** y localiza la fase **"Run gradlew"** (o **"Prepare project"**).
   - Copia el **bloque de error** (líneas con `FAILURE`, `CMake Error`, `Execution failed`, etc.); ese es el mensaje que hay que resolver.
2. **Limpiar caché:** El script ya usa `--clear-cache`. Si sospechas de caché en la nube: en expo.dev → proyecto → **Settings** (o **Build settings**) comprueba si hay opción de "Clear build cache" o similar y úsala antes de volver a lanzar.
3. Si aparece algo con `backend/`, rutas o permisos → monorepo; usa **Opción A** (script).
4. Si el error es de Node, un plugin o dependencias, busca el mensaje exacto o compártelo para afinar el siguiente paso.

### Si vuelve el error de CMake con react-native-reanimated

Si en los **logs** de "Run gradlew" ves:

- `Target "reanimated" links to target "ReactAndroid::folly_runtime" but the target was not found`
- O similares con `ReactAndroid::glog`, `reactnativejni`, `fabricjni`, etc.

Ahora el proyecto usa la ruta oficial de Expo 54 (Reanimated ~4.1.1 + worklets + Nueva Arquitectura). Si ese error sigue apareciendo, se puede **volver atrás** a Reanimated 3 y desactivar la Nueva Arquitectura: en `mobile/package.json` poner `"react-native-reanimated": "~3.10.1"`, quitar `"react-native-worklets"`, y en `mobile/app.json` poner `"newArchEnabled": false`. Luego borrar `package-lock.json`, ejecutar `npm install` en `mobile` y volver a lanzar el build con el script.

### Si el APK se instala sin nombre ni icono

El nombre visible ("Vínculo") y el icono vienen de `mobile/app.json` (`expo.name`, `expo.icon`, `android.adaptiveIcon`) y de la carpeta `mobile/assets/`. Si el APK se instala pero no muestra nombre ni icono:

1. **Comprueba** que en `mobile/app.json` estén `"name": "Vínculo"`, `"icon": "./assets/icon.png"` y `android.adaptiveIcon.foregroundImage` (y `android.icon`).
2. **Comprueba** que existan `mobile/assets/icon.png` y `mobile/assets/adaptive-icon.png` (recomendado 1024×1024 px).
3. **Vuelve a generar el APK** con el script (`.\eas-build-solo-mobile.ps1`), que ya usa `--clear-cache`, para que EAS no reutilice un prebuild antiguo sin nombre/icono.
4. Si usas la Opción B (build desde `mobile`), ejecuta siempre con `--clear-cache`.

---

## Descargar e instalar el APK

Cuando el build termine en verde:

1. Entra en [expo.dev](https://expo.dev) → tu proyecto → **Builds**.
2. Abre el último build de Android (preview).
3. Descarga el APK desde el enlace que aparece.
4. En el móvil Android: activa **"Instalar desde fuentes desconocidas"** (o "Instalar apps desconocidas") para el navegador o la app desde la que descargues, e instala el APK.
Y