const { body, param, validationResult } = require('express-validator');

// Middleware para manejar errores de validación
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Error de validación',
      details: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// Validaciones para registro de usuario
const validateRegister = [
  body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Debe ser un email válido')
    .normalizeEmail(),
  body('password')
    .trim()
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una letra y un número'),
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('El nombre solo puede contener letras y espacios'),
  handleValidationErrors
];

// Validaciones para login
const validateLogin = [
  body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Debe ser un email válido')
    .normalizeEmail(),
  body('password')
    .trim()
    .notEmpty()
    .withMessage('La contraseña es requerida'),
  handleValidationErrors
];

// Validaciones para cambio de contraseña
const validateChangePassword = [
  body('currentPassword')
    .trim()
    .notEmpty()
    .withMessage('La contraseña actual es requerida'),
  body('newPassword')
    .trim()
    .isLength({ min: 6 })
    .withMessage('La nueva contraseña debe tener al menos 6 caracteres')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('La nueva contraseña debe contener al menos una letra y un número'),
  handleValidationErrors
];

// Validaciones para crear/actualizar contacto
const validateContact = [
  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('El nombre debe tener entre 1 y 100 caracteres'),
  body('telefono')
    .optional()
    .trim()
    .matches(/^[\d\s\-\+\(\)]+$/)
    .withMessage('El teléfono contiene caracteres inválidos')
    .isLength({ min: 7, max: 20 })
    .withMessage('El teléfono debe tener entre 7 y 20 caracteres'),
  body('email')
    .optional()
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Debe ser un email válido')
    .normalizeEmail(),
  body('fechaNacimiento')
    .optional()
    .custom((value) => {
      if (!value) return true;
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Fecha de nacimiento inválida');
      }
      if (date > new Date()) {
        throw new Error('La fecha de nacimiento no puede ser futura');
      }
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 150);
      if (date < minDate) {
        throw new Error('La fecha de nacimiento no puede ser tan antigua');
      }
      return true;
    }),
  body('frecuenciaRiego')
    .optional()
    .isIn(['diario', 'cada 2 días', 'cada 3 días', 'semanal', 'cada 15 días', 'mensual', 'cada 3 meses', 'semestral', 'anual'])
    .withMessage('Frecuencia de riego inválida'),
  body('notas')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Las notas no pueden exceder 2000 caracteres'),
  handleValidationErrors
];

// Validaciones para tareas
const validateTask = [
  body('tareas.*.descripcion')
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('La descripción de la tarea debe tener entre 1 y 500 caracteres'),
  body('tareas.*.fechaHoraEjecucion')
    .optional()
    .custom((value) => {
      if (!value) return true;
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Fecha de ejecución inválida');
      }
      return true;
    }),
  body('tareas.*.clasificacion')
    .optional()
    .isIn(['urgente', 'alta', 'media', 'baja'])
    .withMessage('Clasificación inválida'),
  handleValidationErrors
];

// Validaciones para interacciones
const validateInteraction = [
  body('interacciones.*.texto')
    .optional()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('El texto de la interacción debe tener entre 1 y 2000 caracteres'),
  body('interacciones.*.fechaHora')
    .optional()
    .custom((value) => {
      if (!value) return true;
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Fecha de interacción inválida');
      }
      return true;
    }),
  handleValidationErrors
];

// Validación de ObjectId de MongoDB
const validateObjectId = [
  param('id')
    .matches(/^[0-9a-fA-F]{24}$/)
    .withMessage('ID inválido'),
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateContact,
  validateTask,
  validateInteraction,
  validateObjectId,
  handleValidationErrors
};
