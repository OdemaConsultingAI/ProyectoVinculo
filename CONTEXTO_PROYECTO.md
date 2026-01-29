# Contexto del Proyecto Vínculo - CRM Personal

## Descripción General
Aplicación móvil React Native para gestión de relaciones personales (CRM familiar/amigos). El objetivo es ayudar a mantener contacto con personas cercanas que a veces se descuidan en el día a día.

## Estado Actual del Proyecto

### Arquitectura
- **Frontend**: React Native (Expo)
- **Backend**: Express.js + MongoDB (Mongoose)
- **Navegación**: React Navigation (Bottom Tabs)

### Pantallas Principales

#### 1. Vínculos (`VinculosScreen.js`)
- **Función**: Pantalla principal que muestra contactos en forma de burbujas en cuadrícula
- **Características**:
  - Burbujas que se degradan visualmente si no reciben atención
  - Icono animado de "regar" (gota de agua azul celeste) en burbujas que necesitan atención
  - Menú flotante de acciones al tocar una burbuja (WhatsApp, Llamar, Contacto, Regar)
  - Modo swipe para descubrir/importar contactos
  - Modal de edición de contacto completo
  - Sistema de interacciones (historial de comunicación)
  - Tareas como tipo especial de interacción con recordatorios
  - Fondo decorativo con círculos animados sutiles

#### 2. Notificaciones (`NotificacionesScreen.js`)
- **Función**: Centraliza todas las alertas y recordatorios
- **Tipos de notificaciones**:
  - Tareas pendientes (interacciones marcadas como tareas no completadas)
  - Contactos que necesitan "riego" (atención)
  - Sugerencias del sistema (contactos sin interacción reciente, cumpleaños próximos)
- **Características**:
  - Modo selección múltiple para eliminar notificaciones
  - Revisión diaria automática para limpiar notificaciones de "riego" antiguas
  - Persistencia local con AsyncStorage

#### 3. Configuración (`ConfiguracionScreen.js`)
- Pantalla básica de configuración (pendiente de desarrollo completo)

### Sistema de Colores Unificado

**Archivo**: `mobile/constants/colores.js`

**Paleta Principal**:
- **Fondos**: `#FAFBFC` (principal), `#F5F7FA` (secundario), `#F0F2F5` (terciario)
- **Textos**: `#2C3E50` (oscuro), `#5A6C7D` (medio), `#8B95A5` (suave)
- **Agua (Gota)**: `#4FC3F7` (azul celeste brillante) - Color principal para iconos de regar
- **Estados**:
  - Activo: `#66BB6A` (verde suave)
  - Atención: `#FFA726` (naranja suave)
  - Urgente: `#EF5350` (rojo suave)

### Modelo de Datos

#### Contacto (Backend: `models/Contacto.js`)
```javascript
{
  nombre: String,
  telefono: String,
  foto: String,
  frecuencia: String, // 'Cada 2 días', 'Semanal', 'Mensual', etc.
  fechaNacimiento: String, // Formato DD/MM/YYYY
  prioridad: String, // '💖 Alta', '✨ Media', '💤 Baja'
  clasificacion: String, // Clasificación tipo CRM familiar
  interacciones: [{
    fechaHora: Date,
    descripcion: String,
    esTarea: Boolean,
    fechaHoraEjecucion: Date, // Solo si esTarea = true
    clasificacion: String, // Solo si esTarea = true
    completada: Boolean
  }],
  ultimaInteraccion: Date,
  fechaCreacion: Date
}
```

### Funcionalidades Clave

#### Sistema de Degradación
- Calcula el nivel de degradación basado en:
  - Frecuencia de riego configurada
  - Última interacción registrada
  - Tiempo transcurrido desde última interacción
- Visual: burbujas más pequeñas, pálidas y con menor saturación cuando necesitan atención

