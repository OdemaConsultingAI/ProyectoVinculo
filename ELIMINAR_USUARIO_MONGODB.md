# Cómo Eliminar un Usuario desde MongoDB Atlas

## Método 1: Desde MongoDB Atlas Web Interface (Más Fácil)

### Paso 1: Acceder a MongoDB Atlas
1. Ve a [https://cloud.mongodb.com](https://cloud.mongodb.com)
2. Inicia sesión con tu cuenta
3. Selecciona tu cluster: **ClusterVinculo**

### Paso 2: Abrir MongoDB Shell o Browse Collections
1. En el panel izquierdo, haz clic en **"Browse Collections"** (o "Collections")
2. Selecciona la base de datos: **vinculosDB**
3. Busca la colección: **usuarios** (o **users** dependiendo de cómo Mongoose la haya creado)

### Paso 3: Buscar el Usuario
1. En la colección de usuarios, busca el usuario que quieres eliminar
2. Puedes usar el filtro de búsqueda para encontrar por:
   - Email: `{"email": "usuario@ejemplo.com"}`
   - Nombre: `{"nombre": "Nombre del Usuario"}`

### Paso 4: Eliminar el Usuario
1. Haz clic en el documento del usuario que quieres eliminar
2. Haz clic en el botón **"Delete"** (🗑️) en la parte superior
3. Confirma la eliminación

## Método 2: Usando MongoDB Compass (Cliente Desktop)

### Paso 1: Instalar MongoDB Compass
1. Descarga desde: [https://www.mongodb.com/try/download/compass](https://www.mongodb.com/try/download/compass)
2. Instala y abre MongoDB Compass

### Paso 2: Conectar a MongoDB Atlas
1. Obtén tu connection string desde MongoDB Atlas:
   - Ve a tu cluster → **"Connect"** → **"Connect your application"**
   - Copia la connection string (debería ser algo como):
     ```
     mongodb+srv://ag_db_user:r8d8n60M8ucOeEzw@clustervinculo.0foy93k.mongodb.net/vinculosDB
     ```
2. Pega la connection string en MongoDB Compass
3. Haz clic en **"Connect"**

### Paso 3: Navegar y Eliminar
1. Navega a: **vinculosDB** → **usuarios**
2. Busca el usuario que quieres eliminar
3. Haz clic derecho en el documento → **"Delete Document"**
4. Confirma la eliminación

## Método 3: Usando MongoDB Shell (mongo shell)

### Paso 1: Conectar desde Terminal
```bash
# Conectar a MongoDB Atlas usando mongo shell
mongosh "mongodb+srv://ag_db_user:r8d8n60M8ucOeEzw@clustervinculo.0foy93k.mongodb.net/vinculosDB"
```

### Paso 2: Buscar el Usuario
```javascript
// Ver todos los usuarios
db.usuarios.find().pretty()

// Buscar por email
db.usuarios.find({ email: "usuario@ejemplo.com" }).pretty()

// Buscar por nombre
db.usuarios.find({ nombre: "Nombre del Usuario" }).pretty()
```

### Paso 3: Eliminar el Usuario
```javascript
// Eliminar por email
db.usuarios.deleteOne({ email: "usuario@ejemplo.com" })

// Eliminar por _id (si conoces el ID)
db.usuarios.deleteOne({ _id: ObjectId("ID_DEL_USUARIO") })

// Verificar que se eliminó
db.usuarios.find({ email: "usuario@ejemplo.com" })
```

## Método 4: Eliminar Usuario y Sus Contactos (Script Node.js)

Si quieres eliminar un usuario Y todos sus contactos asociados, puedes crear un script:

### Crear archivo: `backend/scripts/eliminarUsuario.js`

```javascript
require('dotenv').config();
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const Contacto = require('../models/Contacto');

const MONGODB_URI = process.env.MONGODB_URI;

async function eliminarUsuario(email) {
  try {
    // Conectar a MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Buscar el usuario
    const usuario = await Usuario.findOne({ email: email.toLowerCase() });
    
    if (!usuario) {
      console.log('❌ Usuario no encontrado');
      return;
    }

    console.log(`📧 Usuario encontrado: ${usuario.nombre} (${usuario.email})`);

    // Eliminar todos los contactos del usuario
    const resultadoContactos = await Contacto.deleteMany({ usuarioId: usuario._id });
    console.log(`🗑️  Contactos eliminados: ${resultadoContactos.deletedCount}`);

    // Eliminar el usuario
    await Usuario.deleteOne({ _id: usuario._id });
    console.log('✅ Usuario eliminado exitosamente');

    // Cerrar conexión
    await mongoose.connection.close();
    console.log('👋 Conexión cerrada');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Obtener email desde argumentos de línea de comandos
const email = process.argv[2];

if (!email) {
  console.log('❌ Por favor proporciona un email:');
  console.log('   node eliminarUsuario.js usuario@ejemplo.com');
  process.exit(1);
}

eliminarUsuario(email);
```

### Ejecutar el script:
```bash
cd backend
node scripts/eliminarUsuario.js usuario@ejemplo.com
```

## Método 5: Desde la App (Agregar Endpoint de Admin)

Si quieres agregar esta funcionalidad directamente desde la app, puedes crear un endpoint de administración:

### En `backend/index.js`:

```javascript
// DELETE - Eliminar usuario (requiere autenticación y ser admin o el mismo usuario)
app.delete('/api/auth/user/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user.id;

    // Solo puede eliminar su propia cuenta
    if (userId !== currentUserId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este usuario' });
    }

    // Eliminar todos los contactos del usuario
    await Contacto.deleteMany({ usuarioId: userId });

    // Eliminar el usuario
    await Usuario.findByIdAndDelete(userId);

    res.json({ message: 'Usuario y contactos eliminados exitosamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## ⚠️ Importante: Verificar Nombre de la Colección

Mongoose puede crear la colección con diferentes nombres. Verifica cuál es el nombre real:

1. En MongoDB Atlas, ve a **Browse Collections**
2. Busca colecciones que puedan ser usuarios:
   - `usuarios` (plural en español)
   - `users` (plural en inglés)
   - `Usuario` (singular, si Mongoose no pluralizó)

## 🔍 Verificar Usuarios Existentes

Para ver todos los usuarios registrados:

### Desde MongoDB Shell:
```javascript
use vinculosDB
db.usuarios.find().pretty()
```

### Desde MongoDB Compass:
- Navega a la colección y verás todos los documentos

## 📝 Notas

- **Eliminar usuario también elimina contactos**: Si eliminas un usuario, sus contactos quedarán huérfanos (con `usuarioId` que apunta a un usuario inexistente)
- **Backup recomendado**: Antes de eliminar, considera hacer un backup de los datos importantes
- **Cascada**: El script del Método 4 elimina automáticamente los contactos asociados

## 🆘 Si No Encuentras la Colección

Si no ves la colección de usuarios:

1. **Verifica que hayas creado al menos un usuario** desde la app
2. **Verifica el nombre de la base de datos**: Debe ser `vinculosDB`
3. **Busca en todas las colecciones**: A veces Mongoose crea nombres diferentes
4. **Revisa los logs del servidor**: Cuando se crea un usuario, deberías ver logs en la consola
