require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const Contacto = require('./models/Contacto');
const Usuario = require('./models/Usuario');
const Test = require('./models/Test');
const VoiceNoteTemp = require('./models/VoiceNoteTemp');
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
const multer = require('multer');
const { voiceToTaskStructured, transcribe, LIMITE_PETICIONES_GRATIS, COSTE_ESTIMADO_POR_PETICION_USD } = require('./services/aiService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25 MB

const app = express();

// Detrás de un proxy (Render, etc.): confiar en X-Forwarded-For para rate limit e IP
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS configuration (en producción, si ALLOWED_ORIGINS está vacío, permitir todos para app móvil)
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS.trim() 
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
        : '*')
    : '*',
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

// Configuración: solo MongoDB en la nube (Atlas). No se usa MongoDB local.
let MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const DB_NAME = 'vinculosDB';

// Leer URI y corregir si en Render pegaron "MONGODB_URI=valor" en el valor
let uriRaw = process.env.MONGODB_URI;
if (!uriRaw || typeof uriRaw !== 'string') {
  console.error("❌ MONGODB_URI no está configurado (vacío o no definido).");
  console.error("💡 En Render: Environment → Add Variable → Key: MONGODB_URI, Value: tu URI que empiece por mongodb+srv://");
  process.exit(1);
}
uriRaw = uriRaw.trim();
// Si pegaron "MONGODB_URI=mongodb+srv://..." como valor, usar solo la parte de la URI
if (uriRaw.startsWith('MONGODB_URI=')) {
  MONGODB_URI = uriRaw.replace(/^MONGODB_URI=/, '').trim();
  console.warn("⚠️ MONGODB_URI contenía el nombre de la variable; se usó solo la URI. En Render, pon solo la URI en el valor.");
} else {
  MONGODB_URI = uriRaw;
}
const validScheme = MONGODB_URI.startsWith('mongodb://') || MONGODB_URI.startsWith('mongodb+srv://');
if (!validScheme) {
  console.error("❌ MONGODB_URI no empieza por mongodb:// o mongodb+srv://");
  console.error("   Recibido (primeros 30 caracteres):", JSON.stringify(MONGODB_URI.substring(0, 30)));
  console.error("   Longitud total:", MONGODB_URI.length);
  console.error("💡 En Render → Environment, el VALOR de MONGODB_URI debe ser solo la URI (sin comillas, sin 'MONGODB_URI=' delante).");
  process.exit(1);
}

