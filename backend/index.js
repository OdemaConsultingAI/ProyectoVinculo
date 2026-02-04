require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const Contacto = require('./models/Contacto');
const Usuario = require('./models/Usuario');
const Test = require('./models/Test');
const VoiceNoteTemp = require('./models/VoiceNoteTemp');
const Desahogo = require('./models/Desahogo');
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
const { voiceToTaskStructured, transcribe, getVoicePrompt, extractGesto, extractMomento, extractDesahogo, getEspejoSummary, calcCostFromUsage, TIPOS_DE_GESTO_DISPLAY, MODEL_VOICE, LIMITE_PETICIONES_GRATIS, COSTE_ESTIMADO_POR_PETICION_USD } = require('./services/aiService');
const { sendPushToUser } = require('./services/pushService');
const { sendRemindersGestosHoy } = require('./services/reminderService');
const PALABRAS_PROHIBIDAS = require('./config/palabrasProhibidas');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25 MB

/** Mínimo de caracteres en la transcripción para enviar a GPT (> 5): no gastar en "Ah", "Eh" o ruido. */
const MIN_CARACTERES_PARA_GPT = 6;

/**
 * Resetea contador diario de IA si es nuevo día y comprueba límite solo para usuarios Free.
 * Modifica usuario en memoria (reset); guardar después si se incrementa.
 * @returns {Promise<Error|null>} Error para next() o null si puede continuar.
 */
async function checkAILimitFreeUser(usuario) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const ultimoReset = usuario.aiUltimoResetFecha ? new Date(usuario.aiUltimoResetFecha) : null;
  if (ultimoReset) {
    ultimoReset.setHours(0, 0, 0, 0);
    if (ultimoReset.getTime() < hoy.getTime()) {
      usuario.aiPeticionesHoy = 0;
      usuario.aiUltimoResetFecha = hoy;
      await usuario.save();
    }
  } else {
    usuario.aiUltimoResetFecha = hoy;
    await usuario.save();
  }
  if (usuario.plan === 'Premium' || usuario.plan === 'Administrador') return null;
  const peticionesHoy = usuario.aiPeticionesHoy ?? 0;
  if (peticionesHoy >= LIMITE_PETICIONES_GRATIS) {
    return createError(
      'Has agotado tus consultas de IA por hoy. Pásate a Premium para más.',
      ERROR_CODES.VALIDATION_ERROR,
      429
    );
  }
  return null;
}

/** Incrementa contadores de uso de IA (día, mes, coste). Resetea mes si es nuevo mes. costUsd opcional: coste real por tokens; si no se pasa y addCost es true, se usa estimado fijo. */
async function incrementAIUsage(usuario, addCost = true, costUsd = undefined) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastResetMes = usuario.aiUltimoResetMes ? new Date(usuario.aiUltimoResetMes) : null;
  if (!lastResetMes || lastResetMes.getTime() < startOfMonth.getTime()) {
    usuario.aiPeticionesMes = 0;
    usuario.aiUltimoResetMes = startOfMonth;
    usuario.markModified('aiPeticionesMes');
    usuario.markModified('aiUltimoResetMes');
  }
  usuario.aiPeticionesHoy = (usuario.aiPeticionesHoy ?? 0) + 1;
  usuario.aiPeticionesMes = (usuario.aiPeticionesMes ?? 0) + 1;
  if (addCost) {
    const costToAdd = typeof costUsd === 'number' && costUsd >= 0 ? costUsd : COSTE_ESTIMADO_POR_PETICION_USD;
    usuario.aiEstimatedCostUsd = (usuario.aiEstimatedCostUsd ?? 0) + costToAdd;
    usuario.markModified('aiEstimatedCostUsd');
  }
  usuario.markModified('aiPeticionesHoy');
  usuario.markModified('aiPeticionesMes');
  await usuario.save();
}

/** Solo usuarios con plan Administrador pueden acceder a rutas /api/admin/* */
async function requireAdmin(req, res, next) {
  try {
    const usuario = await Usuario.findById(req.user.id);
    if (!usuario || usuario.plan !== 'Administrador') {
      return res.status(403).json({ error: 'Solo administradores pueden acceder a esta sección' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

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
    // Mongoose: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    const estados = ['desconectado', 'conectado', 'conectando', 'desconectando'];
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

// Versión del API (sin auth) — para comprobar que Render tiene el deploy actual (gesto/momento/desahogo desde voz)
app.get('/api/version', (req, res) => {
  res.json({
    version: '1.2.0',
    features: ['refugio', 'from-voice', 'voice-temp-transcribe'],
    timestamp: new Date().toISOString()
  });
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

    usuario.lastLoginAt = new Date();
    await usuario.save();

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

    const hoy = usuario.aiPeticionesHoy ?? 0;
    const mes = usuario.aiPeticionesMes ?? 0;
    const plan = usuario.plan || 'Free';
    // Mes acumulativo: al menos el valor de hoy (por si el documento no tenía el campo o no se persistió)
    const aiPeticionesMesMostrar = Math.max(mes, hoy);
    const limiteDiarioIA = plan === 'Free' ? LIMITE_PETICIONES_GRATIS : null;
    const aiPeticionesRestantes = plan === 'Free' ? Math.max(0, LIMITE_PETICIONES_GRATIS - hoy) : null;

    res.json({
      usuario: {
        id: usuario._id,
        email: usuario.email,
        nombre: usuario.nombre,
        plan: plan,
        aiPeticionesHoy: hoy,
        aiPeticionesMes: aiPeticionesMesMostrar,
        aiEstimatedCostUsd: usuario.aiEstimatedCostUsd ?? 0,
        limiteDiarioIA,
        aiPeticionesRestantes
      }
    });
  } catch (error) {
    next(error);
  }
});

// PUT - Registrar token Expo para notificaciones push (Etapa 2)
const MAX_PUSH_TOKENS_PER_USER = 5;
app.put('/api/auth/push-token', authenticateToken, async (req, res, next) => {
  try {
    const token = typeof req.body?.expoPushToken === 'string' ? req.body.expoPushToken.trim() : '';
    if (!token || !token.startsWith('ExponentPushToken[')) {
      return res.status(400).json({ error: 'expoPushToken inválido (formato ExponentPushToken[...])' });
    }

    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return next(createError('Usuario no encontrado', ERROR_CODES.NOT_FOUND, 404));
    }

    const tokens = usuario.expoPushTokens || [];
    if (!tokens.includes(token)) {
      usuario.expoPushTokens = [...tokens, token].slice(-MAX_PUSH_TOKENS_PER_USER);
      await usuario.save();
    }

    res.json({ ok: true, message: 'Token de push registrado' });
  } catch (error) {
    next(error);
  }
});

// POST - Enviar notificación push de prueba al usuario actual (Etapa 2b)
app.post('/api/auth/send-test-push', authenticateToken, async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return next(createError('Usuario no encontrado', ERROR_CODES.NOT_FOUND, 404));
    }
    const tokens = usuario.expoPushTokens || [];
    if (tokens.length === 0) {
      return res.status(400).json({
        error: 'No tienes ningún dispositivo registrado para notificaciones. Activa las notificaciones en la app y vuelve a entrar.',
      });
    }
    const result = await sendPushToUser(usuario, {
      title: 'Vínculo – Prueba',
      body: '¡Las notificaciones push están funcionando! 🌱',
      data: { tipo: 'test' },
    });
    res.json({
      ok: true,
      message: 'Notificación de prueba enviada',
      success: result.success,
      failed: result.failed,
    });
  } catch (error) {
    next(error);
  }
});

