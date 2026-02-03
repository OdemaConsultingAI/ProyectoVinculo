/**
 * Crea un usuario en la base de datos con contraseña temporal.
 * Uso: node scripts/crearUsuario.js "Yesenia" "yelite01@hotmail.com"
 * La contraseña temporal se muestra al final; el usuario puede cambiarla desde la app (Configuración).
 * Requiere MONGODB_URI en .env
 */
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

const Usuario = require(path.join(__dirname, '../models/Usuario'));

const MONGODB_URI = process.env.MONGODB_URI;

const PASSWORD_TEMPORAL = 'Cambiar123';

async function crearUsuario(nombre, email) {
  try {
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI no está configurado. Crea un .env en backend/ con MONGODB_URI=tu_uri');
      process.exit(1);
    }

    const nombreTrim = (nombre || '').trim();
    const emailTrim = (email || '').trim().toLowerCase();

    if (!nombreTrim || !emailTrim) {
      console.log('Uso: node scripts/crearUsuario.js "Nombre" "correo@ejemplo.com"');
      process.exit(1);
    }

    if (!/^\S+@\S+\.\S+$/.test(emailTrim)) {
      console.error('❌ Email inválido:', emailTrim);
      process.exit(1);
    }

    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado');

    const existente = await Usuario.findOne({ email: emailTrim });
    if (existente) {
      console.log('❌ Ya existe un usuario con ese correo:', emailTrim);
      console.log('   Nombre actual:', existente.nombre);
      await mongoose.connection.close();
      process.exit(1);
    }

    const usuario = await Usuario.create({
      nombre: nombreTrim,
      email: emailTrim,
      password: PASSWORD_TEMPORAL,
    });

    console.log('---');
    console.log('✅ Usuario creado');
    console.log('   Nombre:', usuario.nombre);
    console.log('   Email:', usuario.email);
    console.log('   Contraseña temporal:', PASSWORD_TEMPORAL);
    console.log('---');
    console.log('Indica a la usuaria que entre a la app con ese correo y contraseña,');
    console.log('y que cambie la contraseña en Configuración cuando quiera.');
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (mongoose.connection.readyState === 1) await mongoose.connection.close();
    process.exit(1);
  }
}

const nombreArg = process.argv[2] || 'Yesenia';
const emailArg = process.argv[3] || 'yelite01@hotmail.com';
crearUsuario(nombreArg, emailArg);
