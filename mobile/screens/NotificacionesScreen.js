import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORES } from '../constants/colores';
import { API_URL } from '../constants/api';

const FRECUENCIAS = {
  'Diario': 1,
  'Cada 2 días': 2,
  'Cada 3 días': 3,
  'Semanal': 7,
  'Cada 15 días': 15,
  'Mensual': 30,
  'Cada 2 meses': 60,
  'Cada 3 meses': 90,
  'Cada 6 meses': 180,
  'Anual': 365,
  'Cumpleaños': 'cumpleanos'
};

const STORAGE_KEY_NOTIFICACIONES_ELIMINADAS = '@notificaciones_eliminadas';
const STORAGE_KEY_ULTIMA_REVISION = '@ultima_revision_riego';

export default function NotificacionesScreen({ navigation }) {
  const [notificaciones, setNotificaciones] = useState([]);
  const [notificacionesFiltradas, setNotificacionesFiltradas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [notificacionesSeleccionadas, setNotificacionesSeleccionadas] = useState(new Set());
  const [notificacionesEliminadas, setNotificacionesEliminadas] = useState(new Set());

  useEffect(() => {
    cargarNotificacionesEliminadas();
    verificarRevisionDiaria();
    cargarNotificaciones();
  }, []);

  useEffect(() => {
    // Filtrar notificaciones eliminadas
    const filtradas = notificaciones.filter(notif => !notificacionesEliminadas.has(notif.id));
    setNotificacionesFiltradas(filtradas);
  }, [notificaciones, notificacionesEliminadas]);

  const cargarNotificacionesEliminadas = async () => {
    try {
      const eliminadasJson = await AsyncStorage.getItem(STORAGE_KEY_NOTIFICACIONES_ELIMINADAS);
      if (eliminadasJson) {
        const eliminadas = JSON.parse(eliminadasJson);
        setNotificacionesEliminadas(new Set(eliminadas));
      }
    } catch (error) {
      console.error('Error cargando notificaciones eliminadas:', error);
    }
  };

  const guardarNotificacionesEliminadas = async (eliminadas) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_NOTIFICACIONES_ELIMINADAS, JSON.stringify(Array.from(eliminadas)));
    } catch (error) {
      console.error('Error guardando notificaciones eliminadas:', error);
    }
  };

  const verificarRevisionDiaria = async () => {
    try {
      const ultimaRevisionStr = await AsyncStorage.getItem(STORAGE_KEY_ULTIMA_REVISION);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      if (ultimaRevisionStr) {
        const ultimaRevision = new Date(ultimaRevisionStr);
        ultimaRevision.setHours(0, 0, 0, 0);
        
        // Si ya se revisó hoy, no hacer nada
        if (ultimaRevision.getTime() === hoy.getTime()) {
          return;
        }
      }
      
      // Marcar que se revisó hoy y limpiar notificaciones de riego antiguas
      await AsyncStorage.setItem(STORAGE_KEY_ULTIMA_REVISION, hoy.toISOString());
      
      // Limpiar notificaciones de riego del día anterior
      const eliminadasJson = await AsyncStorage.getItem(STORAGE_KEY_NOTIFICACIONES_ELIMINADAS);
      if (eliminadasJson) {
        const eliminadas = JSON.parse(eliminadasJson);
        const eliminadasFiltradas = eliminadas.filter(id => !id.startsWith('riego-'));
        await AsyncStorage.setItem(STORAGE_KEY_NOTIFICACIONES_ELIMINADAS, JSON.stringify(eliminadasFiltradas));
        setNotificacionesEliminadas(new Set(eliminadasFiltradas));
      }
    } catch (error) {
      console.error('Error verificando revisión diaria:', error);
    }
  };

  const calcularDegradacion = (contacto) => {
    const frecuencia = contacto.frecuencia || 'Mensual';
    let diasEsperados = 30;
    
    if (frecuencia === 'Cumpleaños') {
      if (!contacto.fechaNacimiento) {
        return { nivel: 1, diasSinAtencion: 365 };
      }
      
      const partes = contacto.fechaNacimiento.split('/');
      if (partes.length < 2) {
        return { nivel: 1, diasSinAtencion: 365 };
      }
      
      const hoy = new Date();
      const mesCumple = parseInt(partes[1]) - 1;
      const diaCumple = parseInt(partes[0]);
      const anioActual = hoy.getFullYear();
      
      let proximoCumple = new Date(anioActual, mesCumple, diaCumple);
      if (proximoCumple < hoy) {
        proximoCumple = new Date(anioActual + 1, mesCumple, diaCumple);
      }
      
      const diasHastaCumple = Math.floor((proximoCumple - hoy) / (1000 * 60 * 60 * 24));
      diasEsperados = 30;
      
      if (diasHastaCumple <= 30) {
        const ratio = (30 - diasHastaCumple) / 30;
        return { nivel: ratio, diasSinAtencion: diasHastaCumple };
      }
      
      return { nivel: 0, diasSinAtencion: diasHastaCumple };
    }
    
    diasEsperados = FRECUENCIAS[frecuencia] || 30;
    
    let ultimaInteraccion = null;
    if (contacto.fechaRecordatorio) {
      ultimaInteraccion = new Date(contacto.fechaRecordatorio);
    } else if (contacto.interacciones && contacto.interacciones.length > 0) {
      const interaccionesCompletadas = contacto.interacciones.filter(i => !i.esTarea || i.completada);
      if (interaccionesCompletadas.length > 0) {
        const ultimaInteraccionObj = interaccionesCompletadas.sort((a, b) => 
          new Date(b.fechaHora) - new Date(a.fechaHora)
        )[0];
        ultimaInteraccion = new Date(ultimaInteraccionObj.fechaHora);
      }
    }
    
    if (!ultimaInteraccion) {
      return { nivel: 1, diasSinAtencion: 999 };
    }
    
    const hoy = new Date();
    const diasSinAtencion = Math.floor((hoy - ultimaInteraccion) / (1000 * 60 * 60 * 24));
    const nivel = Math.min(1, diasSinAtencion / diasEsperados);
    
    return { nivel, diasSinAtencion };
  };

  const cargarNotificaciones = async () => {
    try {
      const res = await fetchWithAuth(API_URL);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const contactos = await res.json();
      
      const notifs = [];
      const hoy = new Date();
      
      // 1. Gestos pendientes (array por contacto)
      contactos.forEach(contacto => {
        if (contacto.tareas && contacto.tareas.length > 0) {
          contacto.tareas.forEach(tarea => {
            if (!tarea.completada && tarea.fechaHoraEjecucion) {
              const fechaEjecucion = new Date(tarea.fechaHoraEjecucion);
              const hoy = new Date();
              hoy.setHours(0, 0, 0, 0);
              fechaEjecucion.setHours(0, 0, 0, 0);
              const diasRestantes = Math.floor((fechaEjecucion - hoy) / (1000 * 60 * 60 * 24));
              
              // Solo mostrar gestos que no estén vencidos por más de 7 días o futuros
              if (diasRestantes >= -7) {
                notifs.push({
                  id: `tarea-${contacto._id}-${tarea.fechaHoraCreacion}`,
                  tipo: 'tarea',
                  prioridad: diasRestantes <= 0 ? 'urgente' : diasRestantes <= 3 ? 'alta' : 'media',
                  titulo: `📋 ${tarea.clasificacion || 'Gesto'}`,
                  descripcion: tarea.descripcion,
                  contacto: contacto.nombre,
                  contactoId: contacto._id,
                  tarea: tarea,
                  fechaEjecucion: fechaEjecucion,
                  diasRestantes: diasRestantes,
                  fechaCreacion: new Date(tarea.fechaHoraCreacion)
                });
              }
            }
          });
        }
      });
      
      // 2. Contactos que necesitan riego
      contactos.forEach(contacto => {
        const degradacion = calcularDegradacion(contacto);
        if (degradacion.nivel > 0.4) {
          notifs.push({
            id: `riego-${contacto._id}`,
            tipo: 'riego',
            prioridad: degradacion.nivel > 0.7 ? 'urgente' : degradacion.nivel > 0.5 ? 'alta' : 'media',
            titulo: `💧 Necesita atención`,
            descripcion: `${contacto.nombre} no ha recibido atención en ${degradacion.diasSinAtencion} días`,
            contacto: contacto.nombre,
            contactoId: contacto._id,
            nivelDegradacion: degradacion.nivel,
            diasSinAtencion: degradacion.diasSinAtencion,
            fechaCreacion: new Date()
          });
        }
      });
      
      // 3. Sugerencias del sistema
      contactos.forEach(contacto => {
        // Sin interacciones recientes (más de 60 días)
        const degradacion = calcularDegradacion(contacto);
        if (degradacion.diasSinAtencion > 60 && degradacion.nivel < 0.4) {
          notifs.push({
            id: `sugerencia-sin-interaccion-${contacto._id}`,
            tipo: 'sugerencia',
            prioridad: 'baja',
            titulo: `💡 Sugerencia`,
            descripcion: `Hace ${degradacion.diasSinAtencion} días que no interactúas con ${contacto.nombre}`,
            contacto: contacto.nombre,
            contactoId: contacto._id,
            fechaCreacion: new Date()
          });
        }
        
        // Cumpleaños próximos (próximos 7 días)
        if (contacto.fechaNacimiento) {
          const partes = contacto.fechaNacimiento.split('/');
          if (partes.length >= 2) {
            const mesCumple = parseInt(partes[1]) - 1;
            const diaCumple = parseInt(partes[0]);
            const anioActual = hoy.getFullYear();
            
            let proximoCumple = new Date(anioActual, mesCumple, diaCumple);
            if (proximoCumple < hoy) {
              proximoCumple = new Date(anioActual + 1, mesCumple, diaCumple);
            }
            
            const diasHastaCumple = Math.floor((proximoCumple - hoy) / (1000 * 60 * 60 * 24));
            if (diasHastaCumple >= 0 && diasHastaCumple <= 7) {
              notifs.push({
                id: `cumpleanos-${contacto._id}`,
                tipo: 'sugerencia',
                prioridad: diasHastaCumple === 0 ? 'urgente' : 'alta',
                titulo: `🎂 ${diasHastaCumple === 0 ? '¡Hoy es su cumpleaños!' : `Cumpleaños en ${diasHastaCumple} día${diasHastaCumple > 1 ? 's' : ''}`}`,
                descripcion: `${contacto.nombre} cumple años ${diasHastaCumple === 0 ? 'hoy' : `en ${diasHastaCumple} día${diasHastaCumple > 1 ? 's' : ''}`}`,
                contacto: contacto.nombre,
                contactoId: contacto._id,
                fechaCumpleanos: proximoCumple,
                diasHastaCumple: diasHastaCumple,
                fechaCreacion: new Date()
              });
            }
          }
        }
      });
      
      // Ordenar por prioridad y fecha
      notifs.sort((a, b) => {
        const prioridadOrden = { urgente: 0, alta: 1, media: 2, baja: 3 };
        if (prioridadOrden[a.prioridad] !== prioridadOrden[b.prioridad]) {
          return prioridadOrden[a.prioridad] - prioridadOrden[b.prioridad];
        }
        return a.fechaCreacion - b.fechaCreacion;
      });
      
      setNotificaciones(notifs);
      setCargando(false);
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
      setCargando(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await cargarNotificaciones();
    setRefreshing(false);
  };

  const obtenerColorPrioridad = (prioridad) => {
    switch (prioridad) {
      case 'urgente': return COLORES.urgente;
      case 'alta': return COLORES.atencion;
      case 'media': return COLORES.activo;
      default: return COLORES.textoSuave;
    }
  };

  const obtenerIconoTipo = (tipo) => {
    switch (tipo) {
      case 'tarea': return 'checkbox';
      case 'riego': return 'water';
      case 'sugerencia': return 'bulb';
      default: return 'notifications';
    }
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const hoy = new Date();
    const fechaObj = new Date(fecha);
    const diffMs = fechaObj - hoy;
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDias === 0) return 'Hoy';
    if (diffDias === 1) return 'Mañana';
    if (diffDias === -1) return 'Ayer';
    if (diffDias > 0 && diffDias <= 7) return `En ${diffDias} días`;
    if (diffDias < 0 && diffDias >= -7) return `Hace ${Math.abs(diffDias)} días`;
    
    return fechaObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  const toggleSeleccion = (notifId) => {
    const nuevasSeleccionadas = new Set(notificacionesSeleccionadas);
    if (nuevasSeleccionadas.has(notifId)) {
      nuevasSeleccionadas.delete(notifId);
    } else {
      nuevasSeleccionadas.add(notifId);
    }
    setNotificacionesSeleccionadas(nuevasSeleccionadas);
  };

  const seleccionarTodas = () => {
    const todasIds = notificacionesFiltradas.map(n => n.id);
    setNotificacionesSeleccionadas(new Set(todasIds));
  };

  const deseleccionarTodas = () => {
    setNotificacionesSeleccionadas(new Set());
  };

  const eliminarSeleccionadas = () => {
    if (notificacionesSeleccionadas.size === 0) {
      Alert.alert('Atención', 'No hay notificaciones seleccionadas');
      return;
    }

    Alert.alert(
      'Eliminar notificaciones',
      `¿Eliminar ${notificacionesSeleccionadas.size} notificación${notificacionesSeleccionadas.size > 1 ? 'es' : ''}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            const nuevasEliminadas = new Set(notificacionesEliminadas);
            notificacionesSeleccionadas.forEach(id => nuevasEliminadas.add(id));
            setNotificacionesEliminadas(nuevasEliminadas);
            setNotificacionesSeleccionadas(new Set());
            setModoSeleccion(false);
            guardarNotificacionesEliminadas(nuevasEliminadas);
          }
        }
      ]
    );
  };

  const eliminarTodas = () => {
    if (notificacionesFiltradas.length === 0) {
      Alert.alert('Atención', 'No hay notificaciones para eliminar');
      return;
    }

    Alert.alert(
      'Eliminar todas',
      `¿Eliminar todas las ${notificacionesFiltradas.length} notificaciones?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar todas',
          style: 'destructive',
          onPress: () => {
            const todasIds = notificacionesFiltradas.map(n => n.id);
            const nuevasEliminadas = new Set([...notificacionesEliminadas, ...todasIds]);
            setNotificacionesEliminadas(nuevasEliminadas);
            setNotificacionesSeleccionadas(new Set());
            setModoSeleccion(false);
            guardarNotificacionesEliminadas(nuevasEliminadas);
          }
        }
      ]
    );
  };

  const handleNotificacionPress = (notif) => {
    if (modoSeleccion) {
      toggleSeleccion(notif.id);
    } else {
      // Navegar a Vínculos y abrir el contacto
      navigation.navigate('Vínculos');
      // El contacto se abrirá desde VinculosScreen usando el contactoId
    }
  };

  const renderNotificacion = ({ item }) => {
    const colorPrioridad = obtenerColorPrioridad(item.prioridad);
    const estaSeleccionada = notificacionesSeleccionadas.has(item.id);
    
    return (
      <TouchableOpacity 
        style={[
          styles.notificacionCard, 
          { borderLeftColor: colorPrioridad },
          modoSeleccion && estaSeleccionada && styles.notificacionCardSeleccionada
        ]}
        onPress={() => handleNotificacionPress(item)}
        onLongPress={() => {
          if (!modoSeleccion) {
            setModoSeleccion(true);
            toggleSeleccion(item.id);
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.notificacionHeader}>
          {modoSeleccion && (
            <TouchableOpacity 
              style={styles.checkboxContainer}
              onPress={() => toggleSeleccion(item.id)}
            >
              <Ionicons 
                name={estaSeleccionada ? "checkbox" : "checkbox-outline"} 
                size={24} 
                color={estaSeleccionada ? COLORES.activo : COLORES.textoSuave} 
              />
            </TouchableOpacity>
          )}
          <View style={[styles.iconoContainer, { backgroundColor: colorPrioridad + '20' }]}>
            <Ionicons name={obtenerIconoTipo(item.tipo)} size={24} color={colorPrioridad} />
          </View>
          <View style={styles.notificacionContent}>
            <Text style={styles.notificacionTitulo}>{item.titulo}</Text>
            <Text style={styles.notificacionDescripcion}>{item.descripcion}</Text>
            {item.tipo === 'tarea' && item.fechaEjecucion && (
              <Text style={styles.notificacionFecha}>
                📅 {formatearFecha(item.fechaEjecucion)} {item.fechaEjecucion.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </Text>
            )}
            {item.tipo === 'riego' && (
              <Text style={styles.notificacionFecha}>
                ⏱️ Sin atención por {item.diasSinAtencion} días
              </Text>
            )}
          </View>
          {!modoSeleccion && item.prioridad === 'urgente' && (
            <View style={styles.badgeUrgente}>
              <Text style={styles.badgeUrgenteText}>!</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="notifications-outline" size={64} color={COLORES.textoSuave} />
      <Text style={styles.emptyText}>No hay notificaciones</Text>
      <Text style={styles.emptySubtext}>Todo está al día</Text>
    </View>
  );

  if (cargando) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerContainer}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.header}>Notificaciones</Text>
            <Text style={styles.subheader}>Cargando...</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORES.agua} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.header}>Notificaciones</Text>
          <Text style={styles.subheader}>{notificacionesFiltradas.length} pendiente{notificacionesFiltradas.length !== 1 ? 's' : ''}</Text>
        </View>
        {modoSeleccion ? (
          <View style={styles.headerActionsRow}>
            <TouchableOpacity 
              style={styles.headerButtonIcon}
              onPress={notificacionesSeleccionadas.size === notificacionesFiltradas.length ? deseleccionarTodas : seleccionarTodas}
            >
              <Ionicons name={notificacionesSeleccionadas.size === notificacionesFiltradas.length ? "square-outline" : "checkbox"} size={20} color={COLORES.texto} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerButtonIcon, styles.headerButtonDanger]}
              onPress={eliminarSeleccionadas}
              disabled={notificacionesSeleccionadas.size === 0}
            >
              <Ionicons name="trash-outline" size={20} color={notificacionesSeleccionadas.size === 0 ? COLORES.textoSuave : COLORES.urgente} />
            </TouchableOpacity>
            {notificacionesSeleccionadas.size > 0 && (
              <Text style={styles.headerCounter}>{notificacionesSeleccionadas.size}</Text>
            )}
            <TouchableOpacity 
              style={styles.headerButtonIcon}
              onPress={() => {
                setModoSeleccion(false);
                setNotificacionesSeleccionadas(new Set());
              }}
            >
              <Ionicons name="close" size={20} color={COLORES.texto} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerActionsRow}>
            {notificacionesFiltradas.length > 0 && (
              <TouchableOpacity 
                style={styles.headerButtonIcon}
                onPress={eliminarTodas}
              >
                <Ionicons name="trash-outline" size={20} color={COLORES.urgente} />
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={styles.headerButtonIcon}
              onPress={() => setModoSeleccion(true)}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={COLORES.texto} />
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      <FlatList
        data={notificacionesFiltradas}
        renderItem={renderNotificacion}
        keyExtractor={(item) => item.id}
        contentContainerStyle={notificacionesFiltradas.length === 0 ? styles.emptyListContainer : styles.listContainer}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORES.agua]}
            tintColor={COLORES.agua}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORES.fondo,
    paddingTop: 60,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingTop: 8,
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORES.texto,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subheader: {
    fontSize: 14,
    color: COLORES.textoSuave,
    fontWeight: '400',
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  headerButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORES.fondo,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORES.sombra,
  },
  headerButtonDanger: {
    backgroundColor: COLORES.urgente + '15',
    borderColor: COLORES.urgente + '30',
  },
  headerCounter: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORES.urgente,
    marginLeft: -4,
    minWidth: 20,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
  },
  emptyListContainer: {
    flex: 1,
  },
  notificacionCard: {
    backgroundColor: COLORES.burbujaFondo,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: COLORES.sombra,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  notificacionCardSeleccionada: {
    backgroundColor: COLORES.activoClaro,
    borderWidth: 2,
    borderColor: COLORES.activo,
  },
  notificacionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxContainer: {
    marginRight: 12,
    padding: 4,
  },
  iconoContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificacionContent: {
    flex: 1,
  },
  notificacionTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
    marginBottom: 4,
  },
  notificacionDescripcion: {
    fontSize: 14,
    color: COLORES.textoSuave,
    marginBottom: 6,
    lineHeight: 20,
  },
  notificacionFecha: {
    fontSize: 12,
    color: COLORES.textoSuave,
    marginTop: 4,
  },
  badgeUrgente: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORES.urgente,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  badgeUrgenteText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORES.texto,
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORES.textoSuave,
    marginTop: 10,
    textAlign: 'center',
  },
});
