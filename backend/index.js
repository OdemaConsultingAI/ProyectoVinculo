require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const Contacto = require('./models/Contacto');
const Usuario = require('./models/Usuario');
const { authenticateToken, generateToken } = require('./middleware/auth');
const { errorHandler, createError, ERROR_CODES } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { sanitizeInputs, normalizeEmail } = require('./middleware/sanitize');
const {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateContact,
  validateObjectId
} = require('./middleware/validation');
const {
  loginLimiter,
  registerLimiter,
  changePasswordLimiter,
  apiLimiter
} = require('./middleware/rateLimiter');

const app = express();

// Security headers
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['https://tu-dominio.com']
    : '*', // En desarrollo permitir todos
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Body parser
app.use(express.json({ limit: '10mb' })); // Limitar tamaño de body
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitización global
app.use(sanitizeInputs);

// Rate limiting general
app.use('/api/', apiLimiter);

// Configuración de MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinculosDB';
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅ Conexión a MongoDB exitosa");
    console.log("📊 Estado de conexión:", mongoose.connection.readyState === 1 ? "Conectado" : "Desconectado");
    console.log("🗄️  Base de datos:", mongoose.connection.name);
    console.log("🌐 Host:", mongoose.connection.host);
  })
  .catch(err => {
    console.error("❌ Error de MongoDB:", err);
    console.error("💡 Verifica que MONGODB_URI esté correctamente configurado en el archivo .env");
  });

mongoose.connection.on('connected', () => {
  console.log('🔗 Mongoose conectado a MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Error de conexión Mongoose:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose desconectado');
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡Hola! El servidor de Vínculo está VIVO y funcionando.');
});

// Health check
app.get('/api/health', async (req, res, next) => {
  try {
    const estado = mongoose.connection.readyState;
    const estados = ['desconectado', 'conectando', 'conectado', 'desconectando'];
    res.json({
      estado: estados[estado] || 'desconocido',
      readyState: estado,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// RUTAS DE AUTENTICACIÓN
// ============================================

// POST - Registro de nuevo usuario
app.post('/api/auth/register', registerLimiter, validateRegister, normalizeEmail, async (req, res, next) => {
  try {
    const { email, password, nombre } = req.body;

    // Verificar si el usuario ya existe
    const usuarioExistente = await Usuario.findOne({ email: email.toLowerCase() });
    if (usuarioExistente) {
      return next(createError('Este email ya está registrado', ERROR_CODES.DUPLICATE_ERROR, 409));
    }

    // Crear nuevo usuario
    const nuevoUsuario = new Usuario({
      email: email.toLowerCase(),
      password,
      nombre
    });

    await nuevoUsuario.save();

    // Generar token
    const token = generateToken(nuevoUsuario._id);

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      usuario: {
        id: nuevoUsuario._id,
        email: nuevoUsuario.email,
        nombre: nuevoUsuario.nombre,
        plan: nuevoUsuario.plan || 'Free'
      }
    });
  } catch (error) {
    next(error); // Pasar error al errorHandler
  }
});

// POST - Login de usuario
app.post('/api/auth/login', loginLimiter, validateLogin, normalizeEmail, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Normalizar email (lowercase y trim)
    const emailNormalizado = email.toLowerCase().trim();
    
    // Buscar usuario
    const usuario = await Usuario.findOne({ email: emailNormalizado });
    if (!usuario) {
      console.log('❌ Usuario no encontrado:', emailNormalizado);
      return next(createError('Credenciales inválidas', ERROR_CODES.AUTHENTICATION_ERROR, 401));
    }

    // Verificar contraseña (trim para eliminar espacios al inicio/final)
    const passwordTrimmed = password.trim();
    const passwordValido = await usuario.comparePassword(passwordTrimmed);
    
    if (!passwordValido) {
      console.log('❌ Contraseña incorrecta para usuario:', emailNormalizado);
      return next(createError('Credenciales inválidas', ERROR_CODES.AUTHENTICATION_ERROR, 401));
    }

    console.log('✅ Login exitoso para usuario:', usuario.email);

    // Generar token
    const token = generateToken(usuario._id);

    res.json({
      message: 'Login exitoso',
      token,
      usuario: {
        id: usuario._id,
        email: usuario.email,
        nombre: usuario.nombre,
        plan: usuario.plan || 'Free'
      }
    });
  } catch (error) {
    console.error('Error en login', { error: error.message, email: req.body.email });
    next(error); // Pasar al error handler
  }
});

// GET - Verificar token (opcional, para validar sesión)
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      usuario: {
        id: usuario._id,
        email: usuario.email,
        nombre: usuario.nombre,
        plan: usuario.plan || 'Free'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RUTAS DE USUARIO (requieren autenticación)
// ============================================

// PUT - Cambiar contraseña
app.put('/api/auth/change-password', authenticateToken, changePasswordLimiter, validateChangePassword, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return next(createError('Usuario no encontrado', ERROR_CODES.NOT_FOUND, 404));
    }

    // Verificar contraseña actual
    const passwordValido = await usuario.comparePassword(currentPassword);
    if (!passwordValido) {
      return next(createError('Contraseña actual incorrecta', ERROR_CODES.AUTHENTICATION_ERROR, 401));
    }

    // Actualizar contraseña
    usuario.password = newPassword;
    await usuario.save();

    console.log('Contraseña actualizada', { userId: usuario._id });
    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    console.error('Error cambiando contraseña', { error: error.message, userId: req.user.id });
    next(error);
  }
});

