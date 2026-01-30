/**
 * Notificaciones push – permisos, token Expo y envío al backend.
 */

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, fetchWithAuth } from '../constants/api';

const STORAGE_KEY = '@vinculos_expo_push_token';

// Comportamiento cuando la app está en primer plano (opcional)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Solicita permiso de notificaciones y obtiene el Expo Push Token.
 * Solo en dispositivo físico; en simulador/Expo Go sin build devuelve null.
 * @returns { Promise<string|null> } Token o null si no hay permiso o no es dispositivo físico.
 */
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    if (finalStatus !== 'granted') {
      return null;
    }
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      return null;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenResult?.data ?? null;
    if (token) {
      await AsyncStorage.setItem(STORAGE_KEY, token);
    }
    return token;
  } catch (e) {
    return null;
  }
}

/**
 * Lee el token guardado localmente (sin pedir permisos).
 * @returns { Promise<string|null> }
 */
export async function getStoredExpoPushToken() {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Comprueba si tenemos permiso de notificaciones concedido.
 * @returns { Promise<boolean> }
 */
export async function hasNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Etapa 2: Envía el Expo Push Token al backend para que pueda enviar notificaciones.
 * @param { string } expoPushToken - Token devuelto por getExpoPushTokenAsync / getStoredExpoPushToken.
 * @returns { Promise<boolean> } true si se registró correctamente, false si falló (no lanza).
 */
export async function sendPushTokenToBackend(expoPushToken) {
  if (!expoPushToken || typeof expoPushToken !== 'string') return false;
  try {
    const url = `${API_BASE_URL}/api/auth/push-token`;
    await fetchWithAuth(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expoPushToken }),
    });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('Push: no se pudo registrar token en el backend', e?.message);
    return false;
  }
}

/**
 * Registra push (permisos + token) y envía el token al backend si hay sesión.
 * Úsalo tras login para tener todo en un solo paso.
 * @returns { Promise<string|null> } Token o null.
 */
export async function registerAndSendPushToken() {
  const token = await registerForPushNotificationsAsync();
  if (token) {
    await sendPushTokenToBackend(token);
  }
  return token;
}
