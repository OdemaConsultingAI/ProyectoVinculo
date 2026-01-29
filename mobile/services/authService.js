import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/api';

const TOKEN_KEY = '@vinculo_token';
const USER_KEY = '@vinculo_user';

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
      const processedError = processError({
        response: { status: response.status, data }
      });
      return { success: false, error: processedError.message };
    }

    // Guardar token y usuario
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.usuario));

    console.log('✅ Usuario registrado exitosamente');
    return { success: true, token: data.token, usuario: data.usuario };
  } catch (error) {
    const processedError = processError(error);
    console.error('❌ Error en registro:', processedError);
    console.error('❌ Stack:', error.stack);
    
    // Mensajes de error más específicos
    if (error.message === 'Network request failed') {
      return { 
        success: false, 
        error: `No se pudo conectar al servidor. Verifica que:\n1. El servidor esté corriendo\n2. La IP sea correcta: ${API_BASE_URL}\n3. Tengas conexión a internet` 
      };
    }
    
    return { success: false, error: `Error de conexión: ${error.message}` };
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
      console.error('❌ Error en respuesta:', data);
      return { success: false, error: data.error || 'Credenciales inválidas' };
    }

    // Guardar token y usuario
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.usuario));

    console.log('✅ Login exitoso');
    return { success: true, token: data.token, usuario: data.usuario };
  } catch (error) {
    const processedError = processError(error);
    return { success: false, error: processedError.message };
  }
};

// Función para cerrar sesión
export const logout = async () => {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
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
      return false;
    }

    // Verificar que el token sea válido haciendo una petición al servidor
    const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error verificando autenticación:', error);
    return false;
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
      return { success: false, error: data.error || 'Error al cambiar contraseña' };
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
