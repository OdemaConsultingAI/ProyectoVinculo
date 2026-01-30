import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { API_URL, fetchWithAuth } from '../constants/api';

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
