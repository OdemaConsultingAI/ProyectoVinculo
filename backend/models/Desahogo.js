const mongoose = require('mongoose');

/** Etiquetas emocionales para Mi Refugio (desahogo). La IA solo clasifica; la transcripción se guarda completa. */
const ETIQUETAS_EMOCIONALES = ['Calma', 'Estrés', 'Gratitud', 'Tristeza', 'Alegre', 'Depresivo'];

const desahogoSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
    index: true
  },
  /** Transcripción del audio (Whisper). */
  transcription: { type: String, required: true },
  /** Etiqueta emocional (IA solo clasifica emotividad; no modifica ni resume el texto). */
  emotion: {
    type: String,
    enum: ETIQUETAS_EMOCIONALES,
    default: 'Calma'
  },
  /** No se usa: la transcripción se muestra completa; la IA solo clasifica emoción. */
  resumenReflexivo: { type: String, default: '' },
  /** Audio en base64 para Escucha Retrospectiva. */
  audioBase64: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, required: true }
}, {
  timestamps: false,
  collection: 'desahogos'
});

desahogoSchema.index({ usuarioId: 1, createdAt: -1 });

module.exports = mongoose.model('Desahogo', desahogoSchema);
module.exports.ETIQUETAS_EMOCIONALES = ETIQUETAS_EMOCIONALES;
