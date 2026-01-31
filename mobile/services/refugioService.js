/**
 * Servicio Mi Refugio: guardar y listar desahogos (notas de voz privadas con IA emocional).
 */
import { API_BASE_URL } from '../constants/config';
import { fetchWithAuth } from '../constants/api';

const REFUGIO_URL = `${API_BASE_URL}/api/refugio`;

/**
 * Guarda una nota temporal como desahogo. El backend transcribe, extrae emoción y guarda.
 * @param {string} tempId - ID de la nota temporal (voice-temp)
 * @returns {Promise<{ success: boolean, desahogo?: object, error?: string }>}
 */
export async function saveDesahogo(tempId) {
  if (!tempId || typeof tempId !== 'string') {
    return { success: false, error: 'Falta el ID de la nota.' };
  }
  try {
    const res = await fetchWithAuth(`${REFUGIO_URL}/desahogo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempId: tempId.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || res.statusText || 'No se pudo guardar.' };
    }
    const data = await res.json();
    return { success: true, desahogo: data.desahogo };
  } catch (e) {
    const isNetwork = !e.message || /red|conexión|network|timeout|fetch/i.test(String(e.message));
    return {
      success: false,
      error: isNetwork ? 'Error de conexión. Comprueba internet e intenta de nuevo.' : (e.message || 'No se pudo guardar.'),
    };
  }
}

/**
 * Lista los desahogos del usuario (sin audio; solo metadatos para la lista).
 * @returns {Promise<{ success: boolean, list?: Array<{ _id, transcription, emotion, resumenReflexivo, createdAt }>, error?: string }>}
 */
export async function getDesahogos() {
  try {
    const res = await fetchWithAuth(`${REFUGIO_URL}/desahogos`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || res.statusText || 'No se pudieron cargar.' };
    }
    const list = await res.json();
    return { success: true, list: Array.isArray(list) ? list : [] };
  } catch (e) {
    const isNetwork = !e.message || /red|conexión|network|timeout|fetch/i.test(String(e.message));
    return {
      success: false,
      list: [],
      error: isNetwork ? 'Error de conexión.' : (e.message || 'No se pudieron cargar.'),
    };
  }
}
