import { Alert } from 'react-native';

// Códigos de error del backend
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ERROR: 'DUPLICATE_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TOO_MANY_LOGIN_ATTEMPTS: 'TOO_MANY_LOGIN_ATTEMPTS',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS'
};

// Mensajes user-friendly en español
const ERROR_MESSAGES = {
  [ERROR_CODES.VALIDATION_ERROR]: 'Por favor verifica los datos ingresados',
  [ERROR_CODES.AUTHENTICATION_ERROR]: 'Credenciales inválidas. Por favor verifica tu email y contraseña',
  [ERROR_CODES.AUTHORIZATION_ERROR]: 'No tienes permisos para realizar esta acción',
  [ERROR_CODES.NOT_FOUND]: 'El recurso solicitado no fue encontrado',
  [ERROR_CODES.DUPLICATE_ERROR]: 'Este recurso ya existe',
  [ERROR_CODES.SERVER_ERROR]: 'Error del servidor. Por favor intenta más tarde',
  [ERROR_CODES.DATABASE_ERROR]: 'Error al procesar los datos. Por favor intenta más tarde',
  [ERROR_CODES.NETWORK_ERROR]: 'Error de conexión. Verifica tu internet e intenta nuevamente',
  [ERROR_CODES.TOO_MANY_LOGIN_ATTEMPTS]: 'Demasiados intentos de login. Por favor espera 15 minutos',
  [ERROR_CODES.TOO_MANY_REQUESTS]: 'Demasiadas solicitudes. Por favor espera un momento'
};

/**
 * Obtiene un mensaje user-friendly para un código de error
 */
export const getErrorMessage = (error) => {
  // Si es un objeto de error del backend
  if (error && error.code) {
    return ERROR_MESSAGES[error.code] || error.error || 'Ocurrió un error inesperado';
  }
  
  // Si es un string
  if (typeof error === 'string') {
    return error;
  }
  
  // Si es un objeto Error
  if (error instanceof Error) {
    // Verificar si es un error de red
    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      return ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR];
    }
    return error.message || 'Ocurrió un error inesperado';
  }
  
  // Si tiene una propiedad error
  if (error && error.error) {
    return error.error;
  }
  
  return 'Ocurrió un error inesperado';
};

/**
 * Maneja errores de respuesta HTTP
 */
export const handleApiError = async (response) => {
  try {
    const errorData = await response.json();
    
    // Si tiene código de error, usar el mensaje correspondiente
    if (errorData.code) {
      return {
        message: getErrorMessage(errorData),
        code: errorData.code,
        details: errorData.details || null
      };
    }
    
    // Si tiene mensaje de error
    if (errorData.error) {
      return {
        message: errorData.error,
        code: null,
        details: errorData.details || null
      };
    }
    
    return {
      message: 'Error desconocido',
      code: null,
      details: null
    };
  } catch (e) {
    // Si no se puede parsear el JSON
    return {
      message: `Error ${response.status}: ${response.statusText}`,
      code: null,
      details: null
    };
  }
};

/**
 * Maneja errores de red o fetch
 */
export const handleNetworkError = (error) => {
  if (error.message && (
    error.message.includes('Network request failed') ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('timeout')
  )) {
    return {
      message: ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR],
      code: ERROR_CODES.NETWORK_ERROR,
      details: null
    };
  }
  
  return {
    message: getErrorMessage(error),
    code: null,
    details: null
  };
};

/**
 * Muestra un alert con el error
 */
export const showErrorAlert = (error, title = 'Error') => {
  const message = getErrorMessage(error);
  Alert.alert(title, message);
};

/**
 * Muestra un alert con opción de acción
 */
export const showErrorAlertWithAction = (error, title = 'Error', onRetry = null) => {
  const message = getErrorMessage(error);
  
  const buttons = [
    { text: 'OK', style: 'default' }
  ];
  
  if (onRetry) {
    buttons.push({
      text: 'Reintentar',
      onPress: onRetry,
      style: 'default'
    });
  }
  
  Alert.alert(title, message, buttons);
};

/**
 * Maneja errores de autenticación (cierra sesión)
 */
export const handleAuthError = (error, onLogout) => {
  if (error && (
    error.code === ERROR_CODES.AUTHENTICATION_ERROR ||
    error.code === ERROR_CODES.AUTHORIZATION_ERROR
  )) {
    Alert.alert(
      'Sesión expirada',
      'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
      [
        {
          text: 'OK',
          onPress: () => {
            if (onLogout) {
              onLogout();
            }
          }
        }
      ]
    );
    return true;
  }
  return false;
};

/**
 * Log de errores para debugging (solo en desarrollo)
 */
export const logError = (error, context = '') => {
  if (__DEV__) {
    console.error(`❌ Error${context ? ` en ${context}` : ''}:`, error);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
};

export default {
  getErrorMessage,
  handleApiError,
  handleNetworkError,
  showErrorAlert,
  showErrorAlertWithAction,
  handleAuthError,
  logError,
  ERROR_CODES
};
