// Utilidades de validación

// Validar formato de teléfono
export const validatePhone = (phone) => {
  if (!phone || phone.trim() === '') {
    return { valid: false, error: 'El teléfono es requerido' };
  }
  
  // Limpiar teléfono (solo números y +)
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Validar que tenga al menos 7 dígitos (número mínimo razonable)
  const digitsOnly = cleaned.replace(/\+/g, '');
  if (digitsOnly.length < 7) {
    return { valid: false, error: 'El teléfono debe tener al menos 7 dígitos' };
  }
  
  if (digitsOnly.length > 15) {
    return { valid: false, error: 'El teléfono no puede tener más de 15 dígitos' };
  }
  
  return { valid: true };
};

// Validar formato de email
export const validateEmail = (email) => {
  if (!email || email.trim() === '') {
    return { valid: false, error: 'El email es requerido' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'El formato del email no es válido' };
  }
  
  return { valid: true };
};

// Validar contraseña
export const validatePassword = (password) => {
  if (!password || password.length === 0) {
    return { valid: false, error: 'La contraseña es requerida' };
  }
  
  if (password.length < 6) {
    return { valid: false, error: 'La contraseña debe tener al menos 6 caracteres' };
  }
  
  if (password.length > 128) {
    return { valid: false, error: 'La contraseña no puede tener más de 128 caracteres' };
  }
  
  return { valid: true };
};

// Validar fecha de cumpleaños
export const validateBirthday = (dia, mes, anio) => {
  if (!dia || !mes) {
    return { valid: false, error: 'Día y mes son requeridos' };
  }
  
  const diaNum = parseInt(dia);
  const mesNum = parseInt(mes);
  
  if (isNaN(diaNum) || diaNum < 1 || diaNum > 31) {
    return { valid: false, error: 'El día debe estar entre 1 y 31' };
  }
  
  if (isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
    return { valid: false, error: 'El mes debe estar entre 1 y 12' };
  }
  
  // Validar año si está presente
  if (anio) {
    const anioNum = parseInt(anio);
    const añoActual = new Date().getFullYear();
    
    if (isNaN(anioNum)) {
      return { valid: false, error: 'El año debe ser un número válido' };
    }
    
    if (anioNum < 1900 || anioNum > añoActual) {
      return { valid: false, error: `El año debe estar entre 1900 y ${añoActual}` };
    }
    
    // Validar que la fecha sea válida (ej: no 31 de febrero)
    const fecha = new Date(anioNum, mesNum - 1, diaNum);
    if (fecha.getDate() !== diaNum || fecha.getMonth() !== mesNum - 1) {
      return { valid: false, error: 'La fecha no es válida (ej: no existe 31 de febrero)' };
    }
  } else {
    // Si no hay año, validar que el día sea válido para el mes
    const diasPorMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (diaNum > diasPorMes[mesNum - 1]) {
      return { valid: false, error: `El día ${diaNum} no es válido para el mes ${mesNum}` };
    }
  }
  
  return { valid: true };
};

// Validar nombre
export const validateName = (name) => {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'El nombre es requerido' };
  }
  
  if (name.trim().length < 2) {
    return { valid: false, error: 'El nombre debe tener al menos 2 caracteres' };
  }
  
  if (name.length > 100) {
    return { valid: false, error: 'El nombre no puede tener más de 100 caracteres' };
  }
  
  return { valid: true };
};

// Sanitizar texto (remover caracteres peligrosos)
export const sanitizeText = (text) => {
  if (!text) return '';
  return text.trim().replace(/[<>]/g, '');
};
