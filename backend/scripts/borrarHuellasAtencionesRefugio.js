/**
 * Borra todos los datos de Huellas, Atenciones y Mi Refugio:
 * - Huellas: vacía interacciones de todos los contactos
 * - Atenciones: vacía tareas de todos los contactos (y proximaTarea)
 * - Mi Refugio: elimina todos los desahogos
 * Uso: node scripts/borrarHuellasAtencionesRefugio.js
 * Requiere MONGODB_URI en .env (o variable de entorno).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

const Contacto = require(path.join(__dirname, '../models/Contacto'));
const Desahogo = require(path.join(__dirname, '../models/Desahogo'));

const MONGODB_URI = process.env.MONGODB_URI;

async function borrarTodo() {
  try {
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI no está configurado. Crea un .env en backend/ con MONGODB_URI=tu_uri');
      process.exit(1);
    }

    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado');

    // 1. Huellas: vaciar interacciones de todos los contactos
    const contactos = await Contacto.find({});
    let totalHuellas = 0;
    let totalAtenciones = 0;

    for (const contacto of contactos) {
      const nHuellas = (contacto.interacciones || []).length;
      const nAtenciones = (contacto.tareas || []).length;
      if (nHuellas > 0 || nAtenciones > 0) {
        contacto.interacciones = [];
        contacto.tareas = [];
        contacto.proximaTarea = '';
        contacto.fechaRecordatorio = null;
        contacto.markModified('interacciones');
        contacto.markModified('tareas');
        await contacto.save();
        totalHuellas += nHuellas;
        totalAtenciones += nAtenciones;
        if (nHuellas || nAtenciones) {
          console.log('   ', contacto.nombre, ':', nHuellas, 'huella(s),', nAtenciones, 'atención(es)');
        }
      }
    }

    // 2. Mi Refugio: eliminar todos los desahogos
    const resultDesahogos = await Desahogo.deleteMany({});
    const totalRefugio = resultDesahogos.deletedCount;

    console.log('---');
    console.log('✅ Huellas: se borraron', totalHuellas, 'interacción(es) en', contactos.length, 'contacto(s).');
    console.log('✅ Atenciones: se borraron', totalAtenciones, 'tarea(s).');
    console.log('✅ Mi Refugio: se borraron', totalRefugio, 'desahogo(s).');
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (mongoose.connection.readyState === 1) await mongoose.connection.close();
    process.exit(1);
  }
}

borrarTodo();
