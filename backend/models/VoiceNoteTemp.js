const mongoose = require('mongoose');

/**
 * Notas de voz temporales: audio en base64.
 * Se borra al convertir a tarea/interacción o al cerrar el modal sin guardar.
 * TTL 24h por si el cliente no llega a borrar (sin dejar rastro prolongado).
 */
const voiceNoteTempSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
    index: true
  },
  audioBase64: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, required: true }
}, {
  timestamps: false,
  collection: 'voice_notes_temp'
});

// Borrado automático a las 24h por si falla el DELETE desde la app
voiceNoteTempSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model('VoiceNoteTemp', voiceNoteTempSchema);
