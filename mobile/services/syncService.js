import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { API_URL, API_BASE_URL, fetchWithAuth } from '../constants/api';

// Claves de almacenamiento
const STORAGE_KEY_CONTACTOS = '@vinculo_contactos_cache';
const STORAGE_KEY_SYNC_QUEUE = '@vinculo_sync_queue';
const STORAGE_KEY_LAST_SYNC = '@vinculo_last_sync';

// Estado de conectividad
let isOnline = true;
let syncInProgress = false;

// Inicializar listener de conectividad
NetInfo.addEventListener(state => {
  const wasOnline = isOnline;
  isOnline = state.isConnected && state.isInternetReachable;
  
  if (!wasOnline && isOnline) {
    // Reconectado, sincronizar pendientes
    console.log('🔄 Conexión restaurada, iniciando sincronización...');
    syncPendingChanges();
  }
  
  console.log('📡 Estado de conexión:', isOnline ? 'Online' : 'Offline');
});

// Obtener estado de conectividad
export const getConnectionStatus = async () => {
  const state = await NetInfo.fetch();
  isOnline = state.isConnected && state.isInternetReachable;
  return isOnline;
};

// Cargar cola de sincronización
const loadSyncQueue = async () => {
  try {
    const queueJson = await AsyncStorage.getItem(STORAGE_KEY_SYNC_QUEUE);
    return queueJson ? JSON.parse(queueJson) : [];
  } catch (error) {
    console.error('Error cargando cola de sincronización:', error);
    return [];
  }
};

// Guardar cola de sincronización
const saveSyncQueue = async (queue) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_SYNC_QUEUE, JSON.stringify(queue));
  } catch (error) {
    console.error('Error guardando cola de sincronización:', error);
  }
};

// Agregar operación a la cola
const addToSyncQueue = async (operation) => {
  const queue = await loadSyncQueue();
  queue.push({
    ...operation,
    timestamp: Date.now(),
    id: `${operation.type}_${Date.now()}_${Math.random()}`,
  });
  await saveSyncQueue(queue);
  console.log('📝 Operación agregada a cola:', operation.type);
};

// Guardar contactos en cache local
export const saveContactsToCache = async (contactos) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_CONTACTOS, JSON.stringify(contactos));
    await AsyncStorage.setItem(STORAGE_KEY_LAST_SYNC, Date.now().toString());
    console.log('💾 Contactos guardados en cache:', contactos.length);
  } catch (error) {
    console.error('Error guardando cache:', error);
  }
};

// Cargar contactos del cache local
export const loadContactsFromCache = async () => {
  try {
    const contactosJson = await AsyncStorage.getItem(STORAGE_KEY_CONTACTOS);
    if (contactosJson) {
      const contactos = JSON.parse(contactosJson);
      console.log('📂 Contactos cargados del cache:', contactos.length);
      return contactos;
    }
    return [];
  } catch (error) {
    console.error('Error cargando cache:', error);
    return [];
  }
};

// Obtener timestamp de última sincronización
export const getLastSyncTime = async () => {
  try {
    const timestamp = await AsyncStorage.getItem(STORAGE_KEY_LAST_SYNC);
    return timestamp ? parseInt(timestamp) : null;
  } catch (error) {
    return null;
  }
};

