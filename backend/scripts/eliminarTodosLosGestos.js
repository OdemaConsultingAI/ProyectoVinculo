/**
 * Elimina todos los gestos (tareas) de todos los contactos en la base de datos.
 * Uso: node scripts/eliminarTodosLosGestos.js
 * Requiere MONGODB_URI en .env (o variable de entorno).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

const Contacto = require(path.join(__dirname, '../models/Contacto'));

const MONGODB_URI = process.env.MONGODB_URI;

async function eliminarTodosLosGestos() {
  try {
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI no está configurado. Crea un .env en backend/ con MONGODB_URI=tu_uri');
      process.exit(1);
    }

    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado');

    const contactos = await Contacto.find({});
    let totalGestos = 0;

    for (const contacto of contactos) {
      const n = (contacto.tareas || []).length;
      if (n > 0) {
        contacto.tareas = [];
        contacto.proximaTarea = '';
        contacto.markModified('tareas');
        await contacto.save();
        totalGestos += n;
        console.log('   ', contacto.nombre, ':', n, 'gesto(s) eliminado(s)');
      }
    }

    console.log('✅ Listo. Contactos revisados:', contactos.length);
    console.log('   Total de gestos eliminados:', totalGestos);
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (mongoose.connection.readyState === 1) await mongoose.connection.close();
    process.exit(1);
  }
}

eliminarTodosLosGestos();
