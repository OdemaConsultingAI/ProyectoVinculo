const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const usuarioSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Por favor ingresa un email válido']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  plan: {
    type: String,
    enum: ['Free', 'Premium', 'Administrador'],
    default: 'Free'
  },
  fechaRegistro: {
    type: Date,
    default: Date.now
  },
  lastLoginAt: { type: Date, default: null },
  // Control de uso de IA: Free 20/día; Premium y Administrador sin límite
  aiPeticionesHoy: { type: Number, default: 0 },
  aiUltimoResetFecha: { type: Date, default: null },
  aiPeticionesMes: { type: Number, default: 0 },
  aiUltimoResetMes: { type: Date, default: null },
  aiEstimatedCostUsd: { type: Number, default: 0 },
  // Etapa 2 push: tokens Expo para enviar notificaciones (varios dispositivos)
  expoPushTokens: { type: [String], default: [] }
}, {
  timestamps: true
});

// Hash de password antes de guardar
usuarioSchema.pre('save', async function() {
  // Si la contraseña no fue modificada, no hacer nada
  if (!this.isModified('password')) {
    return;
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

// Método para comparar passwords
usuarioSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Método para obtener datos públicos (sin password)
usuarioSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Usuario', usuarioSchema);
