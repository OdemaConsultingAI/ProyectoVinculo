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

/**
 * Icono (emoji), nombre Ionicons y color por tipo de gesto. action: 'call' | 'whatsapp' | null (otros sin enlace directo).
 */
export const GESTO_ICON_CONFIG = {
  'Llamar': { emoji: '📞', icon: 'call', color: '#34C759', action: 'call' },
  'Visitar': { emoji: '🏠', icon: 'home', color: '#FF9800', action: null },
  'Enviar mensaje': { emoji: '💬', icon: 'chatbubble', color: '#25D366', action: 'whatsapp' },
  'Cumpleaños': { emoji: '🎂', icon: 'gift', color: '#E91E63', action: null },
  'Regalo': { emoji: '🎁', icon: 'gift', color: '#9C27B0', action: null },
  'Evento': { emoji: '☕', icon: 'calendar', color: '#795548', action: null },
  'Otro': { emoji: '🤝', icon: 'ellipsis-horizontal', color: '#5A6C7D', action: null },
};