// PUT - Actualizar plan (solo para actualizar a Premium)
app.put('/api/auth/upgrade-plan', authenticateToken, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Por ahora solo permitimos actualizar a Premium
    // En el futuro aquí se integraría con un sistema de pagos
    usuario.plan = 'Premium';
    await usuario.save();

    res.json({
      message: 'Plan actualizado a Premium exitosamente',
      usuario: {
        id: usuario._id,
        email: usuario.email,
        nombre: usuario.nombre,
        plan: usuario.plan
      }
    });
  } catch (error) {
    console.error('Error actualizando plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET - Obtener información del usuario actual
app.get('/api/auth/me', authenticateToken, async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return next(createError('Usuario no encontrado', ERROR_CODES.NOT_FOUND, 404));
    }

    res.json({
      usuario: {
        id: usuario._id,
        email: usuario.email,
        nombre: usuario.nombre,
        plan: usuario.plan || 'Free'
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// RUTAS DE CONTACTOS (requieren autenticación)
// ============================================

// GET - Obtener todos los contactos del usuario autenticado
app.get('/api/contacto', authenticateToken, async (req, res) => {
  try {
    console.log('📋 GET /api/contacto - Usuario ID:', req.user.id);
    const contactos = await Contacto.find({ usuarioId: req.user.id });
    console.log(`✅ Contactos encontrados para usuario ${req.user.id}: ${contactos.length}`);
    res.json(contactos);
  } catch (error) {
    console.error('❌ Error obteniendo contactos:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Crear nuevo contacto
app.post('/api/contacto', authenticateToken, validateContact, async (req, res, next) => {
  try {
    const nuevoContacto = new Contacto({
      ...req.body,
      usuarioId: req.user.id // Asociar contacto con el usuario autenticado
    });
    const guardado = await nuevoContacto.save();
    console.log('Contacto creado', { userId: req.user.id, contactoId: guardado._id });
    res.status(201).json(guardado);
  } catch (error) {
    console.error('Error creando contacto', { error: error.message, userId: req.user.id });
    next(error);
  }
});

// PUT - Actualizar contacto
app.put('/api/contacto/:id', authenticateToken, async (req, res) => {
  try {
    console.log('📝 PUT /api/contacto/:id - ID:', req.params.id);
    console.log('📦 Body recibido:', JSON.stringify(req.body, null, 2));
    
    // Buscar el contacto primero y verificar que pertenezca al usuario
    const contacto = await Contacto.findOne({ 
      _id: req.params.id,
      usuarioId: req.user.id 
    });
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    
    // Si se está actualizando el array de tareas, procesarlo especialmente
    if (req.body.tareas !== undefined && Array.isArray(req.body.tareas)) {
      console.log('📋 Actualizando array de tareas, cantidad recibida:', req.body.tareas.length);
      
      // Convertir fechas de string a Date
      const tareasProcesadas = req.body.tareas.map(tarea => {
        const tareaActualizada = { ...tarea };
        if (tarea.fechaHoraCreacion) {
          tareaActualizada.fechaHoraCreacion = typeof tarea.fechaHoraCreacion === 'string' 
            ? new Date(tarea.fechaHoraCreacion) 
            : tarea.fechaHoraCreacion;
        }
        if (tarea.fechaHoraEjecucion) {
          tareaActualizada.fechaHoraEjecucion = typeof tarea.fechaHoraEjecucion === 'string' 
            ? new Date(tarea.fechaHoraEjecucion) 
            : tarea.fechaHoraEjecucion;
        }
        if (tarea.fechaHoraCompletado) {
          tareaActualizada.fechaHoraCompletado = typeof tarea.fechaHoraCompletado === 'string' 
            ? new Date(tarea.fechaHoraCompletado) 
            : tarea.fechaHoraCompletado;
        }
        return tareaActualizada;
      });
      
      // Limpiar el array existente y agregar las nuevas tareas
      contacto.tareas = [];
      contacto.tareas.push(...tareasProcesadas);
      
      // Marcar el array como modificado para que Mongoose lo detecte
      contacto.markModified('tareas');
      
      console.log('📋 Tareas asignadas al contacto:', contacto.tareas.length);
      console.log('📋 Primera tarea antes de guardar:', contacto.tareas[0] ? {
        descripcion: contacto.tareas[0].descripcion,
        fechaHoraCreacion: contacto.tareas[0].fechaHoraCreacion,
        fechaHoraEjecucion: contacto.tareas[0].fechaHoraEjecucion
      } : 'No hay tareas');
    }
    
    // Si se está actualizando el array de interacciones
    if (req.body.interacciones !== undefined && Array.isArray(req.body.interacciones)) {
      const interaccionesProcesadas = req.body.interacciones.map(interaccion => {
        const interaccionActualizada = { ...interaccion };
        if (interaccion.fechaHora) {
          interaccionActualizada.fechaHora = typeof interaccion.fechaHora === 'string' 
            ? new Date(interaccion.fechaHora) 
            : interaccion.fechaHora;
        }
        return interaccionActualizada;
      });
      contacto.interacciones = [];
      contacto.interacciones.push(...interaccionesProcesadas);
      contacto.markModified('interacciones');
    }
    
    // Actualizar otros campos si vienen en el body (excepto tareas, interacciones, _id y usuarioId que ya se procesaron)
    const otrosCampos = { ...req.body };
    delete otrosCampos.tareas;
    delete otrosCampos.interacciones;
    delete otrosCampos._id;
    delete otrosCampos.usuarioId; // No permitir cambiar el usuarioId
    
    Object.keys(otrosCampos).forEach(key => {
      if (otrosCampos[key] !== undefined && key !== '__v') {
        contacto[key] = otrosCampos[key];
      }
    });
    
    // Guardar el contacto
    const actualizado = await contacto.save();
    
    console.log('Contacto actualizado', { 
      userId: req.user.id, 
      contactoId: actualizado._id,
      tareasCount: actualizado.tareas ? actualizado.tareas.length : 0
    });
    
    res.json(actualizado);
  } catch (error) {
    console.error('Error actualizando contacto', { 
      error: error.message, 
      userId: req.user.id,
      contactoId: req.params.id
    });
    next(error);
  }
});

// DELETE - Eliminar contacto
app.delete('/api/contacto', authenticateToken, async (req, res) => {
  try {
    const { telefono } = req.body;
    if (!telefono) {
      return res.status(400).json({ error: 'Teléfono requerido' });
    }
    // Solo eliminar si el contacto pertenece al usuario autenticado
    const eliminado = await Contacto.findOneAndDelete({ 
      telefono, 
      usuarioId: req.user.id 
    });
    if (!eliminado) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    res.json({ message: 'Contacto eliminado', contacto: eliminado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handler (debe ir al final, después de todas las rutas)
app.use(errorHandler);

// Iniciar servidor
app.listen(PORT, HOST, () => {
  console.log("🚀 Servidor ejecutándose en puerto", PORT);
  console.log("🌐 Host:", HOST);
  console.log("💚 Health check: http://localhost:" + PORT + "/api/health");
  console.log("🔒 Seguridad: Helmet activado, Rate limiting activado");
});
