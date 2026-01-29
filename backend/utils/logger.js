// Logger estructurado simple (sin dependencias externas para MVP)
// En producción se puede reemplazar con Winston o similar

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

const log = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data
  };

  // En desarrollo, mostrar logs más detallados
  if (process.env.NODE_ENV !== 'production') {
    const emoji = {
      ERROR: '❌',
      WARN: '⚠️',
      INFO: 'ℹ️',
      DEBUG: '🔍'
    };
    console.log(`${emoji[level]} [${level}] ${message}`, data && Object.keys(data).length > 0 ? data : '');
  } else {
    // En producción, solo JSON estructurado
    console.log(JSON.stringify(logEntry));
  }
};

const logger = {
  error: (message, data) => log(LOG_LEVELS.ERROR, message, data),
  warn: (message, data) => log(LOG_LEVELS.WARN, message, data),
  info: (message, data) => log(LOG_LEVELS.INFO, message, data),
  debug: (message, data) => log(LOG_LEVELS.DEBUG, message, data)
};

module.exports = logger;
