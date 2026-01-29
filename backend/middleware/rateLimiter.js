const rateLimit = require('express-rate-limit');

// Rate limiter para login (más restrictivo)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por IP
  message: {
    error: 'Demasiados intentos de login. Por favor intenta nuevamente en 15 minutos.',
    code: 'TOO_MANY_LOGIN_ATTEMPTS'
  },
  standardHeaders: true, // Retorna rate limit info en headers
  legacyHeaders: false,
  skipSuccessfulRequests: false // Contar TODOS los intentos (más seguro contra fuerza bruta)
});

// Rate limiter para registro (muy restrictivo)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // 3 intentos por IP por hora
  message: {
    error: 'Demasiados intentos de registro. Por favor intenta nuevamente en 1 hora.',
    code: 'TOO_MANY_REGISTER_ATTEMPTS'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter para cambio de contraseña
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por IP
  message: {
    error: 'Demasiados intentos de cambio de contraseña. Por favor intenta nuevamente en 15 minutos.',
    code: 'TOO_MANY_PASSWORD_CHANGE_ATTEMPTS'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter general para API (menos restrictivo)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // 100 requests por minuto por IP
  message: {
    error: 'Demasiadas solicitudes. Por favor intenta nuevamente en un momento.',
    code: 'TOO_MANY_REQUESTS'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  loginLimiter,
  registerLimiter,
  changePasswordLimiter,
  apiLimiter
};