#### Sistema de Interacciones
- Historial de todas las comunicaciones con cada contacto
- Opción de marcar como "tarea" con:
  - Fecha/hora de ejecución
  - Clasificación (tipo CRM familiar)
  - Recordatorios
- Si no es tarea: solo fecha/hora y descripción

#### Frecuencias de Riego
- Cada 2 días, Cada 3 días, Semanal, Cada 15 días
- Mensual, Cada 2 meses, Cada 3 meses, Cada 6 meses
- Anual
- Cumpleaños (requiere fecha de nacimiento)

### Persistencia Local
- `AsyncStorage` para:
  - Notificaciones eliminadas por el usuario
  - Timestamp de última revisión diaria de "riego"

### API Endpoints
- Base URL: `http://192.168.0.6:3000/api/contacto`
- Operaciones CRUD estándar para contactos

### Dependencias Principales
- `@expo/vector-icons` (Ionicons)
- `expo-contacts` (lectura de contactos del teléfono)
- `expo-image-picker` (selección de fotos)
- `@react-native-community/datetimepicker` (selectores de fecha/hora)
- `@react-native-async-storage/async-storage` (almacenamiento local)
- `react-native-gesture-handler` (gestos y animaciones)

### Características de UI/UX

#### Animaciones
- Burbujas con movimiento sutil
- Icono de "regar" con animación de subir/bajar
- Círculos decorativos en fondo con animación de escala y opacidad
- Botón flotante de swipe con animación de pulso

#### Modales
- Modal de edición de contacto (completo)
- Modal de interacciones (historial y creación)
- Modal de importación de contactos (en modo swipe)
- Menú flotante de acciones (WhatsApp, Llamar, Contacto, Regar)

#### Gestos
- Swipe de tarjetas en modo descubrimiento
- Pull-to-refresh en listas

### Últimos Cambios Realizados

1. **Unificación de Paleta de Colores**:
   - Creado archivo centralizado `mobile/constants/colores.js`
   - Reemplazados todos los colores hardcodeados
   - Gota de agua ahora usa azul celeste (`#4FC3F7`)
   - Tema claro y uniforme en toda la app

2. **Refinamiento de Fondo Decorativo**:
   - Círculos más sutiles (opacidad reducida)
   - Tamaños ajustados para look más limpio
   - Color único basado en azul celeste

3. **Sistema de Notificaciones**:
   - Renombrado de "Pendientes" a "Notificaciones"
   - Agregado sistema de revisión diaria automática
   - Funcionalidad de eliminación múltiple

4. **Sistema de Interacciones**:
   - Renombrado de "Tareas" a "Interacciones"
   - Interacciones pueden ser tareas opcionales
   - Historial completo de comunicación

### Estructura de Archivos Clave

```
mobile/
├── App.js (Navegación principal)
├── constants/
│   └── colores.js (Paleta unificada)
└── screens/
    ├── VinculosScreen.js (Pantalla principal)
    ├── NotificacionesScreen.js (Notificaciones)
    └── ConfiguracionScreen.js (Configuración)

backend/
├── models/
│   └── Contacto.js (Modelo Mongoose)
└── server.js (Servidor Express)
```

### Notas Técnicas

- **Degradación Visual**: Se calcula dinámicamente basado en frecuencia y tiempo transcurrido
- **Posicionamiento Dinámico**: El menú flotante de acciones se ajusta automáticamente para permanecer en pantalla
- **Persistencia**: Notificaciones eliminadas se guardan localmente para no reaparecer
- **Validaciones**: Fecha de cumpleaños requerida cuando frecuencia es "Cumpleaños"

### Próximos Pasos Sugeridos

1. Completar pantalla de Configuración
2. Agregar más tipos de notificaciones del sistema
3. Implementar recordatorios push para tareas
4. Mejorar visualización de estadísticas de interacciones
5. Agregar exportación/importación de datos

---

**Última actualización**: Enero 2026
**Estado**: Funcional con paleta de colores unificada y sistema de interacciones completo
