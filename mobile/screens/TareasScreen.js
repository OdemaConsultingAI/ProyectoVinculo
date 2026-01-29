import React, { useState, useEffect, useMemo } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator,
  RefreshControl,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORES } from '../constants/colores';
import { API_URL, fetchWithAuth } from '../constants/api';
import { getConnectionStatus, getPendingSyncCount } from '../services/syncService';

const FILTROS = ['Hoy', 'Semana', 'Mes'];

export default function TareasScreen() {
  const [contactos, setContactos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroActivo, setFiltroActivo] = useState('Hoy');
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    cargarTareas();
  }, []);

  const cargarTareas = async () => {
    try {
      setCargando(true);
      
      // Verificar estado de conexión
      const online = await getConnectionStatus();
      setIsOnline(online);
      
      const res = await fetchWithAuth(API_URL);
      if (!res.ok) {
        throw new Error('Error al cargar contactos');
      }
      const data = await res.json();
      setContactos(data || []);
      
      // Actualizar contador de pendientes
      const pendingCount = await getPendingSyncCount();
      setPendingSyncCount(pendingCount);
    } catch (error) {
      console.error('Error cargando tareas:', error);
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  };

  // Obtener todas las tareas de todos los contactos
  const todasLasTareas = useMemo(() => {
    const tareas = [];
    contactos.forEach(contacto => {
      if (contacto.tareas && contacto.tareas.length > 0) {
        contacto.tareas.forEach((tarea, index) => {
          if (!tarea.completada && tarea.fechaHoraEjecucion) {
            tareas.push({
              ...tarea,
              contactoId: contacto._id,
              contactoNombre: contacto.nombre,
              contactoTelefono: contacto.telefono,
              contactoFoto: contacto.foto,
              fechaEjecucion: new Date(tarea.fechaHoraEjecucion),
              fechaHoraCreacion: tarea.fechaHoraCreacion, // Preservar para identificar la tarea
              tareaIndex: index // Guardar el índice original
            });
          }
        });
      }
    });
    return tareas.sort((a, b) => a.fechaEjecucion - b.fechaEjecucion);
  }, [contactos]);

  // Filtrar tareas según el filtro activo
  const tareasFiltradas = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    return todasLasTareas.filter(tarea => {
      const fechaEjecucion = new Date(tarea.fechaEjecucion);
      fechaEjecucion.setHours(0, 0, 0, 0);
      
      switch (filtroActivo) {
        case 'Hoy':
          return fechaEjecucion.getTime() === hoy.getTime();
        
        case 'Semana':
          const finSemana = new Date(hoy);
          finSemana.setDate(finSemana.getDate() + 7);
          return fechaEjecucion >= hoy && fechaEjecucion < finSemana;
        
        case 'Mes':
          const finMes = new Date(hoy);
          finMes.setMonth(finMes.getMonth() + 1);
          return fechaEjecucion >= hoy && fechaEjecucion < finMes;
        
        default:
          return true;
      }
    });
  }, [todasLasTareas, filtroActivo]);

  const toggleTareaCompletada = async (contactoId, tareaIndex) => {
    try {
      const contacto = contactos.find(c => c._id === contactoId);
      if (!contacto) return;

      const tareasActualizadas = [...(contacto.tareas || [])];
      const nuevaCompletada = !tareasActualizadas[tareaIndex].completada;
      tareasActualizadas[tareaIndex].completada = nuevaCompletada;
      
      // Si se está completando la tarea, guardar la fecha/hora actual
      // Si se está desmarcando, eliminar la fecha de completado
      if (nuevaCompletada) {
        tareasActualizadas[tareaIndex].fechaHoraCompletado = new Date();
      } else {
        delete tareasActualizadas[tareaIndex].fechaHoraCompletado;
      }

      const result = await updateContactTareas(contactoId, tareasActualizadas);

      if (result.success) {
        // Actualizar contacto localmente
        const contactosActualizados = contactos.map(c => 
          c._id === contactoId ? result.contacto : c
        );
        setContactos(contactosActualizados);
        
        // Actualizar contador de pendientes
        const pendingCount = await getPendingSyncCount();
        setPendingSyncCount(pendingCount);
        
        if (result.offline) {
          console.log('📝 Cambio de tarea guardado localmente, se sincronizará cuando haya conexión');
        }
      }
    } catch (error) {
      console.error('Error actualizando tarea:', error);
    }
  };

  const formatearFecha = (fecha) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaTarea = new Date(fecha);
    fechaTarea.setHours(0, 0, 0, 0);
    
    const diffDias = Math.floor((fechaTarea - hoy) / (1000 * 60 * 60 * 24));
    
    if (diffDias === 0) return 'Hoy';
    if (diffDias === 1) return 'Mañana';
    if (diffDias === -1) return 'Ayer';
    if (diffDias > 1 && diffDias <= 7) return `En ${diffDias} días`;
    if (diffDias < -1 && diffDias >= -7) return `Hace ${Math.abs(diffDias)} días`;
    
    return fechaTarea.toLocaleDateString('es-ES', { 
      day: 'numeric', 
      month: 'short',
      year: fechaTarea.getFullYear() !== hoy.getFullYear() ? 'numeric' : undefined
    });
  };

  const formatearHora = (fecha) => {
    return new Date(fecha).toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getPrioridadColor = (fechaEjecucion) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaTarea = new Date(fechaEjecucion);
    fechaTarea.setHours(0, 0, 0, 0);
    
    const diffDias = Math.floor((fechaTarea - hoy) / (1000 * 60 * 60 * 24));
    
    if (diffDias < 0) return COLORES.urgente; // Vencida
    if (diffDias === 0) return COLORES.atencion; // Hoy
    if (diffDias <= 3) return COLORES.atencion; // Próximos 3 días
    return COLORES.activo; // Futuro
  };

  const renderTarea = ({ item, index }) => {
    const contacto = contactos.find(c => c._id === item.contactoId);
    // Usar el índice guardado o buscar la tarea
    const tareaIndex = item.tareaIndex !== undefined ? item.tareaIndex : 
      (contacto?.tareas?.findIndex(t => {
        const tFechaCreacion = t.fechaHoraCreacion ? new Date(t.fechaHoraCreacion).getTime() : null;
        const itemFechaCreacion = item.fechaHoraCreacion ? new Date(item.fechaHoraCreacion).getTime() : null;
        const tFechaEjecucion = t.fechaHoraEjecucion ? new Date(t.fechaHoraEjecucion).getTime() : null;
        const itemFechaEjecucion = item.fechaEjecucion ? item.fechaEjecucion.getTime() : null;
        return tFechaCreacion === itemFechaCreacion && tFechaEjecucion === itemFechaEjecucion;
      }) ?? -1);

    return (
      <TouchableOpacity
        style={styles.tareaItem}
        onPress={() => {
          if (tareaIndex >= 0 && contacto) {
            toggleTareaCompletada(item.contactoId, tareaIndex);
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.tareaLeft}>
          <TouchableOpacity
            style={[
              styles.checkbox,
              item.completada && styles.checkboxCompletada
            ]}
            onPress={(e) => {
              e.stopPropagation();
              if (tareaIndex >= 0 && contacto) {
                toggleTareaCompletada(item.contactoId, tareaIndex);
              }
            }}
          >
            {item.completada && (
              <Ionicons name="checkmark" size={16} color="white" />
            )}
          </TouchableOpacity>
          
          <View style={styles.tareaInfo}>
            <View style={styles.tareaHeader}>
              <Text style={styles.tareaTitulo} numberOfLines={1}>
                {item.clasificacion || 'Tarea'}
              </Text>
              <View style={[
                styles.prioridadBadge,
                { backgroundColor: getPrioridadColor(item.fechaEjecucion) }
              ]}>
                <Text style={styles.prioridadText}>
                  {formatearFecha(item.fechaEjecucion)}
                </Text>
              </View>
            </View>
            
            <Text style={styles.tareaDescripcion} numberOfLines={2}>
              {item.descripcion}
            </Text>
            
            <View style={styles.tareaMeta}>
              <View style={styles.contactoInfo}>
                {contacto?.foto ? (
                  <Image source={{ uri: contacto.foto }} style={styles.contactoAvatar} />
                ) : (
                  <View style={styles.contactoAvatarPlaceholder}>
                    <Ionicons name="person" size={16} color={COLORES.textoSecundario} />
                  </View>
                )}
                <Text style={styles.contactoNombre}>{item.contactoNombre}</Text>
              </View>
              
              <View style={styles.horaContainer}>
                <Ionicons name="time-outline" size={14} color={COLORES.textoSecundario} />
                <Text style={styles.horaText}>{formatearHora(item.fechaEjecucion)}</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (cargando) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORES.agua} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.headerTitle}>Tareas</Text>
          {/* Icono offline si no hay conexión - nube tachada en rojo */}
          {!isOnline && (
            <Ionicons name="cloud-offline-outline" size={18} color={COLORES.urgente} />
          )}
        </View>
        <Text style={styles.headerSubtitle}>
          {tareasFiltradas.length} {tareasFiltradas.length === 1 ? 'tarea' : 'tareas'}
        </Text>
      </View>

      {/* Filtros */}
      <View style={styles.filtrosContainer}>
        {FILTROS.map((filtro) => (
          <TouchableOpacity
            key={filtro}
            style={[
              styles.filtroButton,
              filtroActivo === filtro && styles.filtroButtonActive
            ]}
            onPress={() => setFiltroActivo(filtro)}
          >
            <Text style={[
              styles.filtroText,
              filtroActivo === filtro && styles.filtroTextActive
            ]}>
              {filtro}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Lista de tareas */}
      <FlatList
        data={tareasFiltradas}
        keyExtractor={(item, index) => `${item.contactoId}-${item.fechaHoraCreacion}-${index}`}
        renderItem={renderTarea}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={64} color={COLORES.textoSuave} />
            <Text style={styles.emptyText}>
              {filtroActivo === 'Hoy' 
                ? 'No hay tareas para hoy' 
                : filtroActivo === 'Semana'
                ? 'No hay tareas esta semana'
                : 'No hay tareas este mes'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              cargarTareas();
            }}
            colors={[COLORES.agua]}
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: COLORES.fondo,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: COLORES.texto,
  },
  headerSubtitle: {
    fontSize: 16,
    color: COLORES.textoSecundario,
    marginTop: 4,
  },
  filtrosContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  filtroButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: COLORES.fondoSecundario,
  },
  filtroButtonActive: {
    backgroundColor: COLORES.agua,
    borderColor: COLORES.agua,
  },
  filtroText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
  },
  filtroTextActive: {
    color: 'white',
  },
  listContent: {
    padding: 20,
    paddingTop: 8,
  },
  tareaItem: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tareaLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORES.textoSecundario,
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCompletada: {
    backgroundColor: COLORES.activo,
    borderColor: COLORES.activo,
  },
  tareaInfo: {
    flex: 1,
  },
  tareaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tareaTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
    flex: 1,
    marginRight: 8,
  },
  prioridadBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  prioridadText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  tareaDescripcion: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    marginBottom: 12,
    lineHeight: 20,
  },
  tareaMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  contactoAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  contactoAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORES.fondoSecundario,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  contactoNombre: {
    fontSize: 13,
    color: COLORES.textoSecundario,
    fontWeight: '500',
  },
  horaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  horaText: {
    fontSize: 12,
    color: COLORES.textoSecundario,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    color: COLORES.textoSecundario,
    marginTop: 16,
    textAlign: 'center',
  },
});
