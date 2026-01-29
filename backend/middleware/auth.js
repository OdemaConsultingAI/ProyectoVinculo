const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

// Clave secreta para JWT desde variables de entorno
const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_super_segura_cambiar_en_produccion';

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  ADVERTENCIA: JWT_SECRET no está configurado en .env. Usando valor por defecto (NO SEGURO PARA PRODUCCIÓN)');
}

// Middleware para verificar token JWT
const authenticateToken = async (req, res, next) => {
  try {
    // Obtener token del header Authorization
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }

    // Verificar token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Buscar usuario en la base de datos
    const usuario = await Usuario.findById(decoded.userId);
    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    // Agregar información del usuario al request
    req.user = {
      id: usuario._id.toString(),
      email: usuario.email,
      nombre: usuario.nombre
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    console.error('Error en autenticación:', error);
    return res.status(500).json({ error: 'Error al verificar autenticación' });
  }
};

// Función para generar token JWT
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: '30d' } // Token válido por 30 días
  );
};

module.exports = {
  authenticateToken,
  generateToken,
  JWT_SECRET
};
