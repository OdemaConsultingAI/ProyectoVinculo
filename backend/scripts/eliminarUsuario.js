require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Cargar modelos
const Usuario = require(path.join(__dirname, '../models/Usuario'));
const Contacto = require(path.join(__dirname, '../models/Contacto'));

const MONGODB_URI = process.env.MONGODB_URI;

async function eliminarUno(usuario) {
  const cantidadContactos = await Contacto.countDocuments({ usuarioId: usuario._id });
  if (cantidadContactos > 0) {
    const resultadoContactos = await Contacto.deleteMany({ usuarioId: usuario._id });
    console.log(`   🗑️  Contactos eliminados: ${resultadoContactos.deletedCount}`);
  }
  await Usuario.deleteOne({ _id: usuario._id });
  console.log(`   ✅ Usuario eliminado: ${usuario.email}`);
}

async function eliminarUsuario(email) {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    const usuario = await Usuario.findOne({ email: email.toLowerCase() });
    if (!usuario) {
      console.log('❌ Usuario no encontrado con email:', email);
      await mongoose.connection.close();
      return;
    }
    console.log(`\n📧 Usuario: ${usuario.nombre} (${usuario.email})`);
    await eliminarUno(usuario);
    await mongoose.connection.close();
    console.log('👋 Conexión cerrada\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (mongoose.connection.readyState === 1) await mongoose.connection.close();
    process.exit(1);
  }
}

/** Eliminar todos los usuarios cuyo nombre coincida (case-insensitive). */
async function eliminarPorNombre(nombre) {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    const usuarios = await Usuario.find({ nombre: new RegExp('^' + nombre.trim() + '$', 'i') });
    if (usuarios.length === 0) {
      console.log('❌ No hay usuarios con nombre:', nombre);
      await mongoose.connection.close();
      return;
    }
    console.log(`📋 Usuarios con nombre "${nombre}": ${usuarios.length}`);
    for (const u of usuarios) {
      console.log(`   Eliminando: ${u.nombre} (${u.email})`);
      await eliminarUno(u);
    }
    await mongoose.connection.close();
    console.log('\n👋 Conexión cerrada\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (mongoose.connection.readyState === 1) await mongoose.connection.close();
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
const arg2 = process.argv[3];

if (!comando) {
  console.log('📖 Uso del script:\n');
  console.log('   Listar usuarios:');
  console.log('   node scripts/eliminarUsuario.js listar\n');
  console.log('   Eliminar por email:');
  console.log('   node scripts/eliminarUsuario.js usuario@ejemplo.com\n');
  console.log('   Eliminar por nombre:');
  console.log('   node scripts/eliminarUsuario.js --nombre "Juana"\n');
  process.exit(0);
}

if (comando === 'listar' || comando === 'list') {
  listarUsuarios();
} else if (comando === '--nombre' || comando === '-n') {
  if (!arg2) {
    console.log('❌ Indica el nombre: node scripts/eliminarUsuario.js --nombre "Juana"');
    process.exit(1);
  }
  eliminarPorNombre(arg2);
} else {
  eliminarUsuario(comando);
}
