import { getAuthHeaders } from '../services/authService';
import { API_BASE_URL } from './config';

// URL de la API de contactos
export { API_BASE_URL };
export const API_URL = `${API_BASE_URL}/api/contacto`;

// Log para verificar la URL que se está usando (solo en desarrollo)
if (__DEV__) {
  console.log('🔗 API_URL configurada:', API_URL);
  console.log('🌐 API_BASE_URL:', API_BASE_URL);
  console.log('🔐 URL de registro:', `${API_BASE_URL}/api/auth/register`);
  console.log('🔐 URL de login:', `${API_BASE_URL}/api/auth/login`);
}

// Función helper para hacer fetch con autenticación y manejo de errores mejorado
export const fetchWithAuth = async (url, options = {}) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    // Si la respuesta no es OK, crear un error con la respuesta
    if (!response.ok) {
      let errorData;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json();
        } else {
          errorData = { error: `Error ${response.status}: ${response.statusText}` };
        }
      } catch (e) {
        errorData = { error: `Error ${response.status}: ${response.statusText}` };
      }

      const msg = errorData.error || errorData.message || 'Error en la solicitud';
      const error = new Error(typeof msg === 'string' ? msg : 'Error en la solicitud');
      error.response = {
        status: response.status,
        statusText: response.statusText,
        data: errorData
      };
      throw error;
    }

    return response;
  } catch (error) {
    // Si es un error de red, agregar información adicional
    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      error.isNetworkError = true;
    }
    throw error;
  }
};
