/**
 * Borra todas las interacciones de un contacto por nombre.
 * Uso: node scripts/borrarInteraccionesContacto.js "mi amorcito"
 * Requiere MONGODB_URI en .env (o variable de entorno).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

const Contacto = require(path.join(__dirname, '../models/Contacto'));

const MONGODB_URI = process.env.MONGODB_URI;

async function borrarInteracciones(nombreContacto) {
  if (!nombreContacto || !nombreContacto.trim()) {
    console.log('Uso: node scripts/borrarInteraccionesContacto.js "nombre del contacto"');
    process.exit(1);
  }

  const nombre = nombreContacto.trim();

  try {
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI no está configurado. Crea un .env en backend/ con MONGODB_URI=tu_uri');
      process.exit(1);
    }

    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado');

    const contacto = await Contacto.findOne({
      nombre: { $regex: new RegExp('^' + nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
    });

    if (!contacto) {
      console.log('❌ No se encontró ningún contacto con nombre "' + nombre + '".');
      const ejemplos = await Contacto.find({}, 'nombre').limit(5);
      if (ejemplos.length) {
        console.log('   Algunos nombres en la base:', ejemplos.map(c => c.nombre).join(', '));
      }
      await mongoose.connection.close();
      process.exit(1);
    }

    const cantidad = (contacto.interacciones || []).length;
    contacto.interacciones = [];
    contacto.markModified('interacciones');
    await contacto.save();

    console.log('✅ Contacto:', contacto.nombre);
    console.log('   Se borraron', cantidad, 'interacción(es). Quedan 0.');
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (mongoose.connection.readyState === 1) await mongoose.connection.close();
    process.exit(1);
  }
}

const nombreArg = process.argv[2] || 'mi amorcito';
borrarInteracciones(nombreArg);
