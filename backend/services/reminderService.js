/**
 * Etapa 3: Recordatorios push – gestos con fecha de ejecución hoy.
 * Agrupa por usuario y envía un push por usuario con resumen.
 */

const Contacto = require('../models/Contacto');
const Usuario = require('../models/Usuario');
const { sendPushToUser } = require('./pushService');

/**
 * Obtiene el inicio y fin del día en la zona horaria del servidor (UTC o local).
 * Por defecto usamos "hoy" en UTC para consistencia; puedes ajustar a la zona del usuario si la guardas.
 */
function getTodayRange() {
  const hoy = new Date();
  const inicio = new Date(hoy);
  inicio.setUTCHours(0, 0, 0, 0);
  const fin = new Date(hoy);
  fin.setUTCHours(23, 59, 59, 999);
  return { inicio, fin };
}

/**
 * Busca contactos que tengan al menos una tarea no completada con fechaHoraEjecucion hoy.
 * Devuelve array de { usuarioId, contactos: [ { nombre, tareasHoy: [ { descripcion, clasificacion } ] } ] }.
 */
async function getGestosHoyPorUsuario() {
  const { inicio, fin } = getTodayRange();

  const contactos = await Contacto.find({
    'tareas.0': { $exists: true },
    'tareas.fechaHoraEjecucion': { $gte: inicio, $lte: fin },
    'tareas.completada': false,
  })
    .select('usuarioId nombre tareas _id')
    .lean();

  const porUsuario = new Map(); // usuarioId -> { contactos: [] }

  for (const c of contactos) {
    const tareasHoy = (c.tareas || []).filter((t) => {
      if (t.completada) return false;
      const fe = t.fechaHoraEjecucion ? new Date(t.fechaHoraEjecucion) : null;
      if (!fe) return false;
      return fe >= inicio && fe <= fin;
    });
    if (tareasHoy.length === 0) continue;

    const nombre = c.nombre || 'Contacto';
    const items = tareasHoy.map((t) => ({
      descripcion: (t.descripcion || '').trim() || '(sin descripción)',
      clasificacion: t.clasificacion || 'Gesto',
    }));

    if (!porUsuario.has(c.usuarioId.toString())) {
      porUsuario.set(c.usuarioId.toString(), { contactos: [] });
    }
    porUsuario.get(c.usuarioId.toString()).contactos.push({
      contactoId: c._id?.toString(),
      nombre,
      tareasHoy: items,
    });
  }

  return Array.from(porUsuario.entries()).map(([usuarioId, data]) => ({
    usuarioId,
    contactos: data.contactos,
  }));
}

/**
 * Envía un push de recordatorio a cada usuario que tenga gestos hoy.
 * @returns { Promise<{ sent: number, failed: number, details: Array<{ usuarioId, success: boolean, message?: string }> }> }
 */
async function sendRemindersGestosHoy() {
  const list = await getGestosHoyPorUsuario();
  const details = [];
  let sent = 0;
  let failed = 0;

  for (const { usuarioId, contactos } of list) {
    const totalGestos = contactos.reduce((acc, c) => acc + c.tareasHoy.length, 0);
    if (totalGestos === 0) continue;

    const usuario = await Usuario.findById(usuarioId);
    if (!usuario || !usuario.expoPushTokens || usuario.expoPushTokens.length === 0) {
      details.push({ usuarioId, success: false, message: 'Usuario sin tokens' });
      failed++;
      continue;
    }

    const titulos = [];
    for (const c of contactos) {
      for (const t of c.tareasHoy) {
        titulos.push(`${t.clasificacion}: ${c.nombre}`);
      }
    }
    const title = totalGestos === 1
      ? 'Una huella pendiente hoy'
      : `${totalGestos} huellas pendientes hoy`;
    const body = titulos.slice(0, 3).join(' · ');
    const bodyFinal = titulos.length > 3 ? `${body} y ${titulos.length - 3} más` : body;

    try {
      const primerContactoId = contactos[0]?.contactoId || null;
      const result = await sendPushToUser(usuario, {
        title: `Vínculo – ${title}`,
        body: bodyFinal,
        data: {
          tipo: 'gesto',
          contactoId: primerContactoId,
          fecha: new Date().toISOString().slice(0, 10),
        },
      });
      if (result.success > 0) {
        sent++;
        details.push({ usuarioId, success: true });
      } else {
        failed++;
        details.push({ usuarioId, success: false, message: 'Envío fallido' });
      }
    } catch (err) {
      failed++;
      details.push({ usuarioId, success: false, message: err?.message || 'Error' });
    }
  }

  return { sent, failed, details };
}

module.exports = {
  getTodayRange,
  getGestosHoyPorUsuario,
  sendRemindersGestosHoy,
};