// Sincronizar cambios pendientes
export const syncPendingChanges = async () => {
  if (syncInProgress || !isOnline) {
    return;
  }

  syncInProgress = true;
  const queue = await loadSyncQueue();
  
  if (queue.length === 0) {
    syncInProgress = false;
    return;
  }

  console.log(`🔄 Sincronizando ${queue.length} operaciones pendientes...`);

  const successful = [];
  const failed = [];

  for (const operation of queue) {
    try {
      let response;
      
      switch (operation.type) {
        case 'CREATE_CONTACT':
          response = await fetchWithAuth(API_URL, {
            method: 'POST',
            body: JSON.stringify(operation.data),
          });
          break;
          
        case 'UPDATE_CONTACT':
          response = await fetchWithAuth(`${API_URL}/${operation.contactoId}`, {
            method: 'PUT',
            body: JSON.stringify(operation.data),
          });
          break;
          
        case 'UPDATE_CONTACT_PARTIAL':
          // Actualización parcial (solo interacciones o tareas)
          const partialData = {};
          if (operation.field === 'interacciones') {
            partialData.interacciones = operation.data;
          } else if (operation.field === 'tareas') {
            partialData.tareas = operation.data;
          }
          response = await fetchWithAuth(`${API_URL}/${operation.contactoId}`, {
            method: 'PUT',
            body: JSON.stringify(partialData),
          });
          break;
          
        case 'DELETE_CONTACT':
          response = await fetchWithAuth(`${API_URL}/${operation.contactoId}`, {
            method: 'DELETE',
          });
          break;
          
        default:
          console.warn('Tipo de operación desconocido:', operation.type);
          failed.push(operation);
          continue;
      }

      if (response.ok) {
        successful.push(operation);
      } else {
        failed.push(operation);
      }
    } catch (error) {
      const status = error.response?.status;
      const isDuplicate = status === 409 || (error.message && error.message.includes('ya existe'));
      const isNotFound = status === 404;
      if (isDuplicate) {
        // Recurso ya existe en el servidor (ej. contacto con mismo teléfono): considerar sincronizado
        successful.push(operation);
        if (__DEV__) {
          console.log('🔄 Sync: recurso ya existía en servidor, operación descartada de cola:', operation.type);
        }
      } else if (isNotFound) {
        // Contacto no existe en el servidor (borrado, ID temporal, etc.): quitar de cola y no reintentar
        successful.push(operation);
        if (__DEV__) {
          console.warn('🔄 Sync: operación 404 (recurso no encontrado), se descarta de la cola:', operation.type, operation.contactoId);
        }
      } else {
        console.error('Error sincronizando operación:', error);
        failed.push(operation);
      }
    }
  }

  // Remover operaciones exitosas de la cola
  const remainingQueue = queue.filter(op => 
    !successful.some(s => s.id === op.id)
  );
  
  await saveSyncQueue(remainingQueue);
  syncInProgress = false;

  console.log(`✅ Sincronización completada: ${successful.length} exitosas, ${failed.length} fallidas`);
  
  return {
    successful: successful.length,
    failed: failed.length,
    pending: remainingQueue.length,
  };
};

// Crear contacto (con sincronización offline)
export const createContact = async (contacto) => {
  // Guardar en cache local primero
  const cachedContacts = await loadContactsFromCache();
  const newContact = {
    ...contacto,
    _id: contacto._id || `temp_${Date.now()}`,
    _isLocal: true,
    _pendingSync: true,
  };
  cachedContacts.push(newContact);
  await saveContactsToCache(cachedContacts);

  // Intentar sincronizar si hay conexión
  if (isOnline) {
    try {
      const response = await fetchWithAuth(API_URL, {
        method: 'POST',
        body: JSON.stringify(contacto),
      });

      if (response.ok) {
        const savedContact = await response.json();
        // Actualizar cache con el ID real del servidor
        const updatedContacts = cachedContacts.map(c => 
          c._id === newContact._id ? { ...savedContact, _isLocal: false, _pendingSync: false } : c
        );
        await saveContactsToCache(updatedContacts);
        return { success: true, contacto: savedContact };
      } else {
        // Error del servidor, agregar a cola
        await addToSyncQueue({
          type: 'CREATE_CONTACT',
          data: contacto,
          contactoId: newContact._id,
        });
        return { success: true, contacto: newContact, offline: true };
      }
    } catch (error) {
      // Error de red, agregar a cola
      await addToSyncQueue({
        type: 'CREATE_CONTACT',
        data: contacto,
        contactoId: newContact._id,
      });
      return { success: true, contacto: newContact, offline: true };
    }
  } else {
    // Sin conexión, agregar a cola
    await addToSyncQueue({
      type: 'CREATE_CONTACT',
      data: contacto,
      contactoId: newContact._id,
    });
    return { success: true, contacto: newContact, offline: true };
  }
};