// POST - Cron: enviar recordatorios de gestos del día (Etapa 3)
// Protegido por CRON_SECRET (header X-Cron-Secret). Llamar desde Render Cron o similar.
app.post('/api/cron/send-reminders', (req, res, next) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  sendRemindersGestosHoy()
    .then((result) => {
      res.json({
        ok: true,
        message: 'Recordatorios enviados',
        sent: result.sent,
        failed: result.failed,
        details: result.details,
      });
    })
    .catch((err) => next(err));
});

// GET - Tipos de Gesto para filtros (sin paréntesis). La lista completa con paréntesis se usa en el prompt de IA.
app.get('/api/config/tipos-de-gesto', authenticateToken, (req, res) => {
  res.json({ display: TIPOS_DE_GESTO_DISPLAY });
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
    const limitError = await checkAILimitFreeUser(usuario);
    if (limitError) return next(limitError);

    const contactos = await Contacto.find({ usuarioId: req.user.id }).select('nombre').lean();
    const nombresContactos = contactos.map(c => c.nombre).filter(Boolean);

    const mimeType = req.file.mimetype || 'audio/mp4';
    const result = await voiceToTaskStructured(
      req.file.buffer,
      mimeType,
      nombresContactos
    );
    const { texto, vinculo, tarea, fecha, usage } = result;
    const costUsd = usage ? calcCostFromUsage(usage.prompt_tokens, usage.completion_tokens) : undefined;

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

    await incrementAIUsage(usuario, true, costUsd);

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
    const limitError = await checkAILimitFreeUser(usuario);
    if (limitError) return next(limitError);
    const contactos = await Contacto.find({ usuarioId: req.user.id }).select('nombre').lean();
    const nombresContactos = contactos.map(c => c.nombre).filter(Boolean);
    const result = await voiceToTaskStructured(
      audioBuffer,
      mimeType,
      nombresContactos
    );
    const { texto, vinculo, tarea, fecha, usage } = result;
    const costUsd = usage ? calcCostFromUsage(usage.prompt_tokens, usage.completion_tokens) : undefined;
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
    await incrementAIUsage(usuario, true, costUsd);
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

// GET - Devuelve el prompt actual de clasificación voz (espacio editable: backend/prompts/voice-to-action.txt)
app.get('/api/ai/voice-prompt', authenticateToken, (req, res) => {
  try {
    const prompt = getVoicePrompt();
    res.json({ prompt, model: MODEL_VOICE });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al leer el prompt.' });
  }
});

// POST transcribir + clasificar (interacción vs tarea) con GPT-4o-mini y prompt dinámico
app.post('/api/ai/voice-temp/transcribe', authenticateToken, async (req, res, next) => {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
    return next(createError('Servicio de IA no configurado', ERROR_CODES.SERVER_ERROR, 503));
  }
  const id = req.body && req.body.tempId;
  if (!id || typeof id !== 'string') {
    return next(createError('Envía JSON con campo "tempId".', ERROR_CODES.VALIDATION_ERROR, 400));
  }
  try {
    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return next(createError('Usuario no encontrado', ERROR_CODES.NOT_FOUND, 404));
    }
    const limitError = await checkAILimitFreeUser(usuario);
    if (limitError) return next(limitError);

    const doc = await VoiceNoteTemp.findOne({ _id: id.trim(), usuarioId: req.user.id });
    if (!doc) {
      return res.status(404).json({ message: 'Nota temporal no encontrada o ya borrada.' });
    }
    const buffer = Buffer.from(doc.audioBase64, 'base64');
    if (buffer.length === 0) {
      return next(createError('El audio está vacío.', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const texto = await transcribe(buffer, 'audio/mp4');
    const textoTrim = (texto || '').trim();
    if (!textoTrim) {
      return res.json({ texto: '', tipo: 'tarea', vinculo: 'Sin asignar', tarea: '', descripcion: '', fecha: new Date().toISOString().slice(0, 10), clasificacion: 'Otro' });
    }

    // No gastar en GPT si la transcripción es muy corta (ruido, "Ah", "Eh")
    if (textoTrim.length < MIN_CARACTERES_PARA_GPT) {
      const hoy = new Date().toISOString().slice(0, 10);
      return res.json({
        texto: textoTrim,
        tipo: 'tarea',
        vinculo: 'Sin asignar',
        tarea: textoTrim,
        descripcion: textoTrim,
        fecha: hoy,
        clasificacion: 'Otro',
        contactoId: null,
        contactoNombre: 'Sin asignar',
        model: null
      });
    }

    // Filtro de palabras prohibidas: rechazar antes de enviar a OpenAI
    const textoLower = textoTrim.toLowerCase();
    const tieneProhibida = Array.isArray(PALABRAS_PROHIBIDAS) && PALABRAS_PROHIBIDAS.length > 0 &&
      PALABRAS_PROHIBIDAS.some(p => typeof p === 'string' && p.trim() && textoLower.includes(p.trim().toLowerCase()));
    if (tieneProhibida) {
      return res.status(400).json({ error: 'Contenido no permitido para procesar.' });
    }

    const contactos = await Contacto.find({ usuarioId: req.user.id }).select('nombre _id').lean();
    const nombresContactos = contactos.map(c => (c.nombre || '').trim()).filter(Boolean);
    const tipoPedido = (req.body && req.body.tipo === 'momento') ? 'momento' : 'gesto';

    if (tipoPedido === 'momento') {
      const extracted = await extractMomento(textoTrim, nombresContactos);
      const vinculoNorm = (extracted.vinculo || '').toLowerCase().trim();
      const contactoMatch = contactos.find(c => (c.nombre || '').toLowerCase().trim() === vinculoNorm);
      const contactoId = contactoMatch ? contactoMatch._id.toString() : null;
      const contactoNombre = contactoMatch ? (contactoMatch.nombre || extracted.vinculo) : (extracted.vinculo || 'Sin asignar');
      const costUsd = extracted.usage ? calcCostFromUsage(extracted.usage.prompt_tokens, extracted.usage.completion_tokens) : undefined;
      await incrementAIUsage(usuario, true, costUsd);
      return res.json({
        texto: textoTrim,
        tipo: 'interacción',
        vinculo: extracted.vinculo,
        tarea: '',
        descripcion: textoTrim,
        fecha: extracted.fecha || new Date().toISOString().slice(0, 10),
        hora: extracted.hora || '09:00',
        emocion: extracted.emocion || 'Calma',
        clasificacion: 'Otro',
        contactoId,
        contactoNombre,
        model: MODEL_VOICE
      });
    }

    // Gesto: solo tareas futuras; si no es tarea, devolver no_es_tarea
    const extracted = await extractGesto(textoTrim, nombresContactos);
    if (!extracted) {
      await incrementAIUsage(usuario, true, undefined);
      return res.json({
        texto: textoTrim,
        tipo: 'no_es_tarea',
        message: 'No se detectó una tarea futura. ¿Quieres guardarlo como Momento (algo que ya pasó)?',
        vinculo: 'Sin asignar',
        tarea: '',
        descripcion: textoTrim,
        fecha: new Date().toISOString().slice(0, 10),
        hora: '09:00',
        clasificacion: 'Otro',
        contactoId: null,
        contactoNombre: 'Sin asignar',
        model: MODEL_VOICE
      });
    }

    const vinculoNorm = (extracted.vinculo || '').toLowerCase().trim();
    const contactoMatch = contactos.find(c => (c.nombre || '').toLowerCase().trim() === vinculoNorm);
    const contactoId = contactoMatch ? contactoMatch._id.toString() : null;
    const contactoNombre = contactoMatch ? (contactoMatch.nombre || extracted.vinculo) : (extracted.vinculo || 'Sin asignar');
    const costUsd = extracted.usage ? calcCostFromUsage(extracted.usage.prompt_tokens, extracted.usage.completion_tokens) : undefined;
    await incrementAIUsage(usuario, true, costUsd);

    res.json({
      texto: textoTrim,
      tipo: 'tarea',
      vinculo: extracted.vinculo,
      tarea: textoTrim,
      descripcion: textoTrim,
      fecha: extracted.fecha || new Date().toISOString().slice(0, 10),
      hora: extracted.hora || '09:00',
      clasificacion: extracted.clasificacion || 'Otro',
      contactoId,
      contactoNombre,
      model: MODEL_VOICE
    });
  } catch (error) {
    console.error('Error en POST voice-temp/transcribe:', error?.message || error);
    if (error?.status === 400 || error?.message?.includes('Invalid') || error?.message?.includes('file')) {
      return res.status(400).json({ error: error.message || 'Formato de audio no válido para Whisper.' });
    }
    if (error?.status === 401) {
      return res.status(503).json({ error: 'OPENAI_API_KEY inválida o expirada.' });
    }
    // Devolver siempre JSON con mensaje claro (evita que el cliente reciba HTML y falle el parse)
    const msg = error?.message || 'Error al transcribir.';
    return res.status(503).json({
      error: msg.includes('API') || msg.includes('OpenAI') ? 'No se pudo transcribir el audio. Verifica tu conexión o intenta de nuevo.' : msg,
    });
  }
});

// ============================================
// MI REFUGIO - Desahogos (privados, solo usuario)
// ============================================

// POST - Guardar desahogo: desde voz (tempId) o desde texto (texto)
// Log de todas las peticiones a refugio (para depurar 404)
app.use('/api/refugio', (req, res, next) => {
  console.log('📥 [refugio]', req.method, req.originalUrl);
  next();
});

// Ruta de prueba sin auth: GET /api/refugio/ping → si responde 200, el servidor recibe peticiones a refugio
app.get('/api/refugio/ping', (req, res) => {
  res.json({ ok: true, message: 'refugio routes OK', ts: new Date().toISOString() });
});

app.post('/api/refugio/desahogo', authenticateToken, async (req, res, next) => {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
    return next(createError('Servicio de IA no configurado', ERROR_CODES.SERVER_ERROR, 503));
  }
  const tempId = req.body && req.body.tempId;
  const textoEscrito = req.body && (typeof req.body.texto === 'string' ? req.body.texto.trim() : '');

  // Flujo desde texto (lápiz): solo texto, sin audio
  if (textoEscrito && (!tempId || typeof tempId !== 'string')) {
    try {
      const usuario = await Usuario.findById(req.user.id);
      if (!usuario) return next(createError('Usuario no encontrado', ERROR_CODES.NOT_FOUND, 404));
      const limitError = await checkAILimitFreeUser(usuario);
      if (limitError) return next(limitError);
      const textoTrim = textoEscrito.slice(0, 5000);
      const extracted = textoTrim.length >= 3 ? await extractDesahogo(textoTrim) : { emotion: 'Calma', usage: null };
      const costUsd = extracted.usage ? calcCostFromUsage(extracted.usage.prompt_tokens, extracted.usage.completion_tokens) : undefined;
      if (extracted.usage) await incrementAIUsage(usuario, true, costUsd);
      const desahogo = await Desahogo.create({
        usuarioId: req.user.id,
        transcription: textoTrim,
        emotion: extracted.emotion || 'Calma',
        resumenReflexivo: '',
        audioBase64: '',
        createdAt: new Date()
      });
      return res.status(201).json({
        desahogo: {
          _id: desahogo._id,
          transcription: desahogo.transcription,
          emotion: desahogo.emotion,
          resumenReflexivo: desahogo.resumenReflexivo,
          createdAt: desahogo.createdAt
        }
      });
    } catch (e) {
      console.error('Error en POST refugio/desahogo (texto):', e?.message);
      return res.status(503).json({ error: e?.message || 'Error al guardar el desahogo.' });
    }
  }

  if (!tempId || typeof tempId !== 'string') {
    return next(createError('Envía JSON con campo "tempId" (voz) o "texto" (escribir).', ERROR_CODES.VALIDATION_ERROR, 400));
  }
  try {
    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) {
      return next(createError('Usuario no encontrado', ERROR_CODES.NOT_FOUND, 404));
    }
    const limitError = await checkAILimitFreeUser(usuario);
    if (limitError) return next(limitError);

    const doc = await VoiceNoteTemp.findOne({ _id: tempId.trim(), usuarioId: req.user.id });
    if (!doc) {
      return res.status(404).json({ message: 'Nota temporal no encontrada o ya borrada.' });
    }
    const buffer = Buffer.from(doc.audioBase64, 'base64');
    if (buffer.length === 0) {
      return next(createError('El audio está vacío.', ERROR_CODES.VALIDATION_ERROR, 400));
    }

    const texto = await transcribe(buffer, 'audio/mp4');
    const textoTrim = (texto || '').trim();
    if (!textoTrim) {
      return next(createError('No se pudo transcribir el audio.', ERROR_CODES.VALIDATION_ERROR, 400));
    }

    if (textoTrim.length < MIN_CARACTERES_PARA_GPT) {
      const desahogo = await Desahogo.create({
        usuarioId: req.user.id,
        transcription: textoTrim,
        emotion: 'Calma',
        resumenReflexivo: '',
        audioBase64: doc.audioBase64,
        createdAt: new Date()
      });
      await VoiceNoteTemp.findOneAndDelete({ _id: tempId.trim(), usuarioId: req.user.id });
      return res.status(201).json({
        desahogo: {
          _id: desahogo._id,
          transcription: desahogo.transcription,
          emotion: desahogo.emotion,
          resumenReflexivo: desahogo.resumenReflexivo,
          createdAt: desahogo.createdAt
        }
      });
    }

    const extracted = await extractDesahogo(textoTrim);
    const costUsd = extracted.usage ? calcCostFromUsage(extracted.usage.prompt_tokens, extracted.usage.completion_tokens) : undefined;
    await incrementAIUsage(usuario, true, costUsd);

    const desahogo = await Desahogo.create({
      usuarioId: req.user.id,
      transcription: textoTrim,
      emotion: extracted.emotion,
      resumenReflexivo: extracted.resumenReflexivo,
      audioBase64: doc.audioBase64,
      createdAt: new Date()
    });
    await VoiceNoteTemp.findOneAndDelete({ _id: tempId.trim(), usuarioId: req.user.id });

    res.status(201).json({
      desahogo: {
        _id: desahogo._id,
        transcription: desahogo.transcription,
        emotion: desahogo.emotion,
        resumenReflexivo: desahogo.resumenReflexivo,
        createdAt: desahogo.createdAt
      }
    });
  } catch (error) {
    console.error('Error en POST refugio/desahogo:', error?.message || error);
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message || 'Datos inválidos.' });
    }
    const msg = error?.message || 'Error al guardar el desahogo.';
    return res.status(503).json({ error: msg });
  }
});

