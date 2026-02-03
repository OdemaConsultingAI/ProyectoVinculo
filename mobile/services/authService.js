import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/config';

const TOKEN_KEY = '@vinculo_token';
const USER_KEY = '@vinculo_user';

// Claves que deben limpiarse al cerrar sesión (evitar confusión con otro usuario en el mismo dispositivo)
const KEYS_TO_CLEAR_ON_LOGOUT = [
  TOKEN_KEY,
  USER_KEY,
  '@vinculo_bienvenida_no_mostrar',
  '@vinculos_expo_push_token',
  '@notificaciones_vistas',
  '@notificaciones_eliminadas',
  '@ultima_revision_riego',
];

// Mensaje claro a partir de la respuesta de validación del backend (400 con details)
const messageFromValidation = (data) => {
  if (!data || !Array.isArray(data.details) || data.details.length === 0) {
    return data?.error || null;
  }
  const messages = data.details.map((d) => d.message).filter(Boolean);
  return messages.length ? messages.join(' ') : data.error || null;
};

// Función para registrar un nuevo usuario
export const register = async (email, password, nombre) => {
  try {
    const url = `${API_BASE_URL}/api/auth/register`;
    console.log('📡 Intentando registrar usuario en:', url);
    console.log('📧 Email:', email);
    console.log('👤 Nombre:', nombre);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, nombre }),
    });

    console.log('📡 Respuesta recibida, status:', response.status);

    // Intentar parsear JSON solo si hay contenido
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error('❌ Respuesta no es JSON:', text);
      return { success: false, error: `Error del servidor: ${response.status}` };
    }

    if (!response.ok) {
      // 400 = validación (password, email, nombre): mostrar mensajes concretos de details
      const message = messageFromValidation(data) || data?.error || `Error ${response.status}`;
      return { success: false, error: message };
    }

    // Guardar token y usuario
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.usuario));

    console.log('✅ Usuario registrado exitosamente');
    return { success: true, token: data.token, usuario: data.usuario };
  } catch (error) {
    console.error('❌ Error en registro:', error?.message || error);
    if (error.message === 'Network request failed') {
      return { 
        success: false, 
        error: `No se pudo conectar al servidor. Verifica que:\n1. El servidor esté corriendo\n2. La IP sea correcta: ${API_BASE_URL}\n3. Tengas conexión a internet` 
      };
    }
    return { success: false, error: error?.message || `Error de conexión` };
  }
};

// Función para iniciar sesión
export const login = async (email, password) => {
  try {
    const url = `${API_BASE_URL}/api/auth/login`;
    console.log('📡 Intentando login en:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    console.log('📡 Respuesta recibida, status:', response.status);

    // Intentar parsear JSON solo si hay contenido
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      console.error('❌ Respuesta no es JSON:', text);
      return { success: false, error: `Error del servidor: ${response.status}` };
    }

    if (!response.ok) {
      const message = messageFromValidation(data) || data?.error || 'Credenciales inválidas';
      return { success: false, error: message };
    }

    // Guardar token y usuario
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.usuario));

    console.log('✅ Login exitoso');
    return { success: true, token: data.token, usuario: data.usuario };
  } catch (error) {
    return { success: false, error: error?.message || 'Error de conexión' };
  }
};

// Función para cerrar sesión: quitar token, usuario y claves locales. La caché de contactos/sync debe limpiarse con clearUserDataOnLogout() desde quien llame a logout.
export const logout = async () => {
  try {
    await AsyncStorage.multiRemove(KEYS_TO_CLEAR_ON_LOGOUT);
    return { success: true };
  } catch (error) {
    console.error('Error en logout:', error);
    return { success: false, error: 'Error al cerrar sesión' };
  }
};

// Función para obtener el token almacenado
export const getToken = async () => {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    return token;
  } catch (error) {
    console.error('Error obteniendo token:', error);
    return null;
  }
};

// Función para obtener el usuario almacenado
export const getUser = async () => {
  try {
    const userJson = await AsyncStorage.getItem(USER_KEY);
    if (userJson) {
      return JSON.parse(userJson);
    }
    return null;
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    return null;
  }
};

// Función para obtener headers con autenticación
export const getAuthHeaders = async () => {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

// Función para verificar si el usuario está autenticado
export const isAuthenticated = async () => {
  try {
    const token = await getToken();
    if (!token) {
      console.log('🔐 No hay token almacenado');
      return false;
    }

    // Verificar que el token sea válido haciendo una petición al servidor
    console.log('🔐 Verificando token en:', `${API_BASE_URL}/api/auth/verify`);
    const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.ok) {
      console.log('✅ Token válido');
      return true;
    } else {
      console.log('❌ Token inválido o expirado');
      return false;
    }
  } catch (error) {
    // Si es error de red, simplemente retornar false (mostrará login)
    // No bloquear la app por problemas de conexión
    if (error.name === 'AbortError' || error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      console.warn('⚠️ No se pudo verificar autenticación (sin conexión o servidor no disponible):', API_BASE_URL);
      console.warn('💡 La app mostrará la pantalla de login');
    } else {
      console.error('❌ Error verificando autenticación:', error.message);
    }
    return false; // Retornar false para mostrar login
  }
};

// Función para verificar y refrescar el token si es necesario
export const verifyToken = async () => {
  try {
    const token = await getToken();
    if (!token) {
      return { valid: false };
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return { valid: true, usuario: data.usuario };
    } else {
      // Token inválido, limpiar almacenamiento
      await logout();
      return { valid: false };
    }
  } catch (error) {
    console.error('Error verificando token:', error);
    return { valid: false };
  }
};

// Función para cambiar contraseña
export const changePassword = async (currentPassword, newPassword) => {
  try {
    const url = `${API_BASE_URL}/api/auth/change-password`;
    const headers = await getAuthHeaders();
    
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await response.json();

    if (!response.ok) {
      const message = messageFromValidation(data) || data?.error || 'Error al cambiar contraseña';
      return { success: false, error: message };
    }

    return { success: true, message: data.message };
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    return { success: false, error: 'Error de conexión. Verifica tu internet.' };
  }
};

// Función para actualizar plan a Premium
export const upgradeToPremium = async () => {
  try {
    const url = `${API_BASE_URL}/api/auth/upgrade-plan`;
    const headers = await getAuthHeaders();
    
    const response = await fetch(url, {
      method: 'PUT',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Error al actualizar plan' };
    }

    // Actualizar usuario en AsyncStorage
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.usuario));

    return { success: true, usuario: data.usuario };
  } catch (error) {
    console.error('Error actualizando plan:', error);
    return { success: false, error: 'Error de conexión. Verifica tu internet.' };
  }
};

// Función para obtener información actualizada del usuario
export const getCurrentUser = async () => {
  try {
    const url = `${API_BASE_URL}/api/auth/me`;
    const headers = await getAuthHeaders();
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error };
    }

    // Actualizar usuario en AsyncStorage
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.usuario));

    return { success: true, usuario: data.usuario };
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    return { success: false, error: 'Error de conexión' };
  }
};
