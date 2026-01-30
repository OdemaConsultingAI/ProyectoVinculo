/**
 * Etapa 2b: Envío de notificaciones push vía Expo Push API.
 * Envía mensajes a uno o varios Expo Push Tokens.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Envía una notificación push a uno o varios tokens Expo.
 * @param {string[]} expoPushTokens - Array de tokens (ExponentPushToken[...])
 * @param {object} options - { title, body, data? }
 * @returns {Promise<{ success: number, failed: number, receipts?: object[] }>}
 */
async function sendPush(expoPushTokens, options = {}) {
  const { title = '', body = '', data = {} } = options;
  const tokens = Array.isArray(expoPushTokens) ? expoPushTokens : [expoPushTokens];
  const valid = tokens.filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken['));

  if (valid.length === 0) {
    return { success: 0, failed: tokens.length };
  }

  const messages = valid.map((to) => ({
    to,
    sound: 'default',
    title: title || 'Vínculo',
    body: body || '',
    data: data && typeof data === 'object' ? data : {},
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    // Expo devuelve { data: { status: 'ok', id: '...' } } por mensaje o errores por mensaje
    const receipts = Array.isArray(result.data) ? result.data : [result.data].filter(Boolean);
    const success = receipts.filter((r) => r && r.status === 'ok').length;
    const failed = valid.length - success;

    return { success, failed, receipts };
  } catch (err) {
    console.error('Push send error:', err?.message || err);
    return { success: 0, failed: valid.length };
  }
}

/**
 * Envía un push a todos los tokens de un usuario (por userId).
 * Necesita el modelo Usuario con expoPushTokens.
 * @param {object} usuario - Documento Usuario con expoPushTokens[]
 * @param {object} options - { title, body, data? }
 */
async function sendPushToUser(usuario, options = {}) {
  const tokens = usuario?.expoPushTokens || [];
  return sendPush(tokens, options);
}

module.exports = {
  sendPush,
  sendPushToUser,
};
