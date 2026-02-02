import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORES } from '../constants/colores';
import { API_URL, fetchWithAuth } from '../constants/api';
import { buildNotificacionesFromContactos } from '../utils/notificaciones';

const STORAGE_KEY_NOTIFICACIONES_VISTAS = '@notificaciones_vistas';

function obtenerColorPrioridad(prioridad) {
  switch (prioridad) {
    case 'urgente': return COLORES.urgente;
    case 'alta': return COLORES.atencion;
    case 'media': return COLORES.activo;
    default: return COLORES.textoSuave;
  }
}

export default function NotificationBell() {
  const [notificaciones, setNotificaciones] = useState([]);
  const [notificacionesVistas, setNotificacionesVistas] = useState(new Set());
  const [modalVisible, setModalVisible] = useState(false);
  const [cargando, setCargando] = useState(false);

  const cargarNotificacionesVistas = useCallback(async () => {
    try {
      const vistasJson = await AsyncStorage.getItem(STORAGE_KEY_NOTIFICACIONES_VISTAS);
      if (vistasJson) {
        setNotificacionesVistas(new Set(JSON.parse(vistasJson)));
      }
    } catch (error) {
      console.error('Error cargando notificaciones vistas:', error);
    }
  }, []);

  useEffect(() => {
    cargarNotificacionesVistas();
  }, [cargarNotificacionesVistas]);

  useEffect(() => {
    cargarNotificaciones();
  }, [cargarNotificaciones]);

  const guardarNotificacionesVistas = async (vistas) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_NOTIFICACIONES_VISTAS, JSON.stringify(Array.from(vistas)));
    } catch (error) {
      console.error('Error guardando notificaciones vistas:', error);
    }
  };

  const cargarNotificaciones = useCallback(async () => {
    try {
      setCargando(true);
      const res = await fetchWithAuth(API_URL);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const contactos = await res.json();
      const notifs = buildNotificacionesFromContactos(contactos || []);
      setNotificaciones(notifs);
      return notifs;
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
      setNotificaciones([]);
      return [];
    } finally {
      setCargando(false);
    }
  }, []);

  const abrirModal = async () => {
    setModalVisible(true);
    const notifs = await cargarNotificaciones();
    const nuevasVistas = new Set(notificacionesVistas);
    notifs.forEach((n) => nuevasVistas.add(n.id));
    setNotificacionesVistas(nuevasVistas);
    await guardarNotificacionesVistas(nuevasVistas);
  };

  const marcarComoVista = async (notificacionId) => {
    const nuevasVistas = new Set(notificacionesVistas);
    nuevasVistas.add(notificacionId);
    setNotificacionesVistas(nuevasVistas);
    await guardarNotificacionesVistas(nuevasVistas);
  };

  const eliminarNotificacion = async (notificacionId) => {
    const nuevasVistas = new Set(notificacionesVistas);
    nuevasVistas.add(notificacionId);
    setNotificacionesVistas(nuevasVistas);
    await guardarNotificacionesVistas(nuevasVistas);
    setNotificaciones((prev) => prev.filter((n) => n.id !== notificacionId));
  };

  const eliminarTodasNotificaciones = () => {
    const todasIds = notificaciones.map((n) => n.id);
    const nuevasVistas = new Set([...notificacionesVistas, ...todasIds]);
    setNotificacionesVistas(nuevasVistas);
    guardarNotificacionesVistas(nuevasVistas);
    setNotificaciones([]);
  };

  const notificacionesNoVistas = notificaciones.filter((n) => !notificacionesVistas.has(n.id));
  const tieneNotificaciones = notificacionesNoVistas.length > 0;
  const noVistas = notificaciones.filter((n) => !notificacionesVistas.has(n.id));
  const vistas = notificaciones.filter((n) => notificacionesVistas.has(n.id));

  return (
    <>
      <TouchableOpacity
        style={styles.notificacionesButton}
        onPress={abrirModal}
        accessibilityLabel="Notificaciones"
      >
        <Ionicons
          name={tieneNotificaciones ? 'notifications' : 'notifications-outline'}
          size={24}
          color={tieneNotificaciones ? COLORES.agua : COLORES.textoSuave}
        />
        {tieneNotificaciones && (
          <View style={styles.notificacionesBadge}>
            <Text style={styles.notificacionesBadgeText}>
              {notificacionesNoVistas.length > 9 ? '9+' : notificacionesNoVistas.length}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalFull}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🔔 Notificaciones</Text>
            <View style={styles.modalHeaderActions}>
              {noVistas.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      'Eliminar todas',
                      '¿Deseas eliminar todas las notificaciones?',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Eliminar', style: 'destructive', onPress: eliminarTodasNotificaciones },
                      ]
                    );
                  }}
                  style={styles.modalActionButton}
                >
                  <Ionicons name="trash-outline" size={20} color={COLORES.urgente} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color={COLORES.agua} />
              </TouchableOpacity>
            </View>
          </View>

          {cargando ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORES.agua} />
            </View>
          ) : (
            <ScrollView style={styles.modalScroll}>
              {noVistas.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Nuevas</Text>
                    <Text style={styles.sectionCount}>{noVistas.length}</Text>
                  </View>
                  {noVistas.map((notif) => (
                    <View key={notif.id} style={styles.notificacionItem}>
                      <View style={styles.notificacionLeft}>
                        <View
                          style={[
                            styles.notificacionIcono,
                            { backgroundColor: obtenerColorPrioridad(notif.prioridad) + '20' },
                          ]}
                        >
                          <Ionicons
                            name={
                              notif.tipo === 'tarea'
                                ? 'heart'
                                : notif.tipo === 'riego'
                                ? 'water'
                                : notif.tipo === 'cumpleanos'
                                ? 'gift'
                                : 'bulb'
                            }
                            size={20}
                            color={obtenerColorPrioridad(notif.prioridad)}
                          />
                        </View>
                        <View style={styles.notificacionContent}>
                          <Text style={styles.notificacionTitulo}>{notif.titulo}</Text>
                          <Text style={styles.notificacionDescripcion}>{notif.descripcion}</Text>
                          <Text style={styles.notificacionContacto}>{notif.contacto}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => eliminarNotificacion(notif.id)}
                        style={styles.notificacionDeleteButton}
                      >
                        <Ionicons name="close-circle" size={20} color={COLORES.textoSuave} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}

              {vistas.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Vistas</Text>
                    <Text style={styles.sectionCount}>{vistas.length}</Text>
                  </View>
                  {vistas.map((notif) => (
                    <View key={notif.id} style={[styles.notificacionItem, styles.notificacionItemVista]}>
                      <View style={styles.notificacionLeft}>
                        <View style={[styles.notificacionIcono, { backgroundColor: COLORES.fondoSecundario }]}>
                          <Ionicons
                            name={
                              notif.tipo === 'tarea'
                                ? 'heart'
                                : notif.tipo === 'riego'
                                ? 'water'
                                : notif.tipo === 'cumpleanos'
                                ? 'gift'
                                : 'bulb'
                            }
                            size={20}
                            color={COLORES.textoSecundario}
                          />
                        </View>
                        <View style={styles.notificacionContent}>
                          <Text style={[styles.notificacionTitulo, styles.notificacionTituloVista]}>
                            {notif.titulo}
                          </Text>
                          <Text style={[styles.notificacionDescripcion, styles.notificacionDescripcionVista]}>
                            {notif.descripcion}
                          </Text>
                          <Text style={[styles.notificacionContacto, styles.notificacionContactoVista]}>
                            {notif.contacto}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => eliminarNotificacion(notif.id)}
                        style={styles.notificacionDeleteButton}
                      >
                        <Ionicons name="close-circle" size={20} color={COLORES.textoSuave} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}

              {notificaciones.length === 0 && !cargando && (
                <View style={styles.emptyState}>
                  <Ionicons name="notifications-off-outline" size={64} color={COLORES.textoSuave} />
                  <Text style={styles.emptyText}>No hay notificaciones</Text>
                </View>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  notificacionesButton: {
    position: 'relative',
    padding: 8,
  },
  notificacionesBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#F5B800',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificacionesBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  modalFull: {
    flex: 1,
    backgroundColor: COLORES.fondo,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORES.texto,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalActionButton: { padding: 4 },
  modalCloseButton: { padding: 4 },
  modalScroll: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
  },
  notificacionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  notificacionItemVista: { opacity: 0.6 },
  notificacionLeft: { flexDirection: 'row', flex: 1 },
  notificacionIcono: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificacionContent: { flex: 1 },
  notificacionTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
    marginBottom: 4,
  },
  notificacionTituloVista: { color: COLORES.textoSecundario },
  notificacionDescripcion: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    marginBottom: 4,
    lineHeight: 20,
  },
  notificacionDescripcionVista: { color: COLORES.textoSuave },
  notificacionContacto: {
    fontSize: 12,
    color: COLORES.textoSecundario,
    fontWeight: '500',
  },
  notificacionContactoVista: { color: COLORES.textoSuave },
  notificacionDeleteButton: { padding: 4, marginLeft: 8 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: COLORES.textoSecundario,
    marginTop: 16,
  },
});
