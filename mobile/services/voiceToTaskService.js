/**
 * Servicio de voz → tarea: graba audio y lo envía al backend para transcripción (Whisper) + extracción (GPT-4o-mini).
 * Carga expo-av bajo demanda para no fallar si el paquete no está instalado.
 * Nota: expo-av está deprecado en SDK 54; en el futuro migrar a expo-audio para grabación/reproducción.
 */

import { getToken } from './authService';
import { API_BASE_URL } from '../constants/config';

const VOICE_TO_TASK_URL = `${API_BASE_URL}/api/ai/voice-to-task`;
const VOICE_TO_PREVIEW_URL = `${API_BASE_URL}/api/ai/voice-to-preview`;
// Usar /api/ai/voice-temp (mismo prefijo que voice-to-preview) por compatibilidad con deploy en Render
const VOICE_TEMP_URL = `${API_BASE_URL}/api/ai/voice-temp`;

const LOG_TAG = '[VoiceTemp]';
function log(...args) {
  console.log(LOG_TAG, ...args);
}

function getExpoAv() {
  try {
    return require('expo-av').Audio;
  } catch (e) {
    return null;
  }
}

/**
 * Solicita permiso de micrófono y configura modo de audio para grabación.
 * @returns {Promise<{ granted: boolean, error?: string }>}
 */
export async function requestRecordingPermission() {
  const Audio = getExpoAv();
  if (!Audio) {
    return { granted: false, error: 'Para usar notas de voz, ejecuta en la carpeta mobile: npx expo install expo-av' };
  }
  try {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      return { granted: false, error: 'Se necesita permiso de micrófono para grabar.' };
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    return { granted: true };
  } catch (e) {
    return { granted: false, error: e.message || 'Error al configurar el micrófono.' };
  }
}

/**
 * Inicia una grabación. Usar HIGH_QUALITY para .m4a (compatible con Whisper).
 * @returns {Promise<{ recording: import('expo-av').Recording, error?: string }>}
 */
export async function startRecording() {
  const Audio = getExpoAv();
  if (!Audio) {
    return { recording: null, error: 'Para usar notas de voz, ejecuta en la carpeta mobile: npx expo install expo-av' };
  }
  try {
    const perm = await requestRecordingPermission();
    if (!perm.granted) {
      return { recording: null, error: perm.error };
    }
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    return { recording };
  } catch (e) {
    return { recording: null, error: e.message || 'No se pudo iniciar la grabación.' };
  }
}

/**
 * Detiene la grabación y devuelve la URI del archivo.
 * @param {import('expo-av').Recording} recording
 * @returns {Promise<{ uri: string | null, error?: string }>}
 */
export async function stopRecording(recording) {
  if (!recording) {
    return { uri: null, error: 'No hay grabación activa.' };
  }
  const Audio = getExpoAv();
  if (!Audio) {
    return { uri: null, error: 'expo-av no está instalado.' };
  }
  try {
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    const uri = recording.getURI();
    return { uri: uri || null };
  } catch (e) {
    return { uri: null, error: e.message || 'Error al detener la grabación.' };
  }
}

/**
 * Reproduce la nota de voz (preview) desde una URI local.
 * @param {string} fileUri - URI local del archivo (file://...)
 * @returns {Promise<{ error?: string }>}
 */
export async function playPreviewUri(fileUri) {
  const Audio = getExpoAv();
  if (!Audio) {
    return { error: 'expo-av no está instalado.' };
  }
  if (!fileUri) {
    return { error: 'No hay audio para reproducir.' };
  }
  try {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri: fileUri },
      { shouldPlay: true }
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish && !status.isLooping) {
        sound.unloadAsync().catch(() => {});
      }
    });
    return {};
  } catch (e) {
    return { error: e.message || 'No se pudo reproducir.' };
  }
}

/**
 * Envía el archivo de audio al backend (POST multipart) y devuelve la respuesta.
 * @param {string} fileUri - URI local del archivo (file://...)
 * @returns {Promise<{ success: true, data: object } | { success: false, error: string, status?: number }>}
 */