// GET - Listar desahogos del usuario (solo metadatos; sin audio)
app.get('/api/refugio/desahogos', authenticateToken, async (req, res, next) => {
  try {
    const list = await Desahogo.find({ usuarioId: req.user.id })
      .sort({ createdAt: -1 })
      .select('transcription emotion resumenReflexivo createdAt _id')
      .lean();
    res.json(list);
  } catch (error) {
    console.error('Error en GET refugio/desahogos:', error);
    next(error);
  }
});

// GET - Un desahogo por ID (incluye audioBase64 para Escucha Retrospectiva)
app.get('/api/refugio/desahogos/:id', authenticateToken, async (req, res, next) => {
  try {
    const doc = await Desahogo.findOne({ _id: req.params.id, usuarioId: req.user.id }).lean();
    if (!doc) {
      return res.status(404).json({ message: 'Desahogo no encontrado.' });
    }
    res.json(doc);
  } catch (error) {
    console.error('Error en GET refugio/desahogos/:id:', error);
    next(error);
  }
});

// GET - El Espejo: resumen semanal de estado de ánimo (IA, sin juzgar)
app.get('/api/refugio/espejo', authenticateToken, async (req, res, next) => {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
    return res.json({ text: 'Esta semana no hay resumen disponible.' });
  }
  try {
    const hace7 = new Date();
    hace7.setDate(hace7.getDate() - 7);
    const desahogos = await Desahogo.find({ usuarioId: req.user.id, createdAt: { $gte: hace7 } })
      .sort({ createdAt: 1 })
      .select('emotion resumenReflexivo')
      .lean();
    const text = await getEspejoSummary(desahogos);
    res.json({ text: text || 'Esta semana no hay suficientes entradas para un resumen.' });
  } catch (error) {
    console.error('Error en GET refugio/espejo:', error);
    res.json({ text: 'No se pudo generar el resumen esta semana.' });
  }
});

