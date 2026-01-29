const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Contacto = require('./models/Contacto');

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://127.0.0.1:27017/vinculosDB')
  .then(() => {
    console.log("✅ Conexión a MongoDB exitosa");
    console.log("📊 Estado de conexión:", mongoose.connection.readyState === 1 ? "Conectado" : "Desconectado");
  })
  .catch(err => {
    console.error("❌ Error de MongoDB:", err);
  });

mongoose.connection.on('connected', () => {
  console.log('🔗 Mongoose conectado a MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Error de conexión Mongoose:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose desconectado');
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const estado = mongoose.connection.readyState;
    const estados = ['desconectado', 'conectando', 'conectado', 'desconectando'];
    res.json({
      estado: estados[estado] || 'desconocido',
      readyState: estado,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET - Obtener todos los contactos
app.get('/api/contacto', async (req, res) => {
  try {
    const contactos = await Contacto.find();
    res.json(contactos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Crear nuevo contacto
app.post('/api/contacto', async (req, res) => {
  try {
    const nuevoContacto = new Contacto(req.body);
    const guardado = await nuevoContacto.save();
    res.status(201).json(guardado);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'El teléfono ya existe' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT - Actualizar contacto
app.put('/api/contacto/:id', async (req, res) => {
  try {
    console.log('📝 PUT /api/contacto/:id - ID:', req.params.id);
    console.log('📦 Body recibido:', JSON.stringify(req.body, null, 2));
    
    // Buscar el contacto primero
    const contacto = await Contacto.findById(req.params.id);
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    
    // Si se está actualizando el array de tareas, procesarlo especialmente
    if (req.body.tareas !== undefined && Array.isArray(req.body.tareas)) {
      console.log('📋 Actualizando array de tareas, cantidad recibida:', req.body.tareas.length);
      
      // Convertir fechas de string a Date
      const tareasProcesadas = req.body.tareas.map(tarea => {
        const tareaActualizada = { ...tarea };
        if (tarea.fechaHoraCreacion) {
          tareaActualizada.fechaHoraCreacion = typeof tarea.fechaHoraCreacion === 'string' 
            ? new Date(tarea.fechaHoraCreacion) 
            : tarea.fechaHoraCreacion;
        }
        if (tarea.fechaHoraEjecucion) {
          tareaActualizada.fechaHoraEjecucion = typeof tarea.fechaHoraEjecucion === 'string' 
            ? new Date(tarea.fechaHoraEjecucion) 
            : tarea.fechaHoraEjecucion;
        }
        return tareaActualizada;
      });
      
      // Limpiar el array existente y agregar las nuevas tareas
      contacto.tareas = [];
      contacto.tareas.push(...tareasProcesadas);
      
      // Marcar el array como modificado para que Mongoose lo detecte
      contacto.markModified('tareas');
      
      console.log('📋 Tareas asignadas al contacto:', contacto.tareas.length);
      console.log('📋 Primera tarea antes de guardar:', contacto.tareas[0] ? {
        descripcion: contacto.tareas[0].descripcion,
        fechaHoraCreacion: contacto.tareas[0].fechaHoraCreacion,
        fechaHoraEjecucion: contacto.tareas[0].fechaHoraEjecucion
      } : 'No hay tareas');
    }
    
    // Si se está actualizando el array de interacciones
    if (req.body.interacciones !== undefined && Array.isArray(req.body.interacciones)) {
      const interaccionesProcesadas = req.body.interacciones.map(interaccion => {
        const interaccionActualizada = { ...interaccion };
        if (interaccion.fechaHora) {
          interaccionActualizada.fechaHora = typeof interaccion.fechaHora === 'string' 
            ? new Date(interaccion.fechaHora) 
            : interaccion.fechaHora;
        }
        return interaccionActualizada;
      });
      contacto.interacciones = [];
      contacto.interacciones.push(...interaccionesProcesadas);
      contacto.markModified('interacciones');
    }
    
    // Actualizar otros campos si vienen en el body (excepto tareas e interacciones que ya se procesaron)
    const otrosCampos = { ...req.body };
    delete otrosCampos.tareas;
    delete otrosCampos.interacciones;
    
    Object.keys(otrosCampos).forEach(key => {
      if (otrosCampos[key] !== undefined) {
        contacto[key] = otrosCampos[key];
      }
    });
    
    // Guardar el contacto
    const actualizado = await contacto.save();
    
    console.log('✅ Contacto actualizado');
    console.log('📋 Tareas después de guardar:', actualizado.tareas ? actualizado.tareas.length : 0);
    if (actualizado.tareas && actualizado.tareas.length > 0) {
      console.log('📋 Primera tarea guardada:', {
        descripcion: actualizado.tareas[0].descripcion,
        fechaHoraCreacion: actualizado.tareas[0].fechaHoraCreacion,
        fechaHoraEjecucion: actualizado.tareas[0].fechaHoraEjecucion
      });
    }
    
    res.json(actualizado);
  } catch (error) {
    console.error('❌ Error actualizando contacto:', error);
    console.error('❌ Stack:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

// DELETE - Eliminar contacto
app.delete('/api/contacto', async (req, res) => {
  try {
    const { telefono } = req.body;
    if (!telefono) {
      return res.status(400).json({ error: 'Teléfono requerido' });
    }
    const eliminado = await Contacto.findOneAndDelete({ telefono });
    if (!eliminado) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    res.json({ message: 'Contacto eliminado', contacto: eliminado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, HOST, () => {
  console.log("🚀 Servidor ejecutándose en puerto", PORT);
  console.log("🌐 Host:", HOST);
  console.log("💚 Health check: http://localhost:" + PORT + "/api/health");
});