export async function sendAudioToBackend(fileUri) {
  const token = await getToken();
  if (!token) {
    return { success: false, error: 'Debes iniciar sesión para usar la voz.' };
  }

  const formData = new FormData();
  formData.append('audio', {
    uri: fileUri,
    name: 'audio.m4a',
    type: 'audio/mp4',
  });

  try {
    const response = await fetch(VOICE_TO_TASK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        // No establecer Content-Type; fetch asignará multipart/form-data con boundary
      },
      body: formData,
    });

    const data = await response.json().catch(() => ({}));
    const message = data.error || data.message;

    if (!response.ok) {
      if (response.status === 429) {
        return {
          success: false,
          error: message || 'Has alcanzado el límite de notas de voz por hoy. Vuelve mañana.',
          status: 429,
        };
      }
      if (response.status === 503) {
        return {
          success: false,
          error: message || 'El servicio de voz no está disponible ahora.',
          status: 503,
        };
      }
      return {
        success: false,
        error: message || `Error ${response.status}`,
        status: response.status,
      };
    }

    return {
      success: true,
      data: {
        message: data.message,
        texto: data.texto,
        vinculo: data.vinculo,
        tarea: data.tarea,
        fecha: data.fecha,
        contacto: data.contacto,
        tareaCreada: data.tareaCreada,
        aiPeticionesRestantes: data.aiPeticionesRestantes,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e.message && e.message.includes('Network') ? 'Sin conexión. Revisa tu red.' : (e.message || 'Error al enviar el audio.'),
    };
  }
}

/**
 * Envía audio al backend para obtener preview (transcripción + extracción) sin guardar.
 * Usa base64 en JSON para evitar problemas con multipart en React Native.
 * @param {string} fileUri - URI local del archivo (file://... o content://...)
 * @returns {Promise<{ success: true, data: object } | { success: false, error: string, status?: number }>}
 */
export async function sendAudioToPreview(fileUri) {
  const token = await getToken();
  if (!token) {
    return { success: false, error: 'Debes iniciar sesión para usar la voz.' };
  }
  const uri = typeof fileUri === 'string' ? fileUri.trim() : '';
  if (!uri) {
    return { success: false, error: 'No hay archivo de audio para enviar.' };
  }

  let audioBase64;
  try {
    const FileSystem = require('expo-file-system/legacy');
    audioBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (e) {
    return { success: false, error: e.message || 'No se pudo leer el archivo de audio.' };
  }
  if (!audioBase64) {
    return { success: false, error: 'El archivo de audio está vacío.' };
  }

  try {
    const response = await fetch(VOICE_TO_PREVIEW_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ audioBase64 }),
    });

    const data = await response.json().catch(() => ({}));
    const message = data.error || data.message;

    if (!response.ok) {
      if (response.status === 429) {
        return {
          success: false,
          error: message || 'Has alcanzado el límite de notas de voz por hoy. Vuelve mañana.',
          status: 429,
        };
      }
      if (response.status === 503) {
        return {
          success: false,
          error: message || 'El servicio de voz no está disponible ahora.',
          status: 503,
        };
      }
      return {
        success: false,
        error: message || `Error ${response.status}`,
        status: response.status,
      };
    }

    return {
      success: true,
      data: {
        texto: data.texto,
        vinculo: data.vinculo,
        tarea: data.tarea,
        fecha: data.fecha,
        descripcion: data.descripcion || data.tarea,
        contactoId: data.contactoId,
        contactoNombre: data.contactoNombre,
        aiPeticionesRestantes: data.aiPeticionesRestantes,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e.message && e.message.includes('Network') ? 'Sin conexión. Revisa tu red.' : (e.message || 'Error al enviar el audio.'),
    };
  }
}

/**
 * Sube el audio en base64 a la tabla temporal del backend. Se borra al convertir a tarea/interacción o al cerrar.
 * @param {string} fileUri - URI local del archivo (file://... o content://...)
 * @returns {Promise<{ success: true, tempId: string } | { success: false, error: string, status?: number }>}
 */