// Helper: borrar un desahogo por ID (solo del usuario)
async function borrarUnDesahogo(req, res, next) {
  console.log('🗑️ [refugio] Borrar desahogo recibido – id:', req.params.id, 'method:', req.method);
  try {
    const idParam = (req.params.id || '').trim();
    if (!idParam) {
      return res.status(400).json({ message: 'Falta el ID del desahogo.' });
    }
    let objectId;
    try {
      objectId = new mongoose.Types.ObjectId(idParam);
    } catch (e) {
      return res.status(400).json({ message: 'ID de desahogo inválido.' });
    }
    const userId = req.user.id;
    const doc = await Desahogo.findOneAndDelete({ _id: objectId, usuarioId: userId });
    if (!doc) {
      return res.status(404).json({ message: 'Desahogo no encontrado.' });
    }
    res.json({ message: 'Desahogo eliminado' });
  } catch (error) {
    console.error('Error borrando desahogo:', error);
    next(error);
  }
}

// DELETE - Borrar un desahogo por ID (puede dar 404 en algunos hosts que bloquean DELETE)
app.delete('/api/refugio/desahogos/:id', authenticateToken, borrarUnDesahogo);

// POST - Borrar un desahogo por ID (alternativa para Render/proxies que no manejan bien DELETE)
app.post('/api/refugio/desahogos/:id/delete', authenticateToken, borrarUnDesahogo);

