// Middleware centralizado para manejo de errores

// Códigos de error estándar
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ERROR: 'DUPLICATE_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR'
};

// Mapeo de errores de MongoDB a códigos de error
const mapMongoError = (error) => {
  if (error.code === 11000) {
    return {
      code: ERROR_CODES.DUPLICATE_ERROR,
      message: 'El recurso ya existe',
      status: 409
    };
  }
  
  if (error.name === 'ValidationError') {
    return {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Error de validación',
      details: Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      })),
      status: 400
    };
  }

  if (error.name === 'CastError') {
    return {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'ID o formato inválido',
      status: 400
    };
  }

  return null;
};

// Middleware de manejo de errores
const errorHandler = (err, req, res, next) => {
  // Log estructurado del error
  const errorLog = {
    timestamp: new Date().toISOString(),
    message: err.message,
    code: err.code || 'UNKNOWN_ERROR',
    path: req.path,
    method: req.method,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    userId: req.user?.id || 'anonymous',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  };
  
  // Log en consola (estructurado)
  console.error('❌ Error en request:', JSON.stringify(errorLog, null, 2));

  // Verificar si es un error de MongoDB
  const mongoError = mapMongoError(err);
  if (mongoError) {
    return res.status(mongoError.status).json({
      error: mongoError.message,
      code: mongoError.code,
      ...(mongoError.details && { details: mongoError.details })
    });
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Token inválido',
      code: ERROR_CODES.AUTHENTICATION_ERROR
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expirado',
      code: ERROR_CODES.AUTHENTICATION_ERROR
    });
  }

  // Error personalizado con código
  if (err.code && err.status) {
    return res.status(err.status).json({
      error: err.message || 'Error del servidor',
      code: err.code,
      ...(err.details && { details: err.details })
    });
  }

  // Error genérico
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Error interno del servidor' 
      : err.message,
    code: ERROR_CODES.SERVER_ERROR,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

// Helper para crear errores personalizados
const createError = (message, code, status = 400, details = null) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details) {
    error.details = details;
  }
  return error;
};

module.exports = {
  errorHandler,
  createError,
  ERROR_CODES
};
