/**
 * Tipos de Gesto: lista única para la app.
 * Lo que está entre paréntesis NO se muestra en el filtro; la lista COMPLETA se pasa al backend
 * para que la IA clasifique las notas de voz (backend inyecta la lista completa en el prompt).
 * En filtros/chips se usa solo la parte "display" (sin paréntesis).
 *
 * Mantener en sync con backend/services/aiService.js TIPOS_DE_GESTO_FULL.
 */

/** Lista completa: texto con opcional (paréntesis). Se envía al backend para el prompt de IA. */
export const TIPOS_DE_GESTO_FULL = [
  'Llamar (para felicitar)',
  'Visitar (en persona)',
  'Enviar mensaje',
  'Cumpleaños',
  'Regalo',
  'Evento',
  'Otro'
];

/**
 * Parte visible en filtro/chips: texto antes del primer " (" o toda la cadena.
 * @param {string} full - Valor completo (p. ej. "Llamar (para felicitar)")
 * @returns {string} Parte para mostrar (p. ej. "Llamar")
 */
export function getDisplayPart(full) {
  if (typeof full !== 'string' || !full.trim()) return 'Otro';
  const idx = full.indexOf(' (');
  return idx > 0 ? full.slice(0, idx).trim() : full.trim();
}

/** Lista solo para mostrar en filtro (sin paréntesis). Usar en chips y desplegables. */
export const TIPOS_DE_GESTO_DISPLAY = TIPOS_DE_GESTO_FULL.map(getDisplayPart);
