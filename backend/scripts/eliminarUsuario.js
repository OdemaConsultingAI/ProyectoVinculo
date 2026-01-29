require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Cargar modelos
const Usuario = require(path.join(__dirname, '../models/Usuario'));
const Contacto = require(path.join(__dirname, '../models/Contacto'));

const MONGODB_URI = process.env.MONGODB_URI;

async function eliminarUsuario(email) {
  try {
    // Conectar a MongoDB
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Buscar el usuario
    const usuario = await Usuario.findOne({ email: email.toLowerCase() });
    
    if (!usuario) {
      console.log('❌ Usuario no encontrado con email:', email);
      await mongoose.connection.close();
      return;
    }

    console.log(`\n📧 Usuario encontrado:`);
    console.log(`   Nombre: ${usuario.nombre}`);
    console.log(`   Email: ${usuario.email}`);
    console.log(`   ID: ${usuario._id}`);

    // Contar contactos del usuario
    const cantidadContactos = await Contacto.countDocuments({ usuarioId: usuario._id });
    console.log(`\n📊 Contactos asociados: ${cantidadContactos}`);

    // Eliminar todos los contactos del usuario
    if (cantidadContactos > 0) {
      const resultadoContactos = await Contacto.deleteMany({ usuarioId: usuario._id });
      console.log(`🗑️  Contactos eliminados: ${resultadoContactos.deletedCount}`);
    }

    // Eliminar el usuario
    await Usuario.deleteOne({ _id: usuario._id });
    console.log('✅ Usuario eliminado exitosamente');

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

// Obtener comando desde argumentos
const comando = process.argv[2];

if (!comando) {
  console.log('📖 Uso del script:\n');
  console.log('   Listar usuarios:');
  console.log('   node scripts/eliminarUsuario.js listar\n');
  console.log('   Eliminar usuario:');
  console.log('   node scripts/eliminarUsuario.js usuario@ejemplo.com\n');
  process.exit(0);
}

if (comando === 'listar' || comando === 'list') {
  listarUsuarios();
} else {
  eliminarUsuario(comando);
}