export async function uploadVoiceTemp(fileUri) {
  log('1/5 uploadVoiceTemp iniciado | API_BASE_URL:', API_BASE_URL, '| POST a:', VOICE_TEMP_URL, '| fileUri:', fileUri ? `${fileUri.substring(0, 50)}...` : 'null');
  const token = await getToken();
  if (!token) {
    log('2/5 ERROR: sin token (no hay sesión)');
    return { success: false, error: 'Debes iniciar sesión para usar la voz.' };
  }
  log('2/5 Token OK');
  const uri = typeof fileUri === 'string' ? fileUri.trim() : '';
  if (!uri) {
    log('ERROR: uri vacío');
    return { success: false, error: 'No hay archivo de audio para subir.' };
  }
  let audioBase64;
  try {
    const FileSystem = require('expo-file-system/legacy');
    audioBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (e) {
    log('3/5 ERROR leyendo archivo:', e.message);
    return { success: false, error: e.message || 'No se pudo leer el archivo de audio.' };
  }
  if (!audioBase64) {
    log('ERROR: audioBase64 vacío');
    return { success: false, error: 'El archivo de audio está vacío.' };
  }
  log('3/5 Archivo leído en base64, longitud:', audioBase64.length);
  try {
    log('4/5 POST a:', VOICE_TEMP_URL);
    const response = await fetch(VOICE_TEMP_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ audioBase64 }),
    });
    const data = await response.json().catch(() => ({}));
    log('5/5 Respuesta POST status:', response.status, 'body keys:', Object.keys(data));
    if (response.status === 404) {
      log('5/5 *** 404 en POST /api/voice/temp *** ¿La ruta existe en el backend?');
    }
    const message = data.error || data.message;
    if (!response.ok) {
      log('5/5 ERROR:', response.status, message || data);
      return {
        success: false,
        error: message || `Error ${response.status}`,
        status: response.status,
      };
    }
    const tempId = data.tempId;
    if (!tempId) {
      log('5/5 ERROR: servidor no devolvió tempId');
      return { success: false, error: 'El servidor no devolvió tempId.' };
    }
    log('5/5 OK tempId:', tempId);
    return { success: true, tempId };
  } catch (e) {
    log('5/5 EXCEPCIÓN en fetch:', e.message, e.name);
    return {
      success: false,
      error: e.message && e.message.includes('Network') ? 'Sin conexión. Revisa tu red.' : (e.message || 'Error al subir la nota.'),
    };
  }
}

/**
 * Transcribe la nota temporal con OpenAI Whisper. No borra la nota.
 * Usa POST /api/ai/voice-temp/transcribe (mismo prefijo que upload; evita 404 con GET en Render).
 * @param {string} tempId - ID devuelto por uploadVoiceTemp
 * @returns {Promise<{ success: true, texto: string } | { success: false, error: string }>}
 */
export async function transcribeVoiceTemp(tempId) {
  const url = `${VOICE_TEMP_URL}/transcribe`;
  log('1/4 transcribeVoiceTemp iniciado | tempId:', tempId, '| POST a:', url);
  if (!tempId || typeof tempId !== 'string') {
    log('2/4 ERROR: tempId vacío o inválido');
    return { success: false, error: 'Falta id de nota temporal.' };
  }
  const token = await getToken();
  if (!token) {
    log('2/4 ERROR: sin token');
    return { success: false, error: 'Debes iniciar sesión.' };
  }
  log('2/4 Token OK');
  try {
    log('3/4 POST request a:', url, 'body: { tempId }');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ tempId: tempId.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    log('4/4 Respuesta POST transcribe status:', response.status, 'body keys:', Object.keys(data));
    if (response.status === 404) {
      log('4/4 *** 404 en POST /api/ai/voice-temp/transcribe *** Redeploy backend en Render.');
    }
    if (!response.ok) {
      log('4/4 ERROR:', response.status, data.error || data.message || data);
      return {
        success: false,
        error: data.error || data.message || `Error ${response.status}`,
      };
    }
    const texto = typeof data.texto === 'string' ? data.texto : '';
    log('4/4 OK transcripción longitud:', texto.length);
    return { success: true, texto };
  } catch (e) {
    log('4/4 EXCEPCIÓN:', e.message);
    return {
      success: false,
      error: e.message && e.message.includes('Network') ? 'Sin conexión.' : (e.message || 'Error al transcribir.'),
    };
  }
}

/**
 * Borra la nota temporal del backend (al cerrar modal o tras guardar como tarea/interacción).
 * @param {string} tempId - ID devuelto por uploadVoiceTemp
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function deleteVoiceTemp(tempId) {
  const deleteUrl = `${VOICE_TEMP_URL}/${tempId}`;
  log('deleteVoiceTemp tempId:', tempId, 'URL:', deleteUrl);
  if (!tempId || typeof tempId !== 'string') {
    log('deleteVoiceTemp: sin tempId, skip');
    return { success: true };
  }
  const token = await getToken();
  if (!token) {
    log('deleteVoiceTemp: sin token, skip');
    return { success: true };
  }
  try {
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    log('deleteVoiceTemp respuesta status:', response.status);
    if (response.status === 404) {
      log('deleteVoiceTemp: 404 (nota ya borrada o no existe), se considera OK');
    }
    if (response.ok || response.status === 404) {
      return { success: true };
    }
    const body = await response.json().catch(() => ({}));
    log('deleteVoiceTemp ERROR:', response.status, body);
    return { success: false, error: body.message || 'Error al borrar nota temporal.' };
  } catch (e) {
    log('deleteVoiceTemp EXCEPCIÓN:', e.message);
    return { success: false, error: e.message || 'Error al borrar nota temporal.' };
  }
}
