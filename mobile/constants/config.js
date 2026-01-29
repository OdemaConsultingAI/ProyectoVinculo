// Configuración por ambiente
// __DEV__ es una variable global de React Native que es true en desarrollo

const ENV = __DEV__ ? 'development' : 'production';

const CONFIG = {
  development: {
    API_BASE_URL: 'http://100.121.1.120:3000', // Tu IP de Tailscale local
  },
  production: {
    API_BASE_URL: 'https://tu-app.onrender.com', // ⚠️ CAMBIAR con tu URL de Render cuando la tengas
  }
};

export const API_BASE_URL = CONFIG[ENV].API_BASE_URL;
export const ENVIRONMENT = ENV;

// Log para debugging (solo en desarrollo)
if (__DEV__) {
  console.log('🔧 Ambiente:', ENV);
  console.log('🔗 API_BASE_URL:', API_BASE_URL);
}