// Actualizar contacto (con sincronización offline)
export const updateContact = async (contactoId, contacto) => {
  // Actualizar cache local
  const cachedContacts = await loadContactsFromCache();
  const updatedContacts = cachedContacts.map(c => 
    c._id === contactoId ? { ...c, ...contacto, _pendingSync: true } : c
  );
  await saveContactsToCache(updatedContacts);

  // Intentar sincronizar si hay conexión
  if (isOnline) {
    try {
      const response = await fetchWithAuth(`${API_URL}/${contactoId}`, {
        method: 'PUT',
        body: JSON.stringify(contacto),
      });

      if (response.ok) {
        const savedContact = await response.json();
        // Actualizar cache con datos del servidor
        const finalContacts = updatedContacts.map(c => 
          c._id === contactoId ? { ...savedContact, _isLocal: false, _pendingSync: false } : c
        );
        await saveContactsToCache(finalContacts);
        return { success: true, contacto: savedContact };
      } else {
        await addToSyncQueue({
          type: 'UPDATE_CONTACT',
          contactoId,
          data: contacto,
        });
        return { success: true, contacto: updatedContacts.find(c => c._id === contactoId), offline: true };
      }
    } catch (error) {
      await addToSyncQueue({
        type: 'UPDATE_CONTACT',
        contactoId,
        data: contacto,
      });
      return { success: true, contacto: updatedContacts.find(c => c._id === contactoId), offline: true };
    }
  } else {
    await addToSyncQueue({
      type: 'UPDATE_CONTACT',
      contactoId,
      data: contacto,
    });
    return { success: true, contacto: updatedContacts.find(c => c._id === contactoId), offline: true };
  }
};