// Forzar siempre la base de datos vinculosDB (evita que use "test" por defecto)
mongoose.connect(MONGODB_URI, { dbName: DB_NAME })
  .then(() => {
    console.log("✅ Conexión a MongoDB (nube) exitosa");
    console.log("📊 Estado:", mongoose.connection.readyState === 1 ? "Conectado" : "Desconectado");
    console.log("🗄️  Base de datos:", mongoose.connection.name);
    console.log("🌐 Host:", mongoose.connection.host);
  })
  .catch(err => {
    console.error("❌ Error de MongoDB:", err.message);
    console.error("💡 Verifica MONGODB_URI en .env (local) o en Render (producción).");
    process.exit(1);
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
    // En producción, si MongoDB no está conectado (ej. cold start), devolver 503 para reintentar
    if (mongoose.connection.readyState !== 1) {
      console.warn('⚠️ Register: MongoDB no conectado, readyState=', mongoose.connection.readyState);
      return next(createError('Base de datos no disponible. Espera unos segundos e intenta de nuevo.', ERROR_CODES.DATABASE_ERROR, 503));
    }

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
    console.error('❌ Error en registro:', error.message, error.name, error.code || '');
    if (error.stack) console.error(error.stack);
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
        plan: usuario.plan || 'Free',
        aiPeticionesHoy: usuario.aiPeticionesHoy ?? 0,
        aiEstimatedCostUsd: usuario.aiEstimatedCostUsd ?? 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// RUTAS DE IA (voz → tarea)
// ============================================

// POST - Enviar audio, transcribir con Whisper, extraer tarea con GPT-4o-mini, guardar tarea
app.post('/api/ai/voice-to-task', authenticateToken, upload.single('audio'), async (req, res, next) => {
  try {
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
      return next(createError('Servicio de IA no configurado', ERROR_CODES.SERVER_ERROR, 503));
    }

    if (!req.file || !req.file.buffer) {
      return next(createError('Falta el archivo de audio', ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return next(createError('Usuario no encontrado', ERROR_CODES.NOT_FOUND, 404));
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const ultimoReset = usuario.aiUltimoResetFecha ? new Date(usuario.aiUltimoResetFecha) : null;
    if (ultimoReset) {
      ultimoReset.setHours(0, 0, 0, 0);
      if (ultimoReset.getTime() < hoy.getTime()) {
        usuario.aiPeticionesHoy = 0;
        usuario.aiUltimoResetFecha = hoy;
      }
    } else {
      usuario.aiUltimoResetFecha = hoy;
    }

    const peticionesHoy = usuario.aiPeticionesHoy ?? 0;
    if (peticionesHoy >= LIMITE_PETICIONES_GRATIS) {
      return next(createError(
        `Has alcanzado el límite de ${LIMITE_PETICIONES_GRATIS} peticiones de voz por día. Vuelve mañana o mejora tu plan.`,
        ERROR_CODES.VALIDATION_ERROR,
        429
      ));
    }

    const contactos = await Contacto.find({ usuarioId: req.user.id }).select('nombre').lean();
    const nombresContactos = contactos.map(c => c.nombre).filter(Boolean);

    const mimeType = req.file.mimetype || 'audio/mp4';
    const { texto, vinculo, tarea, fecha } = await voiceToTaskStructured(
      req.file.buffer,
      mimeType,
      nombresContactos
    );

    let contacto = null;
    if (vinculo && vinculo !== 'Sin asignar') {
      const nombreNorm = vinculo.trim().toLowerCase();
      contacto = await Contacto.findOne({
        usuarioId: req.user.id,
        $or: [
          { nombre: { $regex: new RegExp(`^${nombreNorm}$`, 'i') } },
          { nombre: { $regex: new RegExp(nombreNorm.replace(/\s+/g, '.*'), 'i') } }
        ]
      });
    }
    if (!contacto) {
      contacto = await Contacto.findOne({ usuarioId: req.user.id }).sort({ updatedAt: -1 });
    }
    if (!contacto) {
      await usuario.save();
      return res.status(200).json({
        message: 'No tienes contactos. Crea uno para asignar la tarea.',
        texto,
        vinculo,
        tarea,
        fecha,
        contacto: null,
        tareaCreada: null
      });
    }

    const fechaEjecucion = new Date(fecha);
    if (isNaN(fechaEjecucion.getTime())) {
      fechaEjecucion.setTime(Date.now());
    }

    const nuevaTarea = {
      fechaHoraCreacion: new Date(),
      descripcion: tarea,
      fechaHoraEjecucion: fechaEjecucion,
      clasificacion: 'Otro',
      completada: false
    };
    contacto.tareas = contacto.tareas || [];
    contacto.tareas.push(nuevaTarea);
    contacto.markModified('tareas');
    await contacto.save();

    usuario.aiPeticionesHoy = (usuario.aiPeticionesHoy ?? 0) + 1;
    usuario.aiEstimatedCostUsd = (usuario.aiEstimatedCostUsd ?? 0) + COSTE_ESTIMADO_POR_PETICION_USD;
    await usuario.save();

    logger.info('AI voice-to-task', { userId: req.user.id, contactoId: contacto._id, texto: texto?.slice(0, 80) });

    res.status(201).json({
      message: 'Tarea creada desde tu nota de voz',
      texto,
      vinculo,
      tarea,
      fecha,
      contacto: { _id: contacto._id, nombre: contacto.nombre, tareas: contacto.tareas },
      tareaCreada: nuevaTarea,
      aiPeticionesRestantes: Math.max(0, LIMITE_PETICIONES_GRATIS - usuario.aiPeticionesHoy)
    });
  } catch (error) {
    console.error('Error en voice-to-task:', error);
    next(error);
  }
});

// Helper: lógica común de voice-to-preview (buffer de audio ya disponible)
async function handleVoicePreview(req, res, next, audioBuffer, mimeType = 'audio/mp4') {
  try {
    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return next(createError('Usuario no encontrado', ERROR_CODES.NOT_FOUND, 404));
    }
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const ultimoReset = usuario.aiUltimoResetFecha ? new Date(usuario.aiUltimoResetFecha) : null;
    if (ultimoReset) {
      ultimoReset.setHours(0, 0, 0, 0);
      if (ultimoReset.getTime() < hoy.getTime()) {
        usuario.aiPeticionesHoy = 0;
        usuario.aiUltimoResetFecha = hoy;
      }
    } else {
      usuario.aiUltimoResetFecha = hoy;
    }
    const peticionesHoy = usuario.aiPeticionesHoy ?? 0;
    if (peticionesHoy >= LIMITE_PETICIONES_GRATIS) {
      return next(createError(
        `Has alcanzado el límite de ${LIMITE_PETICIONES_GRATIS} peticiones de voz por día. Vuelve mañana.`,
        ERROR_CODES.VALIDATION_ERROR,
        429
      ));
    }
    const contactos = await Contacto.find({ usuarioId: req.user.id }).select('nombre').lean();
    const nombresContactos = contactos.map(c => c.nombre).filter(Boolean);
    const { texto, vinculo, tarea, fecha } = await voiceToTaskStructured(
      audioBuffer,
      mimeType,
      nombresContactos
    );
    let contacto = null;
    if (vinculo && vinculo !== 'Sin asignar') {
      const nombreNorm = vinculo.trim().toLowerCase();
      contacto = await Contacto.findOne({
        usuarioId: req.user.id,
        $or: [
          { nombre: { $regex: new RegExp(`^${nombreNorm}$`, 'i') } },
          { nombre: { $regex: new RegExp(nombreNorm.replace(/\s+/g, '.*'), 'i') } }
        ]
      });
    }
    if (!contacto) {
      contacto = await Contacto.findOne({ usuarioId: req.user.id }).sort({ updatedAt: -1 });
    }
    usuario.aiPeticionesHoy = (usuario.aiPeticionesHoy ?? 0) + 1;
    usuario.aiEstimatedCostUsd = (usuario.aiEstimatedCostUsd ?? 0) + COSTE_ESTIMADO_POR_PETICION_USD;
    await usuario.save();
    const contactoId = contacto ? contacto._id.toString() : null;
    const contactoNombre = contacto ? contacto.nombre : null;
    res.status(200).json({
      texto: texto || '',
      vinculo: vinculo || 'Sin asignar',
      tarea: tarea || '',
      fecha: fecha || new Date().toISOString().slice(0, 10),
      descripcion: tarea || texto || '',
      contactoId,
      contactoNombre,
      aiPeticionesRestantes: Math.max(0, LIMITE_PETICIONES_GRATIS - usuario.aiPeticionesHoy)
    });
  } catch (error) {
    console.error('Error en voice-to-preview:', error);
    next(error);
  }
}

// POST - Preview: acepta JSON con audio en base64 (evita problemas con multipart en React Native).
app.post('/api/ai/voice-to-preview', authenticateToken, async (req, res, next) => {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
    return next(createError('Servicio de IA no configurado', ERROR_CODES.SERVER_ERROR, 503));
  }
  const base64 = req.body && req.body.audioBase64;
  if (!base64 || typeof base64 !== 'string') {
    return next(createError('Envía JSON con campo "audioBase64" (audio en base64).', ERROR_CODES.VALIDATION_ERROR, 400));
  }
  try {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) {
      return next(createError('El audio en base64 está vacío.', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    return handleVoicePreview(req, res, next, buffer, 'audio/mp4');
  } catch (e) {
    return next(createError('audioBase64 inválido.', ERROR_CODES.VALIDATION_ERROR, 400));
  }
});

// ============================================
// NOTAS DE VOZ TEMPORALES (base64, se borran al convertir o cerrar)
// ============================================

// Handlers compartidos (rutas bajo /api/voice/temp y /api/ai/voice-temp)
async function postVoiceTemp(req, res, next) {
  try {
    const base64 = req.body && req.body.audioBase64;
    if (!base64 || typeof base64 !== 'string') {
      return next(createError('Envía JSON con campo "audioBase64".', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) {
      return next(createError('El audio en base64 está vacío.', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const doc = await VoiceNoteTemp.create({
      usuarioId: req.user.id,
      audioBase64: base64,
      createdAt: new Date()
    });
    res.status(201).json({ tempId: doc._id.toString() });
  } catch (error) {
    console.error('Error en POST voice temp:', error);
    next(error);
  }
}

async function deleteVoiceTempById(req, res, next) {
  try {
    const id = req.params.id;
    if (!id) {
      return next(createError('Falta id de nota temporal.', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const deleted = await VoiceNoteTemp.findOneAndDelete({
      _id: id,
      usuarioId: req.user.id
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Nota temporal no encontrada o ya borrada.' });
    }
    res.status(200).json({ deleted: true });
  } catch (error) {
    console.error('Error en DELETE voice temp:', error);
    next(error);
  }
}

// Rutas bajo /api/voice/temp
app.get('/api/voice/temp', authenticateToken, (req, res) => {
  res.json({ voiceTemp: true, message: 'Usa POST para subir audio en base64.' });
});
app.post('/api/voice/temp', authenticateToken, postVoiceTemp);
app.delete('/api/voice/temp/:id', authenticateToken, deleteVoiceTempById);

// GET - Transcribir nota temporal con Whisper (OpenAI). Devuelve { texto }. No borra la nota.
app.get('/api/ai/voice-temp/:id/transcribe', authenticateToken, async (req, res, next) => {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
    return next(createError('Servicio de IA no configurado', ERROR_CODES.SERVER_ERROR, 503));
  }
  const id = req.params.id;
  if (!id) {
    return next(createError('Falta id de nota temporal.', ERROR_CODES.VALIDATION_ERROR, 400));
  }
  try {
    const doc = await VoiceNoteTemp.findOne({ _id: id, usuarioId: req.user.id });
    if (!doc) {
      return res.status(404).json({ message: 'Nota temporal no encontrada o ya borrada.' });
    }
    const buffer = Buffer.from(doc.audioBase64, 'base64');
    if (buffer.length === 0) {
      return next(createError('El audio está vacío.', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const texto = await transcribe(buffer, 'audio/mp4');
    res.json({ texto: texto || '' });
  } catch (error) {
    console.error('Error en GET voice-temp/transcribe:', error);
    next(error);
  }
});

// Rutas alias bajo /api/ai/ (por si el deploy en Render solo expone /api/ai/*)
app.get('/api/ai/voice-temp', authenticateToken, (req, res) => {
  res.json({ voiceTemp: true, message: 'Usa POST para subir audio en base64.' });
});
app.post('/api/ai/voice-temp', authenticateToken, postVoiceTemp);
app.delete('/api/ai/voice-temp/:id', authenticateToken, deleteVoiceTempById);

// POST transcribir (mismo prefijo que upload/delete; evita 404 con GET en algunos proxies)
app.post('/api/ai/voice-temp/transcribe', authenticateToken, async (req, res, next) => {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
    return next(createError('Servicio de IA no configurado', ERROR_CODES.SERVER_ERROR, 503));
  }
  const id = req.body && req.body.tempId;
  if (!id || typeof id !== 'string') {
    return next(createError('Envía JSON con campo "tempId".', ERROR_CODES.VALIDATION_ERROR, 400));
  }
  try {
    const doc = await VoiceNoteTemp.findOne({ _id: id.trim(), usuarioId: req.user.id });
    if (!doc) {
      return res.status(404).json({ message: 'Nota temporal no encontrada o ya borrada.' });
    }
    const buffer = Buffer.from(doc.audioBase64, 'base64');
    if (buffer.length === 0) {
      return next(createError('El audio está vacío.', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const texto = await transcribe(buffer, 'audio/mp4');
    res.json({ texto: texto || '' });
  } catch (error) {
    console.error('Error en POST voice-temp/transcribe:', error);
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

// ============================================
// RUTAS DE TEST (requieren autenticación)
// ============================================

// GET - Listar todos los registros test del usuario
app.get('/api/test', authenticateToken, async (req, res, next) => {
  try {
    const items = await Test.find({ usuarioId: req.user.id }).sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    next(error);
  }
});

// POST - Crear registro test
app.post('/api/test', authenticateToken, async (req, res, next) => {
  try {
    const { nombre, valor, activo } = req.body;
    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
      return next(createError('El campo nombre es obligatorio', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const nuevo = new Test({
      usuarioId: req.user.id,
      nombre: nombre.trim(),
      valor: valor != null ? String(valor) : '',
      activo: activo !== undefined ? Boolean(activo) : true
    });
    const guardado = await nuevo.save();
    res.status(201).json(guardado);
  } catch (error) {
    next(error);
  }
});

// PUT - Actualizar registro test
app.put('/api/test/:id', authenticateToken, validateObjectId, async (req, res, next) => {
  try {
    const item = await Test.findOne({ _id: req.params.id, usuarioId: req.user.id });
    if (!item) {
      return next(createError('Registro no encontrado', ERROR_CODES.NOT_FOUND, 404));
    }
    const { nombre, valor, activo } = req.body;
    if (nombre !== undefined) item.nombre = String(nombre).trim();
    if (valor !== undefined) item.valor = String(valor);
    if (activo !== undefined) item.activo = Boolean(activo);
    await item.save();
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// DELETE - Eliminar registro test
app.delete('/api/test/:id', authenticateToken, validateObjectId, async (req, res, next) => {
  try {
    const eliminado = await Test.findOneAndDelete({ _id: req.params.id, usuarioId: req.user.id });
    if (!eliminado) {
      return next(createError('Registro no encontrado', ERROR_CODES.NOT_FOUND, 404));
    }
    res.json({ message: 'Registro eliminado', item: eliminado });
  } catch (error) {
    next(error);
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
