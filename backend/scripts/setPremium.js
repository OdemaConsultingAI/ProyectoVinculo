/**
 * Script para pasar un usuario a plan Premium (elimina restricción de IA/interacciones).
 * Uso: node scripts/setPremium.js <email>
 * Ejemplo: node scripts/setPremium.js agonzalezc80@gmail.com
 * Requiere MONGODB_URI en .env (o variable de entorno).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

const Usuario = require(path.join(__dirname, '../models/Usuario'));

const MONGODB_URI = process.env.MONGODB_URI;

async function setPremium(email) {
  if (!email || !email.trim()) {
    console.error('Uso: node scripts/setPremium.js <email>');
    console.error('Ejemplo: node scripts/setPremium.js agonzalezc80@gmail.com');
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

    if (usuario.plan === 'Premium') {
      console.log('✅ El usuario ya tiene plan Premium:', emailNorm);
      await mongoose.disconnect();
      process.exit(0);
    }

    usuario.plan = 'Premium';
    await usuario.save();
    console.log('✅ Plan actualizado a Premium para:', emailNorm);
    console.log('   Nombre:', usuario.nombre);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

const email = process.argv[2] || 'agonzalezc80@gmail.com';
setPremium(email);
