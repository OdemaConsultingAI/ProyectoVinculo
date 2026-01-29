// Configuración por ambiente
// __DEV__ es una variable global de React Native que es true en desarrollo

// Usar Nube (Render) por defecto. Para desarrollo local: 'development' o 'auto'
const FORCE_ENV = 'production'; // 'production' | 'development' | 'auto'

const ENV = FORCE_ENV === 'auto' 
  ? (__DEV__ ? 'development' : 'production')
  : FORCE_ENV;

const CONFIG = {
  development: {
    API_BASE_URL: 'http://100.121.1.120:3000', // Tu IP de Tailscale local
  },
  production: {
    API_BASE_URL: 'https://proyectovinculo.onrender.com', // ✅ URL de producción en Render
  }
};

export const API_BASE_URL = CONFIG[ENV].API_BASE_URL;
export const ENVIRONMENT = ENV;

// Indicador para la UI: "PC" (local) o "Nube" (Render)
export const API_SOURCE_LABEL = ENV === 'production' ? 'Nube' : 'PC';
export const API_SOURCE_ICON = ENV === 'production' ? 'cloud' : 'desktop-outline';

// Log para debugging (solo en desarrollo)
if (__DEV__) {
  console.log('═══════════════════════════════════════');
  console.log('🔧 CONFIGURACIÓN DE API');
  console.log('═══════════════════════════════════════');
  console.log('📦 Ambiente:', ENV);
  console.log('🔗 API_BASE_URL:', API_BASE_URL);
  console.log('💻 Fuente:', API_SOURCE_LABEL, `(${API_SOURCE_ICON})`);
  console.log('═══════════════════════════════════════');
  console.log('💡 Si hay errores de conexión, revisa:');
  console.log('   1. Que el backend esté corriendo');
  console.log('   2. Que la IP/URL sea correcta');
  console.log('   3. SOLUCION_ERROR_CONEXION.md para más ayuda');
  console.log('═══════════════════════════════════════');
}