// Eliminar contacto (con sincronización offline)
export const deleteContact = async (contactoId) => {
  // Eliminar del cache local
  const cachedContacts = await loadContactsFromCache();
  const updatedContacts = cachedContacts.filter(c => c._id !== contactoId);
  await saveContactsToCache(updatedContacts);

  // Intentar sincronizar si hay conexión
  if (isOnline) {
    try {
      const response = await fetchWithAuth(`${API_URL}/${contactoId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        return { success: true };
      } else {
        await addToSyncQueue({
          type: 'DELETE_CONTACT',
          contactoId,
        });
        return { success: true, offline: true };
      }
    } catch (error) {
      await addToSyncQueue({
        type: 'DELETE_CONTACT',
        contactoId,
      });
      return { success: true, offline: true };
    }
  } else {
    await addToSyncQueue({
      type: 'DELETE_CONTACT',
      contactoId,
    });
    return { success: true, offline: true };
  }
};

// Cargar contactos (con fallback a cache)
export const loadContacts = async () => {
  if (isOnline) {
    try {
      const response = await fetchWithAuth(API_URL);
      if (response.ok) {
        const contactos = await response.json();
        await saveContactsToCache(contactos);
        return { success: true, contactos, fromCache: false };
      }
    } catch (error) {
      console.log('⚠️ Error cargando del servidor, usando cache:', error);
    }
  }

  // Fallback a cache
  const cachedContacts = await loadContactsFromCache();
  return { success: true, contactos: cachedContacts, fromCache: true };
};

// Obtener cantidad de operaciones pendientes
export const getPendingSyncCount = async () => {
  const queue = await loadSyncQueue();
  return queue.length;
};

// Limpiar cola de sincronización (útil para debugging)
export const clearSyncQueue = async () => {
  await saveSyncQueue([]);
  console.log('🗑️ Cola de sincronización limpiada');
};

// Actualizar interacciones de un contacto (con sincronización offline)
export const updateContactInteracciones = async (contactoId, interacciones) => {
  // Actualizar cache local primero
  const cachedContacts = await loadContactsFromCache();
  const updatedContacts = cachedContacts.map(c => 
    c._id === contactoId ? { ...c, interacciones, _pendingSync: true } : c
  );
  await saveContactsToCache(updatedContacts);

  // Intentar sincronizar si hay conexión
  if (isOnline) {
    try {
      const response = await fetchWithAuth(`${API_URL}/${contactoId}`, {
        method: 'PUT',
        body: JSON.stringify({ interacciones }),
      });

      if (response.ok) {
        const savedContact = await response.json();
        // Actualizar cache con datos del servidor
        const finalContacts = updatedContacts.map(c => 
          c._id === contactoId ? { ...savedContact, _isLocal: false, _pendingSync: false } : c
        );
        await saveContactsToCache(finalContacts);
        return { success: true, contacto: savedContact };
      } else {
        await addToSyncQueue({
          type: 'UPDATE_CONTACT_PARTIAL',
          contactoId,
          field: 'interacciones',
          data: interacciones,
        });
        return { success: true, contacto: updatedContacts.find(c => c._id === contactoId), offline: true };
      }
    } catch (error) {
      await addToSyncQueue({
        type: 'UPDATE_CONTACT_PARTIAL',
        contactoId,
        field: 'interacciones',
        data: interacciones,
      });
      return { success: true, contacto: updatedContacts.find(c => c._id === contactoId), offline: true };
    }
  } else {
    await addToSyncQueue({
      type: 'UPDATE_CONTACT_PARTIAL',
      contactoId,
      field: 'interacciones',
      data: interacciones,
    });
    return { success: true, contacto: updatedContacts.find(c => c._id === contactoId), offline: true };
  }
};

// Actualizar tareas de un contacto (con sincronización offline)
export const updateContactTareas = async (contactoId, tareas) => {
  // Actualizar cache local primero
  const cachedContacts = await loadContactsFromCache();
  const updatedContacts = cachedContacts.map(c => 
    c._id === contactoId ? { ...c, tareas, _pendingSync: true } : c
  );
  await saveContactsToCache(updatedContacts);

  // Intentar sincronizar si hay conexión
  if (isOnline) {
    try {
      const response = await fetchWithAuth(`${API_URL}/${contactoId}`, {
        method: 'PUT',
        body: JSON.stringify({ tareas }),
      });

      if (response.ok) {
        const savedContact = await response.json();
        // Actualizar cache con datos del servidor
        const finalContacts = updatedContacts.map(c => 
          c._id === contactoId ? { ...savedContact, _isLocal: false, _pendingSync: false } : c
        );
        await saveContactsToCache(finalContacts);
        return { success: true, contacto: savedContact };
      } else {
        await addToSyncQueue({
          type: 'UPDATE_CONTACT_PARTIAL',
          contactoId,
          field: 'tareas',
          data: tareas,
        });
        return { success: true, contacto: updatedContacts.find(c => c._id === contactoId), offline: true };
      }
    } catch (error) {
      await addToSyncQueue({
        type: 'UPDATE_CONTACT_PARTIAL',
        contactoId,
        field: 'tareas',
        data: tareas,
      });
      return { success: true, contacto: updatedContacts.find(c => c._id === contactoId), offline: true };
    }
  } else {
    await addToSyncQueue({
      type: 'UPDATE_CONTACT_PARTIAL',
      contactoId,
      field: 'tareas',
      data: tareas,
    });
    return { success: true, contacto: updatedContacts.find(c => c._id === contactoId), offline: true };
  }
};

/** Guardar interacción desde nota de voz: guarda la transcripción íntegra (sin audio). Requiere conexión. */
export const saveInteractionFromVoice = async (contactoId, tempId, texto = '') => {
  if (!isOnline) {
    throw new Error('Necesitas conexión para guardar la nota de voz.');
  }
  const url = `${API_URL}/${contactoId}/interacciones/from-voice`;
  try {
    const response = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempId, texto: typeof texto === 'string' ? texto : '' }),
    });
    const savedContact = await response.json();
    const cachedContacts = await loadContactsFromCache();
    const idStr = String(contactoId);
    const finalContacts = cachedContacts.map(c =>
      String(c._id) === idStr ? { ...savedContact, _isLocal: false, _pendingSync: false } : c
    );
    await saveContactsToCache(finalContacts);
    return { success: true, contacto: savedContact };
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = data.error || data.message || err.message;
    if (status === 404) {
      console.warn('[VoiceTemp] 404 guardar momento | url:', url, '| body:', JSON.stringify(data));
      if (msg && typeof msg === 'string' && (msg.includes('no encontrada') || msg.includes('borrada'))) {
        throw new Error('La nota ya no está disponible. Graba de nuevo y guarda en seguida.');
      }
      if (msg && typeof msg === 'string' && msg.includes('Contacto no encontrado')) {
        throw new Error('Contacto no encontrado. Comprueba que sigue en tu lista de vínculos.');
      }
      checkApiVersionOn404();
      throw new Error(is404RutaInexistente(msg, data) ? MSG_404_BACKEND_DESACTUALIZADO : MSG_404_BACKEND_DESACTUALIZADO);
    }
    throw new Error(typeof msg === 'string' ? msg : 'Error al guardar el momento.');
  }
};

const REFUGIO_URL = `${API_BASE_URL}/api/refugio`;

/** Mensaje cuando el 404 es por backend desactualizado (rutas de voz/refugio no desplegadas). */
const MSG_404_BACKEND_DESACTUALIZADO = 'El servidor en la nube no tiene las rutas de guardado. Sube el código a GitHub (git push) y en el panel de Render haz "Manual Deploy" para actualizar el backend.';

/** True si el 404 parece ser "ruta inexistente" (no "nota no encontrada" ni "contacto no encontrado"). */
const is404RutaInexistente = (msg, data) => {
  const s = typeof msg === 'string' ? msg : '';
  const raw = (data && typeof data.error === 'string') ? data.error : '';
  if (s.includes('no encontrada') && s.includes('nota')) return false;
  if (s.includes('borrada')) return false;
  if (s.includes('Contacto no encontrado')) return false;
  if (s.includes('Not Found') || s.includes('Cannot POST') || s.includes('Error 404') || raw.includes('<')) return true;
  return false;
};

/** Diagnóstico: comprobar si el backend tiene rutas de voz/refugio (al recibir 404). */
const checkApiVersionOn404 = async () => {
  try {
    const r = await fetch(`${API_BASE_URL}/api/version`);
    const data = r.ok ? await r.json() : null;
    console.log('[VoiceTemp] Diagnóstico 404: GET /api/version →', r.status, data ? `version ${data.version}` : r.statusText);
    if (!r.ok || !data?.features?.includes('refugio')) {
      console.warn('[VoiceTemp] El backend en Render puede estar desactualizado. Redespliega con el último index.js (rutas refugio, from-voice).');
    }
  } catch (e) {
    console.warn('[VoiceTemp] No se pudo comprobar /api/version:', e?.message);
  }
};

/** Guardar nota temporal como desahogo (Mi Refugio). Solo transcripción + emoción, sin contacto. */
export const saveDesahogoFromVoice = async (tempId) => {
  if (!isOnline) {
    throw new Error('Necesitas conexión para guardar en Mi Refugio.');
  }
  const url = `${REFUGIO_URL}/desahogo`;
  console.log('[VoiceTemp] POST guardar desahogo →', url);
  try {
    const response = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempId: typeof tempId === 'string' ? tempId : '' }),
    });
    const result = await response.json();
    return { success: true, desahogo: result.desahogo };
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = data.error || data.message || err.message;
    if (status === 404) {
      console.warn('[VoiceTemp] 404 guardar desahogo | url:', url, '| body:', JSON.stringify(data));
      checkApiVersionOn404();
      if (msg && typeof msg === 'string' && (msg.includes('no encontrada') || msg.includes('borrada'))) {
        throw new Error('La nota ya no está disponible. Graba de nuevo y guarda en Mi Refugio en seguida.');
      }
      throw new Error('Ruta no encontrada (404). Despliega el backend en Render con los últimos cambios (Mi Refugio y voz).');
    }
    throw new Error(typeof msg === 'string' ? msg : 'Error al guardar el desahogo.');
  }
};

/** Guardar desahogo desde texto (lápiz; sin audio). */
export const saveDesahogoFromText = async (texto) => {
  if (!isOnline) throw new Error('Necesitas conexión para guardar en Mi Refugio.');
  const url = `${REFUGIO_URL}/desahogo`;
  try {
    const response = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: typeof texto === 'string' ? texto.trim() : '' }),
    });
    const result = await response.json();
    return { success: true, desahogo: result.desahogo };
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    throw new Error(typeof msg === 'string' ? msg : 'Error al guardar el desahogo.');
  }
};

/** Añadir interacción (momento) desde texto (lápiz; sin tempId). fechaHora opcional (Date o ISO). */
export const saveInteractionFromText = async (contactoId, descripcion, fechaHora = null) => {
  if (!isOnline) throw new Error('Necesitas conexión.');
  const url = `${API_URL}/${contactoId}/interacciones/from-text`;
  const body = { descripcion: typeof descripcion === 'string' ? descripcion.trim() : '' };
  if (fechaHora) body.fechaHora = typeof fechaHora === 'string' ? fechaHora : (fechaHora?.toISOString?.() || new Date(fechaHora).toISOString());
  try {
    const response = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const savedContact = await response.json();
    const cachedContacts = await loadContactsFromCache();
    const finalContacts = cachedContacts.map(c =>
      c._id === contactoId ? { ...savedContact, _isLocal: false, _pendingSync: false } : c
    );
    await saveContactsToCache(finalContacts);
    return { success: true, contacto: savedContact };
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    throw new Error(typeof msg === 'string' ? msg : 'Error al guardar el momento.');
  }
};

/** Añadir tarea (gesto) desde texto (lápiz; sin tempId). */
export const saveTaskFromText = async (contactoId, descripcion, fechaHoraEjecucion, clasificacion = 'Otro') => {
  if (!isOnline) throw new Error('Necesitas conexión.');
  const url = `${API_URL}/${contactoId}/tareas/from-text`;
  const body = { descripcion: typeof descripcion === 'string' ? descripcion.trim() : '' };
  if (fechaHoraEjecucion) body.fechaHoraEjecucion = typeof fechaHoraEjecucion === 'string' ? fechaHoraEjecucion : fechaHoraEjecucion.toISOString?.() || new Date(fechaHoraEjecucion).toISOString();
  if (clasificacion) body.clasificacion = clasificacion;
  try {
    const response = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const savedContact = await response.json();
    const cachedContacts = await loadContactsFromCache();
    const finalContacts = cachedContacts.map(c =>
      c._id === contactoId ? { ...savedContact, _isLocal: false, _pendingSync: false } : c
    );
    await saveContactsToCache(finalContacts);
    return { success: true, contacto: savedContact };
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    throw new Error(typeof msg === 'string' ? msg : 'Error al guardar la huella.');
  }
};

/** Listar desahogos del usuario (Mi Refugio). */
export const loadDesahogos = async () => {
  if (!isOnline) {
    return [];
  }
  try {
    const response = await fetchWithAuth(`${REFUGIO_URL}/desahogos`);
    if (!response.ok) return [];
    const list = await response.json();
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn('Error cargando desahogos:', e?.message);
    return [];
  }
};

/** Obtener un desahogo por ID (incluye audioBase64 para Escucha Retrospectiva). */
export const getDesahogoById = async (id) => {
  if (!isOnline || !id) return null;
  try {
    const response = await fetchWithAuth(`${REFUGIO_URL}/desahogos/${id}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.warn('Error obteniendo desahogo:', e?.message);
    return null;
  }
};

/** El Espejo: resumen semanal de estado de ánimo (IA). */
export const getEspejo = async () => {
  if (!isOnline) return null;
  try {
    const response = await fetchWithAuth(`${REFUGIO_URL}/espejo`);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.text || null;
  } catch (e) {
    console.warn('Error obteniendo El Espejo:', e?.message);
    return null;
  }
};

/** Borrar todas las atenciones (tareas) del usuario. Requiere confirmación en la UI. */
export const clearAtenciones = async () => {
  if (!isOnline) throw new Error('Necesitas conexión para borrar.');
  await fetchWithAuth(`${API_BASE_URL}/api/user/clear-atenciones`, { method: 'POST' });
  return { success: true };
};

/** Borrar todas las huellas (interacciones) del usuario. Requiere confirmación en la UI. */
export const clearHuellas = async () => {
  if (!isOnline) throw new Error('Necesitas conexión para borrar.');
  await fetchWithAuth(`${API_BASE_URL}/api/user/clear-huellas`, { method: 'POST' });
  return { success: true };
};

/** Borrar todos los desahogos del usuario (Mi Refugio). Requiere confirmación en la UI. */
export const clearDesahogos = async () => {
  if (!isOnline) throw new Error('Necesitas conexión para borrar.');
  await fetchWithAuth(`${REFUGIO_URL}/desahogos`, { method: 'DELETE' });
  return { success: true };
};

/** Borrar un desahogo por ID (Mi Refugio). Usa POST para evitar 404 en Render/proxies que bloquean DELETE. */
export const deleteDesahogo = async (id) => {
  if (!isOnline) throw new Error('Necesitas conexión para borrar.');
  const idStr = id != null ? String(id).trim() : '';
  if (!idStr) throw new Error('ID de desahogo no válido.');
  const url = `${REFUGIO_URL}/desahogos/${encodeURIComponent(idStr)}/delete`;
  await fetchWithAuth(url, { method: 'POST' });
  return { success: true };
};

/** Guardar tarea desde nota de voz: guarda la transcripción íntegra (sin audio). Requiere conexión. */
export const saveTaskFromVoice = async (contactoId, tempId, fechaHoraEjecucion, clasificacion = 'Otro', texto = '') => {
  if (!isOnline) {
    throw new Error('Necesitas conexión para guardar la nota de voz.');
  }
  const body = { tempId, texto: typeof texto === 'string' ? texto : '' };
  if (fechaHoraEjecucion) body.fechaHoraEjecucion = typeof fechaHoraEjecucion === 'string' ? fechaHoraEjecucion : fechaHoraEjecucion.toISOString?.() || new Date(fechaHoraEjecucion).toISOString();
  if (clasificacion) body.clasificacion = clasificacion;
  const url = `${API_URL}/${contactoId}/tareas/from-voice`;
  console.log('[VoiceTemp] POST guardar huella →', url, '| contactoId:', contactoId);
  try {
    const response = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const savedContact = await response.json();
    const cachedContacts = await loadContactsFromCache();
    const idStr = String(contactoId);
    const finalContacts = cachedContacts.map(c =>
      String(c._id) === idStr ? { ...savedContact, _isLocal: false, _pendingSync: false } : c
    );
    await saveContactsToCache(finalContacts);
    return { success: true, contacto: savedContact };
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = data.error || data.message || err.message;
    if (status === 404) {
      console.warn('[VoiceTemp] 404 guardar huella | url:', url, '| body:', JSON.stringify(data));
      checkApiVersionOn404();
      if (msg && typeof msg === 'string' && (msg.includes('no encontrada') || msg.includes('borrada'))) {
        throw new Error('La nota ya no está disponible. Graba de nuevo y guarda en seguida.');
      }
      if (msg && typeof msg === 'string' && msg.includes('Contacto no encontrado')) {
        throw new Error('Contacto no encontrado. Comprueba que sigue en tu lista de vínculos.');
      }
      throw new Error(MSG_404_BACKEND_DESACTUALIZADO);
    }
    throw new Error(typeof msg === 'string' ? msg : 'Error al guardar la huella.');
  }
};
