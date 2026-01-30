/**
 * Util compartido para construir notificaciones a partir de contactos.
 * Usado por NotificationBell en todas las pantallas.
 */

export const FRECUENCIAS = {
  'Diario': 1,
  'Cada 2 días': 2,
  'Cada 3 días': 3,
  'Semanal': 7,
  'Cada 15 días': 15,
  'Mensual': 30,
  'Cada 2 meses': 60,
  'Cada 3 meses': 90,
  'Cada 6 meses': 180,
  'Anual': 365,
  'Cumpleaños': 'cumpleanos',
};

export function calcularDegradacion(contacto) {
  const frecuencia = contacto.frecuencia || 'Mensual';
  let diasEsperados = 30;

  if (frecuencia === 'Cumpleaños') {
    if (!contacto.fechaNacimiento) {
      return { nivel: 1, diasSinAtencion: 365, opacidad: 0.5, escala: 0.7, saturacion: 0.3 };
    }
    const partes = contacto.fechaNacimiento.split('/');
    if (partes.length < 2) {
      return { nivel: 1, diasSinAtencion: 365, opacidad: 0.5, escala: 0.7, saturacion: 0.3 };
    }
    const hoy = new Date();
    const mesCumple = parseInt(partes[1], 10) - 1;
    const diaCumple = parseInt(partes[0], 10);
    const anioActual = hoy.getFullYear();
    let proximoCumple = new Date(anioActual, mesCumple, diaCumple);
    if (proximoCumple < hoy) {
      proximoCumple = new Date(anioActual + 1, mesCumple, diaCumple);
    }
    const diasHastaCumple = Math.floor((proximoCumple - hoy) / (1000 * 60 * 60 * 24));
    if (diasHastaCumple <= 30) {
      const ratio = (30 - diasHastaCumple) / 30;
      return {
        nivel: ratio,
        diasSinAtencion: diasHastaCumple,
        opacidad: Math.max(0.6, 1 - ratio * 0.3),
        escala: Math.max(0.8, 1 - ratio * 0.15),
        saturacion: Math.max(0.5, 1 - ratio * 0.3),
      };
    }
    return { nivel: 0, diasSinAtencion: diasHastaCumple, opacidad: 1, escala: 1, saturacion: 1 };
  }

  diasEsperados = FRECUENCIAS[frecuencia] || 30;

  let ultimaInteraccion = null;
  if (contacto.fechaRecordatorio) {
    ultimaInteraccion = new Date(contacto.fechaRecordatorio);
  } else if (contacto.interacciones && contacto.interacciones.length > 0) {
    const interaccionesOrdenadas = contacto.interacciones
      .filter((i) => i.fechaHora)
      .sort((a, b) => new Date(b.fechaHora) - new Date(a.fechaHora));
    if (interaccionesOrdenadas.length > 0) {
      ultimaInteraccion = new Date(interaccionesOrdenadas[0].fechaHora);
    }
  }

  if (!ultimaInteraccion) {
    return { nivel: 1, diasSinAtencion: diasEsperados * 2, opacidad: 0.6, escala: 0.8, saturacion: 0.5 };
  }

  const hoy = new Date();
  const diasSinAtencion = Math.floor((hoy - ultimaInteraccion) / (1000 * 60 * 60 * 24));
  const ratio = diasSinAtencion / diasEsperados;
  const nivel = Math.min(ratio, 2.5) / 2.5;
  const opacidad = Math.max(0.55, 1 - nivel * 0.45);
  const escala = Math.max(0.75, 1 - nivel * 0.25);
  const saturacion = Math.max(0.4, 1 - nivel * 0.6);

  return { nivel, diasSinAtencion, opacidad, escala, saturacion };
}

