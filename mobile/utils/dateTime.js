/**
 * Formato de hora en 12 horas con AM/PM (es-ES: "a. m." / "p. m.").
 * @param {Date|string|number} date - Fecha/hora (Date, ISO string o timestamp)
 * @returns {string} Ej: "2:30 p. m.", "9:00 a. m."
 */
export function formatTime12h(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/** Opciones para mostrar fecha + hora en 12h (reutilizable). */
export const LOCALE_DATE_ES = { day: 'numeric', month: 'short', year: 'numeric' };
export const LOCALE_TIME_12H_ES = { hour: '2-digit', minute: '2-digit', hour12: true };
