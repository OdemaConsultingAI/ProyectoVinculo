/**
 * Script para asignar rol Administrador a un usuario (sin límite IA + acceso a Administrar).
 * Uso: node scripts/setAdministrador.js <email>
 * Ejemplo: node scripts/setAdministrador.js admin@ejemplo.com
 * Requiere MONGODB_URI en .env (o variable de entorno).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

const Usuario = require(path.join(__dirname, '../models/Usuario'));

const MONGODB_URI = process.env.MONGODB_URI;

async function setAdministrador(email) {
  if (!email || !email.trim()) {
    console.error('Uso: node scripts/setAdministrador.js <email>');
    console.error('Ejemplo: node scripts/setAdministrador.js admin@ejemplo.com');
    process.exit(1);
  }

  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI no está configurado. Configura .env o la variable de entorno.');
    process.exit(1);
  }

  try {
    console.log('Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Conectado.');

    const emailNorm = email.trim().toLowerCase();
    const usuario = await Usuario.findOne({ email: emailNorm });

    if (!usuario) {
      console.error('❌ Usuario no encontrado:', emailNorm);
      process.exit(1);
    }

    if (usuario.plan === 'Administrador') {
      console.log('✅ El usuario ya es Administrador:', emailNorm);
      await mongoose.disconnect();
      process.exit(0);
    }

    usuario.plan = 'Administrador';
    await usuario.save();
    console.log('✅ Rol actualizado a Administrador para:', emailNorm);
    console.log('   Nombre:', usuario.nombre);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

const email = process.argv[2];
setAdministrador(email);