// DELETE - Borrar todos los desahogos del usuario (Mi Refugio)
app.delete('/api/refugio/desahogos', authenticateToken, async (req, res, next) => {
  try {
    const result = await Desahogo.deleteMany({ usuarioId: req.user.id });
    res.json({ message: 'Desahogos eliminados', deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error en DELETE refugio/desahogos:', error);
    next(error);
  }
});

// POST - Borrar todas las atenciones (tareas) del usuario
app.post('/api/user/clear-atenciones', authenticateToken, async (req, res, next) => {
  try {
    const contactos = await Contacto.find({ usuarioId: req.user.id });
    for (const c of contactos) {
      if ((c.tareas || []).length > 0) {
        c.tareas = [];
        c.proximaTarea = '';
        c.fechaRecordatorio = null;
        c.markModified('tareas');
        await c.save();
      }
    }
    res.json({ message: 'Atenciones eliminadas', contactosActualizados: contactos.length });
  } catch (error) {
    console.error('Error en POST user/clear-atenciones:', error);
    next(error);
  }
});

// POST - Borrar todas las huellas (interacciones) del usuario
app.post('/api/user/clear-huellas', authenticateToken, async (req, res, next) => {
  try {
    const contactos = await Contacto.find({ usuarioId: req.user.id });
    for (const c of contactos) {
      if ((c.interacciones || []).length > 0) {
        c.interacciones = [];
        c.markModified('interacciones');
        await c.save();
      }
    }
    res.json({ message: 'Huellas eliminadas', contactosActualizados: contactos.length });
  } catch (error) {
    console.error('Error en POST user/clear-huellas:', error);
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

// POST - Añadir interacción desde nota de voz (solo transcripción en texto; NUNCA guardar audio)
app.post('/api/contacto/:id/interacciones/from-voice', authenticateToken, async (req, res, next) => {
  try {
    const contactoId = req.params.id;
    const tempId = req.body && req.body.tempId;
    const texto = req.body && (typeof req.body.texto === 'string' ? req.body.texto.trim() : '');
    if (!tempId || typeof tempId !== 'string') {
      return next(createError('Envía JSON con campo "tempId".', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    if (!texto) {
      return next(createError('Envía la transcripción (campo "texto") para guardar como texto. No se guarda audio.', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const doc = await VoiceNoteTemp.findOne({ _id: tempId.trim(), usuarioId: req.user.id });
    if (!doc) {
      return res.status(404).json({ error: 'Nota temporal no encontrada o ya borrada.' });
    }
    const contacto = await Contacto.findOne({ _id: contactoId, usuarioId: req.user.id });
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado.' });
    }
    const fechaHora = (req.body.fechaHora && !isNaN(new Date(req.body.fechaHora).getTime()))
      ? new Date(req.body.fechaHora)
      : new Date();
    const emocion = req.body.emocion && ['Calma', 'Estrés', 'Gratitud', 'Tristeza', 'Alegre', 'Depresivo'].includes(req.body.emocion)
      ? req.body.emocion
      : '';
    const nuevaInteraccion = {
      fechaHora,
      descripcion: texto,
      ...(emocion && { emocion })
    };
    const actualizado = await Contacto.findByIdAndUpdate(
      contactoId,
      { $push: { interacciones: nuevaInteraccion } },
      { new: true, runValidators: true }
    );
    if (!actualizado) {
      return res.status(404).json({ error: 'Contacto no encontrado.' });
    }
    await VoiceNoteTemp.deleteOne({ _id: doc._id });
    res.json(actualizado);
  } catch (error) {
    console.error('Error en from-voice interacción:', error?.message);
    next(error);
  }
});

// POST - Añadir interacción desde texto (lápiz; sin tempId)
app.post('/api/contacto/:id/interacciones/from-text', authenticateToken, async (req, res, next) => {
  try {
    const contactoId = req.params.id;
    const descripcion = req.body && (typeof req.body.descripcion === 'string' ? req.body.descripcion.trim() : '');
    if (!descripcion) {
      return next(createError('Envía JSON con campo "descripcion".', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const contacto = await Contacto.findOne({ _id: contactoId, usuarioId: req.user.id });
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado.' });
    const fechaHora = (req.body.fechaHora && !isNaN(new Date(req.body.fechaHora).getTime()))
      ? new Date(req.body.fechaHora)
      : new Date();
    const emocion = req.body.emocion && ['Calma', 'Estrés', 'Gratitud', 'Tristeza', 'Alegre', 'Depresivo'].includes(req.body.emocion)
      ? req.body.emocion
      : '';
    const nuevaInteraccion = {
      fechaHora,
      descripcion: descripcion.slice(0, 2000),
      ...(emocion && { emocion })
    };
    contacto.interacciones = contacto.interacciones || [];
    contacto.interacciones.push(nuevaInteraccion);
    contacto.markModified('interacciones');
    await contacto.save();
    res.json(contacto);
  } catch (error) {
    console.error('Error en from-text interacción:', error?.message);
    next(error);
  }
});

// POST - Añadir tarea desde nota de voz (solo transcripción en texto; NUNCA guardar audio)
app.post('/api/contacto/:id/tareas/from-voice', authenticateToken, async (req, res, next) => {
  try {
    const contactoId = req.params.id;
    const tempId = req.body && req.body.tempId;
    const texto = req.body && (typeof req.body.texto === 'string' ? req.body.texto.trim() : '');
    if (!tempId || typeof tempId !== 'string') {
      return next(createError('Envía JSON con campo "tempId".', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    if (!texto) {
      return next(createError('Envía la transcripción (campo "texto") para guardar como texto. No se guarda audio.', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const doc = await VoiceNoteTemp.findOne({ _id: tempId.trim(), usuarioId: req.user.id });
    if (!doc) {
      return res.status(404).json({ error: 'Nota temporal no encontrada o ya borrada.' });
    }
    const contacto = await Contacto.findOne({ _id: contactoId, usuarioId: req.user.id });
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado.' });
    }
    const fechaEjecucion = req.body.fechaHoraEjecucion ? new Date(req.body.fechaHoraEjecucion) : new Date();
    const clasificacion = req.body.clasificacion && TIPOS_DE_GESTO_DISPLAY.includes(req.body.clasificacion) ? req.body.clasificacion : 'Otro';
    const nuevaTarea = {
      fechaHoraCreacion: new Date(),
      descripcion: texto,
      fechaHoraEjecucion: isNaN(fechaEjecucion.getTime()) ? new Date() : fechaEjecucion,
      clasificacion,
      completada: false
    };
    const actualizado = await Contacto.findByIdAndUpdate(
      contactoId,
      { $push: { tareas: nuevaTarea } },
      { new: true, runValidators: true }
    );
    if (!actualizado) {
      return res.status(404).json({ error: 'Contacto no encontrado.' });
    }
    await VoiceNoteTemp.deleteOne({ _id: doc._id });
    res.json(actualizado);
  } catch (error) {
    console.error('Error en from-voice tarea:', error?.message);
    next(error);
  }
});

// POST - Añadir tarea desde texto (lápiz; sin tempId)
app.post('/api/contacto/:id/tareas/from-text', authenticateToken, async (req, res, next) => {
  try {
    const contactoId = req.params.id;
    const descripcion = req.body && (typeof req.body.descripcion === 'string' ? req.body.descripcion.trim() : '');
    if (!descripcion) {
      return next(createError('Envía JSON con campo "descripcion".', ERROR_CODES.VALIDATION_ERROR, 400));
    }
    const contacto = await Contacto.findOne({ _id: contactoId, usuarioId: req.user.id });
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado.' });
    const fechaEjecucion = req.body.fechaHoraEjecucion ? new Date(req.body.fechaHoraEjecucion) : new Date();
    const clasificacion = req.body.clasificacion && TIPOS_DE_GESTO_DISPLAY.includes(req.body.clasificacion) ? req.body.clasificacion : 'Otro';
    contacto.tareas = contacto.tareas || [];
    contacto.tareas.push({
      fechaHoraCreacion: new Date(),
      descripcion: descripcion.slice(0, 2000),
      fechaHoraEjecucion: isNaN(fechaEjecucion.getTime()) ? new Date() : fechaEjecucion,
      clasificacion,
      completada: false
    });
    contacto.markModified('tareas');
    await contacto.save();
    res.json(contacto);
  } catch (error) {
    console.error('Error en from-text tarea:', error?.message);
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

// DELETE - Eliminar contacto por ID (usado por la app móvil)
app.delete('/api/contacto/:id', authenticateToken, async (req, res) => {
  try {
    const contactoId = req.params.id;
    const eliminado = await Contacto.findOneAndDelete({
      _id: contactoId,
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

// DELETE - Eliminar contacto por teléfono (body)
app.delete('/api/contacto', authenticateToken, async (req, res) => {
  try {
    const { telefono } = req.body;
    if (!telefono) {
      return res.status(400).json({ error: 'Teléfono requerido' });
    }
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

// ============================================
// RUTAS ADMIN (acceso abierto sin auth por ahora)
// ============================================

// GET - Estadísticas globales para el panel administrativo
app.get('/api/admin/stats', async (req, res, next) => {
  try {
    const now = new Date();
    const hace7 = new Date(now);
    hace7.setDate(hace7.getDate() - 7);
    const hace30 = new Date(now);
    hace30.setDate(hace30.getDate() - 30);

    const [totalUsers, newUsers7, newUsers30, usersByPlan, totalContacts, aiTotals, interactionsResult] = await Promise.all([
      Usuario.countDocuments(),
      Usuario.countDocuments({ fechaRegistro: { $gte: hace7 } }),
      Usuario.countDocuments({ fechaRegistro: { $gte: hace30 } }),
      Usuario.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
      Contacto.countDocuments(),
      Usuario.aggregate([
        { $group: {
          _id: null,
          totalAIHoy: { $sum: { $ifNull: ['$aiPeticionesHoy', 0] } },
          totalAIMes: { $sum: { $ifNull: ['$aiPeticionesMes', 0] } },
          totalCostUsd: { $sum: { $ifNull: ['$aiEstimatedCostUsd', 0] } }
        } }
      ]),
      Contacto.aggregate([
        { $project: { size: { $size: { $ifNull: ['$interacciones', []] } } } },
        { $group: { _id: null, total: { $sum: '$size' } } }
      ])
    ]);

    const planMap = (usersByPlan || []).reduce((acc, p) => { acc[p._id || 'Free'] = p.count; return acc; }, { Free: 0, Premium: 0, Administrador: 0 });
    const ai = aiTotals && aiTotals[0] ? aiTotals[0] : { totalAIHoy: 0, totalAIMes: 0, totalCostUsd: 0 };
    const totalInteractions = (interactionsResult && interactionsResult[0] && interactionsResult[0].total) ? interactionsResult[0].total : 0;

    res.json({
      totalUsers,
      newUsersLast7Days: newUsers7,
      newUsersLast30Days: newUsers30,
      usersByPlan: planMap,
      totalContacts,
      totalInteractions,
      totalAIHoy: ai.totalAIHoy || 0,
      totalAIMes: ai.totalAIMes || 0,
      totalCostUsd: (Number(ai.totalCostUsd) || 0).toFixed(4),
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// GET - Listado de usuarios con paginación y métricas por usuario (contactos, gestos, huellas, desahogos)
app.get('/api/admin/users', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [users, total, aggContactos, aggGestos, aggDesahogos] = await Promise.all([
      Usuario.find().select('-password').sort({ fechaRegistro: -1 }).skip(skip).limit(limit).lean(),
      Usuario.countDocuments(),
      Contacto.aggregate([
        { $group: { _id: '$usuarioId', contactCount: { $sum: 1 }, interactionsCount: { $sum: { $size: { $ifNull: ['$interacciones', []] } } } } }
      ]),
      Contacto.aggregate([
        { $project: { usuarioId: 1, gestosCount: { $size: { $ifNull: ['$tareas', []] } } } },
        { $group: { _id: '$usuarioId', gestosCount: { $sum: '$gestosCount' } } }
      ]),
      Desahogo.aggregate([{ $group: { _id: '$usuarioId', desahogosCount: { $sum: 1 } } }])
    ]);

    const countsByUser = {};
    (aggContactos || []).forEach(r => {
      const id = r._id.toString();
      countsByUser[id] = { contactCount: r.contactCount, interactionsCount: r.interactionsCount };
    });
    (aggGestos || []).forEach(r => {
      const id = r._id.toString();
      if (!countsByUser[id]) countsByUser[id] = { contactCount: 0, interactionsCount: 0 };
      countsByUser[id].gestosCount = r.gestosCount;
    });
    (aggDesahogos || []).forEach(r => {
      const id = r._id.toString();
      if (!countsByUser[id]) countsByUser[id] = { contactCount: 0, interactionsCount: 0 };
      countsByUser[id].desahogosCount = r.desahogosCount;
    });

    const list = users.map(u => {
      const c = countsByUser[u._id.toString()] || {};
      return {
        id: u._id,
        email: u.email,
        nombre: u.nombre,
        plan: u.plan || 'Free',
        fechaRegistro: u.fechaRegistro,
        lastLoginAt: u.lastLoginAt,
        aiPeticionesHoy: u.aiPeticionesHoy ?? 0,
        aiPeticionesMes: u.aiPeticionesMes ?? 0,
        aiEstimatedCostUsd: u.aiEstimatedCostUsd ?? 0,
        contactCount: c.contactCount ?? 0,
        interactionsCount: c.interactionsCount ?? 0,
        gestosCount: c.gestosCount ?? 0,
        huellasCount: c.interactionsCount ?? 0,
        desahogosCount: c.desahogosCount ?? 0
      };
    });

    res.json({
      users: list,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/datos — Página HTML con datos ya insertados (sin JavaScript). Si el botón de /admin no funciona, usa esta URL.
app.get('/admin/datos', async (req, res, next) => {
  try {
    const now = new Date();
    const hace7 = new Date(now); hace7.setDate(hace7.getDate() - 7);
    const hace30 = new Date(now); hace30.setDate(hace30.getDate() - 30);
    const page = 1;
    const limit = 50;
    const skip = 0;

    const [totalUsers, newUsers7, newUsers30, usersByPlan, totalContacts, aiTotals, interactionsResult, users, total] = await Promise.all([
      Usuario.countDocuments(),
      Usuario.countDocuments({ fechaRegistro: { $gte: hace7 } }),
      Usuario.countDocuments({ fechaRegistro: { $gte: hace30 } }),
      Usuario.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
      Contacto.countDocuments(),
      Usuario.aggregate([{ $group: { _id: null, totalAIHoy: { $sum: { $ifNull: ['$aiPeticionesHoy', 0] } }, totalAIMes: { $sum: { $ifNull: ['$aiPeticionesMes', 0] } }, totalCostUsd: { $sum: { $ifNull: ['$aiEstimatedCostUsd', 0] } } } }]),
      Contacto.aggregate([{ $project: { size: { $size: { $ifNull: ['$interacciones', []] } } } }, { $group: { _id: null, total: { $sum: '$size' } } }]),
      Usuario.find().select('-password').sort({ fechaRegistro: -1 }).skip(skip).limit(limit).lean(),
      Usuario.countDocuments()
    ]);

    const planMap = (usersByPlan || []).reduce((acc, p) => { acc[p._id || 'Free'] = p.count; return acc; }, { Free: 0, Premium: 0, Administrador: 0 });
    const ai = aiTotals && aiTotals[0] ? aiTotals[0] : { totalAIHoy: 0, totalAIMes: 0, totalCostUsd: 0 };
    const totalInteractions = (interactionsResult && interactionsResult[0] && interactionsResult[0].total) ? interactionsResult[0].total : 0;

    const aggContactos = await Contacto.aggregate([{ $group: { _id: '$usuarioId', contactCount: { $sum: 1 }, interactionsCount: { $sum: { $size: { $ifNull: ['$interacciones', []] } } } } }]);
    const aggGestos = await Contacto.aggregate([
      { $project: { usuarioId: 1, gestosCount: { $size: { $ifNull: ['$tareas', []] } } } },
      { $group: { _id: '$usuarioId', gestosCount: { $sum: '$gestosCount' } } }
    ]);
    const aggDesahogos = await Desahogo.aggregate([{ $group: { _id: '$usuarioId', desahogosCount: { $sum: 1 } } }]);

    const countsByUser = {};
    (aggContactos || []).forEach(r => {
      const id = r._id.toString();
      countsByUser[id] = { contactCount: r.contactCount, interactionsCount: r.interactionsCount };
    });
    (aggGestos || []).forEach(r => {
      const id = r._id.toString();
      if (!countsByUser[id]) countsByUser[id] = { contactCount: 0, interactionsCount: 0 };
      countsByUser[id].gestosCount = r.gestosCount;
    });
    (aggDesahogos || []).forEach(r => {
      const id = r._id.toString();
      if (!countsByUser[id]) countsByUser[id] = { contactCount: 0, interactionsCount: 0 };
      countsByUser[id].desahogosCount = r.desahogosCount;
    });

    const n = (v) => (v !== undefined && v !== null ? v : 0);
    const fmt = (d) => (d ? new Date(d).toLocaleString('es') : '—');
    const badge = (plan) => {
      const c = plan === 'Premium' ? 'badgePremium' : plan === 'Administrador' ? 'badgeAdmin' : 'badgeFree';
      return '<span class="badge ' + c + '">' + (plan || 'Free') + '</span>';
    };

    const userRows = (users || []).map(u => {
      const counts = countsByUser[u._id.toString()] || {};
      return '<tr><td>' + (u.email || '') + '</td><td>' + (u.nombre || '') + '</td><td>' + badge(u.plan) + '</td><td>' + fmt(u.fechaRegistro) + '</td><td>' + fmt(u.lastLoginAt) + '</td><td>' + n(counts.contactCount) + '</td><td>' + n(counts.gestosCount) + '</td><td>' + n(counts.interactionsCount) + '</td><td>' + n(counts.desahogosCount) + '</td><td>' + n(u.aiPeticionesHoy) + '</td><td>' + n(u.aiPeticionesMes) + '</td><td>' + (Number(u.aiEstimatedCostUsd || 0).toFixed(4)) + '</td></tr>';
    }).join('');

    const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Admin datos - Vínculo</title><style>body{font-family:sans-serif;margin:20px;background:#f5f7fa;} .c{max-width:1400px;margin:0 auto;} h1{color:#0d7377;} .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin:20px 0;} .card{background:#fff;padding:16px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);} .card .v{font-size:24px;font-weight:700;color:#0d7377;} .card .l{font-size:12px;color:#666;} table{width:100%;border-collapse:collapse;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.08);border-radius:8px;overflow:hidden;} th,td{padding:10px;text-align:left;border-bottom:1px solid #eee;} th{background:#f0f0f0;} .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;} .badgeFree{background:#e9ecef;} .badgePremium{background:#fff3cd;} .badgeAdmin{background:#cce5ff;} a{color:#0d7377;}</style></head><body><div class="c"><h1>Vínculo – Datos admin</h1><p><a href="/admin">Volver al panel</a> | Generado ' + new Date().toISOString() + '</p><div class="cards"><div class="card"><div class="v">' + n(totalUsers) + '</div><div class="l">Total usuarios</div></div><div class="card"><div class="v">' + n(newUsers7) + '</div><div class="l">Registros 7 d.</div></div><div class="card"><div class="v">' + n(newUsers30) + '</div><div class="l">Registros 30 d.</div></div><div class="card"><div class="v">' + n(totalContacts) + '</div><div class="l">Contactos</div></div><div class="card"><div class="v">' + n(totalInteractions) + '</div><div class="l">Interacciones</div></div><div class="card"><div class="v">' + n(ai.totalAIHoy) + '</div><div class="l">IA hoy</div></div><div class="card"><div class="v">' + n(ai.totalAIMes) + '</div><div class="l">IA mes</div></div><div class="card"><div class="v">$' + (ai.totalCostUsd != null ? Number(ai.totalCostUsd).toFixed(4) : '0') + '</div><div class="l">Coste USD</div></div><div class="card"><div class="v">' + n(planMap.Free) + '</div><div class="l">Free</div></div><div class="card"><div class="v">' + n(planMap.Premium) + '</div><div class="l">Premium</div></div><div class="card"><div class="v">' + n(planMap.Administrador) + '</div><div class="l">Admin</div></div></div><h2>Usuarios (página 1 de ' + Math.ceil(total / limit) + ', total ' + total + ')</h2><table><thead><tr><th>Email</th><th>Nombre</th><th>Plan</th><th>Registro</th><th>Último acceso</th><th>Contactos</th><th>Gestos</th><th>Huellas</th><th>Desahogos</th><th>IA hoy</th><th>IA mes</th><th>Coste USD</th></tr></thead><tbody>' + userRows + '</tbody></table></div></body></html>';

    res.set('Cache-Control', 'no-store');
    res.type('html').send(html);
  } catch (err) {
    next(err);
  }
});

// /admin y /admin/ redirigen a la página que sí funciona (datos ya renderizados)
app.get(['/admin', '/admin/'], function(req, res) {
  res.redirect(302, '/admin/datos');
});

app.use('/admin', function(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}, express.static(path.join(__dirname, 'admin-web'), { index: false }));

// Error handler (debe ir al final, después de todas las rutas)
app.use(errorHandler);

// Iniciar servidor
app.listen(PORT, HOST, () => {
  console.log("🚀 Servidor ejecutándose en puerto", PORT);
  console.log("🌐 Host:", HOST);
  console.log("💚 Health check: http://localhost:" + PORT + "/api/health");
  console.log("📊 Panel admin (solo Administrador): http://localhost:" + PORT + "/admin");
  console.log("🔒 Seguridad: Helmet activado, Rate limiting activado");
});
