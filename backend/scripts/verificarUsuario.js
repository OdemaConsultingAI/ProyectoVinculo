require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

// Cargar modelos
const Usuario = require(path.join(__dirname, '../models/Usuario'));

const MONGODB_URI = process.env.MONGODB_URI;

async function verificarUsuario(email, password) {
  try {
    console.log('═══════════════════════════════════════');
    console.log('🔍 VERIFICACIÓN DE USUARIO');
    console.log('═══════════════════════════════════════');
    
    // Mostrar qué base de datos se está usando
    console.log('\n📊 MONGODB_URI:', MONGODB_URI ? MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'NO CONFIGURADA');
    console.log('📧 Email a verificar:', email);
    console.log('🔑 Contraseña a probar:', password ? '***' : 'NO PROPORCIONADA');
    
    // Conectar a MongoDB
    console.log('\n🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
    console.log('📊 Base de datos:', mongoose.connection.name);
    console.log('🌐 Host:', mongoose.connection.host);

    // Normalizar email (igual que en el backend)
    const emailNormalizado = email.toLowerCase().trim();
    console.log('\n📧 Email normalizado:', emailNormalizado);

    // Buscar el usuario
    const usuario = await Usuario.findOne({ email: emailNormalizado });
    
    if (!usuario) {
      console.log('\n❌ Usuario NO encontrado con email:', emailNormalizado);
      console.log('\n💡 Posibles causas:');
      console.log('   1. El usuario no existe en esta base de datos');
      console.log('   2. El email tiene un formato diferente');
      console.log('   3. Estás conectado a una base de datos diferente');
      
      // Listar algunos usuarios para referencia
      const usuarios = await Usuario.find({}, 'email nombre').limit(5);
      if (usuarios.length > 0) {
        console.log('\n📋 Usuarios existentes en esta base de datos:');
        usuarios.forEach((u, i) => {
          console.log(`   ${i + 1}. ${u.email} (${u.nombre})`);
        });
      } else {
        console.log('\n📭 No hay usuarios en esta base de datos');
      }
      
      await mongoose.connection.close();
      process.exit(1);
      return;
    }

    console.log('\n✅ Usuario encontrado:');
    console.log(`   Nombre: ${usuario.nombre}`);
    console.log(`   Email: ${usuario.email}`);
    console.log(`   ID: ${usuario._id}`);
    console.log(`   Plan: ${usuario.plan || 'Free'}`);
    console.log(`   Registrado: ${new Date(usuario.fechaRegistro).toLocaleString()}`);

    // Verificar contraseña si se proporcionó
    if (password) {
      const passwordTrimmed = password.trim();
      console.log('\n🔐 Verificando contraseña...');
      
      const passwordValido = await usuario.comparePassword(passwordTrimmed);
      
      if (passwordValido) {
        console.log('✅ Contraseña CORRECTA');
      } else {
        console.log('❌ Contraseña INCORRECTA');
        console.log('\n💡 La contraseña en la base de datos no coincide con la proporcionada');
        console.log('   Puedes resetearla con:');
        console.log(`   node scripts/restablecerPassword.js restablecer ${emailNormalizado} nuevaPassword123`);
      }
    } else {
      console.log('\n⚠️  No se proporcionó contraseña para verificar');
      console.log('   Para verificar contraseña, usa:');
      console.log(`   node scripts/verificarUsuario.js ${emailNormalizado} tuPassword`);
    }

    // Cerrar conexión
    await mongoose.connection.close();
    console.log('\n👋 Conexión cerrada\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Obtener argumentos desde la línea de comandos
const email = process.argv[2];
const password = process.argv[3];

if (!email) {
  console.log('📖 Uso del script:\n');
  console.log('   Verificar usuario (sin probar contraseña):');
  console.log('   node scripts/verificarUsuario.js usuario@ejemplo.com\n');
  console.log('   Verificar usuario y contraseña:');
  console.log('   node scripts/verificarUsuario.js usuario@ejemplo.com tuPassword\n');
  process.exit(0);
}

verificarUsuario(email, password);
