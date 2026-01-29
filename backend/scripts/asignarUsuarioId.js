require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Cargar modelos
const Usuario = require(path.join(__dirname, '../models/Usuario'));
const Contacto = require(path.join(__dirname, '../models/Contacto'));

const MONGODB_URI = process.env.MONGODB_URI;

async function asignarUsuarioId(email) {
  try {
    // Conectar a MongoDB
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Buscar el usuario
    const usuario = await Usuario.findOne({ email: email.toLowerCase() });
    
    if (!usuario) {
      console.log('❌ Usuario no encontrado con email:', email);
      await mongoose.connection.close();
      process.exit(1);
      return;
    }

    console.log(`📧 Usuario encontrado:`);
    console.log(`   Nombre: ${usuario.nombre}`);
    console.log(`   Email: ${usuario.email}`);
    console.log(`   ID: ${usuario._id}\n`);

    // Buscar contactos sin usuarioId o con usuarioId diferente
    const contactosSinUsuario = await Contacto.find({
      $or: [
        { usuarioId: { $exists: false } },
        { usuarioId: null },
        { usuarioId: { $ne: usuario._id } }
      ]
    });

    console.log(`📊 Contactos encontrados sin usuarioId o con usuarioId diferente: ${contactosSinUsuario.length}\n`);

    if (contactosSinUsuario.length === 0) {
      console.log('✅ Todos los contactos ya tienen el usuarioId correcto asignado');
      await mongoose.connection.close();
      return;
    }

    // Mostrar algunos contactos antes de actualizar
    console.log('📋 Primeros contactos a actualizar:');
    contactosSinUsuario.slice(0, 5).forEach((contacto, index) => {
      console.log(`   ${index + 1}. ${contacto.nombre} - Tel: ${contacto.telefono}`);
      console.log(`      UsuarioId actual: ${contacto.usuarioId || 'NO ASIGNADO'}`);
    });
    if (contactosSinUsuario.length > 5) {
      console.log(`   ... y ${contactosSinUsuario.length - 5} más\n`);
    } else {
      console.log('');
    }

    // Actualizar todos los contactos con el usuarioId del usuario
    const resultado = await Contacto.updateMany(
      {
        $or: [
          { usuarioId: { $exists: false } },
          { usuarioId: null },
          { usuarioId: { $ne: usuario._id } }
        ]
      },
      {
        $set: { usuarioId: usuario._id }
      }
    );

    console.log(`✅ Contactos actualizados: ${resultado.modifiedCount}`);
    console.log(`📊 Total de contactos procesados: ${resultado.matchedCount}\n`);

    // Verificar que se actualizaron correctamente
    const contactosActualizados = await Contacto.find({ usuarioId: usuario._id });
    console.log(`✅ Total de contactos ahora asociados al usuario: ${contactosActualizados.length}\n`);

    // Cerrar conexión
    await mongoose.connection.close();
    console.log('👋 Conexión cerrada\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Función para listar contactos sin usuarioId
async function listarContactosSinUsuario() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    const contactosSinUsuario = await Contacto.find({
      $or: [
        { usuarioId: { $exists: false } },
        { usuarioId: null }
      ]
    }).limit(20);

    if (contactosSinUsuario.length === 0) {
      console.log('✅ Todos los contactos tienen usuarioId asignado');
    } else {
      console.log(`📋 Contactos sin usuarioId: ${contactosSinUsuario.length}\n`);
      contactosSinUsuario.forEach((contacto, index) => {
        console.log(`${index + 1}. ${contacto.nombre}`);
        console.log(`   Tel: ${contacto.telefono}`);
        console.log(`   UsuarioId: ${contacto.usuarioId || 'NO ASIGNADO'}\n`);
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

if (!comando) {
  console.log('📖 Uso del script:\n');
  console.log('   Listar contactos sin usuarioId:');
  console.log('   node scripts/asignarUsuarioId.js listar\n');
  console.log('   Asignar usuarioId a contactos:');
  console.log('   node scripts/asignarUsuarioId.js asignar usuario@ejemplo.com\n');
  process.exit(0);
}

if (comando === 'listar' || comando === 'list') {
  listarContactosSinUsuario();
} else if (comando === 'asignar' || comando === 'update') {
  if (!email) {
    console.log('❌ Error: Debes proporcionar el email del usuario');
    console.log('   Uso: node scripts/asignarUsuarioId.js asignar usuario@ejemplo.com\n');
    process.exit(1);
  }
  asignarUsuarioId(email);
} else {
  console.log('❌ Comando no reconocido. Usa "listar" o "asignar"');
  process.exit(1);
}
