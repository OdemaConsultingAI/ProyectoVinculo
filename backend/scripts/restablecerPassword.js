require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

// Cargar modelos
const Usuario = require(path.join(__dirname, '../models/Usuario'));

const MONGODB_URI = process.env.MONGODB_URI;

async function restablecerPassword(email, nuevaPassword) {
  try {
    // Validar que se proporcionó una contraseña
    if (!nuevaPassword || nuevaPassword.length < 6) {
      console.log('❌ La contraseña debe tener al menos 6 caracteres');
      process.exit(1);
      return;
    }

    // Conectar a MongoDB
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Buscar el usuario
    const usuario = await Usuario.findOne({ email: email.toLowerCase() });
    
    if (!usuario) {
      console.log('❌ Usuario no encontrado con email:', email);
      await mongoose.connection.close();
      process.exit(1);
      return;
    }

    console.log(`\n📧 Usuario encontrado:`);
    console.log(`   Nombre: ${usuario.nombre}`);
    console.log(`   Email: ${usuario.email}`);
    console.log(`   ID: ${usuario._id}`);

    // Hashear la nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(nuevaPassword, salt);

    // Actualizar la contraseña directamente en la base de datos
    // (bypass del hook pre-save para evitar doble hash)
    await Usuario.updateOne(
      { _id: usuario._id },
      { $set: { password: passwordHash } }
    );

    console.log('\n✅ Contraseña restablecida exitosamente');
    console.log(`📝 Nueva contraseña: ${nuevaPassword}`);
    console.log('\n⚠️  IMPORTANTE: Guarda esta contraseña de forma segura');

    // Cerrar conexión
    await mongoose.connection.close();
    console.log('👋 Conexión cerrada\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Función para listar todos los usuarios
async function listarUsuarios() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    const usuarios = await Usuario.find({}, 'nombre email fechaRegistro').sort({ fechaRegistro: -1 });
    
    if (usuarios.length === 0) {
      console.log('📭 No hay usuarios registrados');
    } else {
      console.log(`📋 Usuarios encontrados: ${usuarios.length}\n`);
      usuarios.forEach((usuario, index) => {
        console.log(`${index + 1}. ${usuario.nombre}`);
        console.log(`   Email: ${usuario.email}`);
        console.log(`   Registrado: ${new Date(usuario.fechaRegistro).toLocaleDateString()}`);
        console.log(`   ID: ${usuario._id}\n`);
      });
    }

    await mongoose.connection.close();
    console.log('👋 Conexión cerrada\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Obtener argumentos desde la línea de comandos
const comando = process.argv[2];
const email = process.argv[3];
const password = process.argv[4];

if (!comando) {
  console.log('📖 Uso del script:\n');
  console.log('   Listar usuarios:');
  console.log('   node scripts/restablecerPassword.js listar\n');
  console.log('   Restablecer contraseña:');
  console.log('   node scripts/restablecerPassword.js restablecer usuario@ejemplo.com nuevaPassword123\n');
  process.exit(0);
}

if (comando === 'listar' || comando === 'list') {
  listarUsuarios();
} else if (comando === 'restablecer' || comando === 'reset') {
  if (!email || !password) {
    console.log('❌ Error: Debes proporcionar email y nueva contraseña');
    console.log('   Uso: node scripts/restablecerPassword.js restablecer usuario@ejemplo.com nuevaPassword123\n');
    process.exit(1);
  }
  restablecerPassword(email, password);
} else {
  console.log('❌ Comando no reconocido. Usa "listar" o "restablecer"');
  process.exit(1);
}