export function buildNotificacionesFromContactos(contactos) {
  const notifs = [];
  const hoy = new Date();

  contactos.forEach((contacto) => {
    if (contacto.tareas && contacto.tareas.length > 0) {
      contacto.tareas.forEach((tarea) => {
        if (!tarea.completada && tarea.fechaHoraEjecucion) {
          const fechaEjecucion = new Date(tarea.fechaHoraEjecucion);
          const hoyTemp = new Date();
          hoyTemp.setHours(0, 0, 0, 0);
          fechaEjecucion.setHours(0, 0, 0, 0);
          const diasRestantes = Math.floor((fechaEjecucion - hoyTemp) / (1000 * 60 * 60 * 24));
          if (diasRestantes >= -7) {
            notifs.push({
              id: `tarea-${contacto._id}-${tarea.fechaHoraCreacion}`,
              tipo: 'tarea',
              prioridad: diasRestantes <= 0 ? 'urgente' : diasRestantes <= 3 ? 'alta' : 'media',
              titulo: `📋 ${tarea.clasificacion || 'Gesto'}`,
              descripcion: tarea.descripcion,
              contacto: contacto.nombre,
              contactoId: contacto._id,
              tarea,
              fechaEjecucion,
              diasRestantes,
              fechaCreacion: new Date(tarea.fechaHoraCreacion),
            });
          }
        }
      });
    }
  });

  contactos.forEach((contacto) => {
    const degradacion = calcularDegradacion(contacto);
    if (degradacion.nivel > 0.4) {
      notifs.push({
        id: `riego-${contacto._id}`,
        tipo: 'riego',
        prioridad: degradacion.nivel > 0.7 ? 'urgente' : degradacion.nivel > 0.5 ? 'alta' : 'media',
        titulo: '💧 Necesita atención',
        descripcion: `${contacto.nombre} no ha recibido atención en ${degradacion.diasSinAtencion} días`,
        contacto: contacto.nombre,
        contactoId: contacto._id,
        nivelDegradacion: degradacion.nivel,
        diasSinAtencion: degradacion.diasSinAtencion,
        fechaCreacion: new Date(),
      });
    }
  });

  contactos.forEach((contacto) => {
    if (contacto.fechaNacimiento) {
      const partes = contacto.fechaNacimiento.split('/');
      if (partes.length >= 2) {
        const mesCumple = parseInt(partes[1], 10) - 1;
        const diaCumple = parseInt(partes[0], 10);
        const anioActual = hoy.getFullYear();
        let proximoCumple = new Date(anioActual, mesCumple, diaCumple);
        if (proximoCumple < hoy) {
          proximoCumple = new Date(anioActual + 1, mesCumple, diaCumple);
        }
        const diasHastaCumple = Math.floor((proximoCumple - hoy) / (1000 * 60 * 60 * 24));
        if (diasHastaCumple >= 0 && diasHastaCumple <= 7) {
          notifs.push({
            id: `cumpleanos-${contacto._id}`,
            tipo: 'cumpleanos',
            prioridad: diasHastaCumple === 0 ? 'urgente' : 'alta',
            titulo: `🎂 ${diasHastaCumple === 0 ? '¡Hoy es su cumpleaños!' : `Cumpleaños en ${diasHastaCumple} día${diasHastaCumple > 1 ? 's' : ''}`}`,
            descripcion: `${contacto.nombre} cumple años ${diasHastaCumple === 0 ? 'hoy' : `en ${diasHastaCumple} día${diasHastaCumple > 1 ? 's' : ''}`}`,
            contacto: contacto.nombre,
            contactoId: contacto._id,
            fechaCumpleanos: proximoCumple,
            diasHastaCumple,
            fechaCreacion: new Date(),
          });
        }
      }
    }
  });

  const prioridadOrden = { urgente: 0, alta: 1, media: 2, baja: 3 };
  notifs.sort((a, b) => {
    if (prioridadOrden[a.prioridad] !== prioridadOrden[b.prioridad]) {
      return prioridadOrden[a.prioridad] - prioridadOrden[b.prioridad];
    }
    return a.fechaCreacion - b.fechaCreacion;
  });

  return notifs;
}
