const mongoose = require('mongoose');

const contactoSchema = new mongoose.Schema({
  usuarioId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Usuario', 
    required: true,
    index: true // Índice para mejorar búsquedas por usuario
  },
  nombre: { type: String, required: true },
  telefono: { type: String, required: true },
  prioridad: { type: String, default: '✨ Media' },
  frecuencia: { type: String, default: 'Mensual' },
  clasificacion: { type: String, default: 'Amigo' },
  foto: { type: String, default: '' },
  fechaNacimiento: { type: String, default: '' },
  proximaTarea: { type: String, default: '' },
  fechaRecordatorio: { type: Date, default: null },
  interacciones: [{
    fechaHora: { type: Date, default: Date.now },
    descripcion: String
  }],
  tareas: [{
    fechaHoraCreacion: { type: Date, default: Date.now },
    descripcion: String, // Notas de la tarea (puede ser diferente a la interacción)
    fechaHoraEjecucion: Date,
    clasificacion: String, // 'Llamar', 'Visitar', 'Enviar mensaje', 'Cumpleaños', etc.
    completada: { type: Boolean, default: false },
    fechaHoraCompletado: Date, // Fecha y hora cuando se completó la tarea
    interaccionRelacionada: String, // ID o referencia a la interacción relacionada (opcional)
    // Recurrencia: ej. cumpleaños anual
    recurrencia: {
      tipo: { type: String, enum: ['anual', 'mensual'], default: null },
      fechaBase: Date // Para anual: mes/día que se repite cada año
    },
    completadoParaAno: [Number] // Años en que se completó (para recurrentes)
  }]
}, {
  timestamps: true
});

// Índice compuesto para asegurar que un usuario no tenga contactos duplicados por teléfono
contactoSchema.index({ usuarioId: 1, telefono: 1 }, { unique: true });

module.exports = mongoose.model('Contacto', contactoSchema);
