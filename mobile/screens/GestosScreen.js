import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  Platform,
  Alert,
  ScrollView,
  Animated,
  Linking,
  Dimensions
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORES } from '../constants/colores';
import { API_URL, fetchWithAuth } from '../constants/api';
import { TIPOS_DE_GESTO_DISPLAY, GESTO_ICON_CONFIG } from '../constants/tiposDeGesto';
import { getConnectionStatus, getPendingSyncCount, updateContactTareas, updateContactInteracciones, saveInteractionFromVoice, saveTaskFromVoice, saveDesahogoFromVoice } from '../services/syncService';
import { normalizeForMatch } from '../utils/validations';
import { formatTime12h } from '../utils/dateTime';
import { startRecording, stopRecording, playPreviewUri, playFromBase64, uploadVoiceTemp, deleteVoiceTemp, transcribeVoiceTemp } from '../services/voiceToTaskService';
import NotificationBell from '../components/NotificationBell';
import AyudaContext from '../context/AyudaContext';
const useAyuda = AyudaContext?.useAyuda ?? (() => ({ visible: false, openAyuda: () => {}, closeAyuda: () => {} }));

const FILTROS = ['Hoy', 'Semana', 'Mes', 'Todas'];
const FILTROS_TIPO = ['Todas', ...TIPOS_DE_GESTO_DISPLAY];

const getGestoConfig = (clasificacion) => 
  GESTO_ICON_CONFIG[clasificacion] || GESTO_ICON_CONFIG['Otro'];

const limpiarTelefono = (telf) => (telf || '').replace(/[^\d+]/g, '');

export default function GestosScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [contactos, setContactos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroActivo, setFiltroActivo] = useState('Hoy');
  const [filtroTipoActivo, setFiltroTipoActivo] = useState('Todas');
  const [filtroContactoId, setFiltroContactoId] = useState(null); // null = Todos
  const [dropdownTiempoVisible, setDropdownTiempoVisible] = useState(false);
  const [dropdownTipoVisible, setDropdownTipoVisible] = useState(false);
  const [dropdownContactoVisible, setDropdownContactoVisible] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [modalHistorialVisible, setModalHistorialVisible] = useState(false);
  const [modalEditarVisible, setModalEditarVisible] = useState(false);
  const [tareaEditando, setTareaEditando] = useState(null);
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editClasificacion, setEditClasificacion] = useState('');
  const [editFechaEjecucion, setEditFechaEjecucion] = useState(new Date());
  const [editRecurrenteAnual, setEditRecurrenteAnual] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState('date');

  // Crear gesto desde pantalla Gestos: paso 1 = elegir contacto, paso 2 = formulario
  const [modalCrearTareaVisible, setModalCrearTareaVisible] = useState(false);
  const [pasoCrearTarea, setPasoCrearTarea] = useState('contacto'); // 'contacto' | 'formulario'
  const [contactoSeleccionadoParaTarea, setContactoSeleccionadoParaTarea] = useState(null);
  const [newTaskDescripcion, setNewTaskDescripcion] = useState('');
  const [newTaskClasificacion, setNewTaskClasificacion] = useState(TIPOS_DE_GESTO_DISPLAY[0] || 'Llamar');
  const [newTaskFechaEjecucion, setNewTaskFechaEjecucion] = useState(new Date());
  const [newTaskRecurrenteAnual, setNewTaskRecurrenteAnual] = useState(false);
  const [showDatePickerCrear, setShowDatePickerCrear] = useState(false);
  const [datePickerModeCrear, setDatePickerModeCrear] = useState('date');

  // Voz → tarea/interacción (IA): grabación, preview y guardar
  const [voiceRecording, setVoiceRecording] = useState(null);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [voicePreviewData, setVoicePreviewData] = useState(null);
  const [voicePreviewAudioUri, setVoicePreviewAudioUri] = useState(null);
  const [voicePreviewTempId, setVoicePreviewTempId] = useState(null);
  const [modalVoicePreviewVisible, setModalVoicePreviewVisible] = useState(false);
  const [voicePreviewTranscription, setVoicePreviewTranscription] = useState(null);
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  const [voicePreviewFechaEjecucion, setVoicePreviewFechaEjecucion] = useState(() => new Date());
  const [showDatePickerVoice, setShowDatePickerVoice] = useState(false);
  const [datePickerModeVoice, setDatePickerModeVoice] = useState('date');
  const recordingPulseAnim = useRef(new Animated.Value(1)).current;
  const transcribeGenRef = useRef(0);
  const { openAyuda } = useAyuda();

  // Transcribir nota temporal con Whisper cuando se abre el modal con tempId (solo aplicar resultado de la última petición)
  useEffect(() => {
    if (!modalVoicePreviewVisible || !voicePreviewTempId) return;
    const gen = ++transcribeGenRef.current;
    console.log('[GestosScreen] Iniciando transcripción para tempId:', voicePreviewTempId);
    setVoiceTranscribing(true);
    setVoicePreviewTranscription(null);
    transcribeVoiceTemp(voicePreviewTempId).then((result) => {
      if (gen !== transcribeGenRef.current) return;
      setVoiceTranscribing(false);
      console.log('[GestosScreen] transcribeVoiceTemp resultado:', result.success ? { textoLength: (result.texto || '').length, tipo: result.tipo } : { error: result.error });
      if (result.success) {
        setVoicePreviewTranscription(result.texto || '');
        const hoyStr = new Date().toISOString().slice(0, 10);
        const fechaStr = result.fecha || hoyStr;
        const fechaClamped = (result.tipo === 'tarea' && fechaStr < hoyStr) ? hoyStr : fechaStr;
        setVoicePreviewData({
          texto: result.texto || '',
          tipo: result.tipo || 'tarea',
          vinculo: result.vinculo || 'Sin asignar',
          tarea: result.tarea || '',
          descripcion: (result.descripcion && result.descripcion.trim()) ? result.descripcion.trim() : (result.texto || ''),
          fecha: fechaClamped,
          clasificacion: TIPOS_DE_GESTO_DISPLAY.includes(result.clasificacion) ? result.clasificacion : 'Otro',
          contactoId: result.contactoId || null,
          contactoNombre: result.contactoNombre || result.vinculo || 'Sin asignar',
        });
        const [y, m, d] = fechaClamped.split('-').map(Number);
        const horaStr = (result.hora || '09:00').toString().trim();
        const horaParts = horaStr.match(/^(\d{1,2}):(\d{2})$/);
        const h = horaParts ? Math.min(23, Math.max(0, parseInt(horaParts[1], 10))) : 9;
        const min = horaParts ? Math.min(59, Math.max(0, parseInt(horaParts[2], 10))) : 0;
        let fechaDate = new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1, h, min, 0, 0);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        if (result.tipo === 'tarea' && fechaDate.getTime() < hoy.getTime()) {
          fechaDate.setFullYear(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        }
        setVoicePreviewFechaEjecucion(isNaN(fechaDate.getTime()) ? new Date() : fechaDate);
      } else {
        setVoicePreviewTranscription(result.error || 'Error al transcribir');
      }
    }).catch((err) => {
      if (gen !== transcribeGenRef.current) return;
      console.log('[GestosScreen] transcribeVoiceTemp excepción:', err?.message);
      setVoiceTranscribing(false);
      setVoicePreviewTranscription('Error al transcribir');
    });
  }, [modalVoicePreviewVisible, voicePreviewTempId]);

  // Timer de grabación (actualizar cada segundo)
  useEffect(() => {
    if (!voiceRecording) {
      setRecordingStartTime(null);
      setRecordingElapsed(0);
      return;
    }
    setRecordingElapsed(0);
    const interval = setInterval(() => {
      setRecordingElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [voiceRecording]);

  // Animación del punto "grabando" (pulso)
  const recordingActiveRef = useRef(false);
  useEffect(() => {
    if (!voiceRecording) {
      recordingActiveRef.current = false;
      return;
    }
    recordingActiveRef.current = true;
    const loop = () => {
      if (!recordingActiveRef.current) return;
      Animated.sequence([
        Animated.timing(recordingPulseAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
        Animated.timing(recordingPulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start(() => loop());
    };
    loop();
    return () => {
      recordingActiveRef.current = false;
      recordingPulseAnim.stopAnimation();
    };
  }, [voiceRecording]);

  // Cargar/recargar tareas cuando la pestaña está enfocada (incl. al entrar y al volver desde Vínculos)
  useFocusEffect(
    useCallback(() => {
      cargarTareas();
    }, [])
  );

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

  // Calcular próxima ocurrencia para tarea recurrente anual
  const proximaOcurrenciaAnual = (tarea) => {
    const base = tarea.recurrencia?.fechaBase
      ? new Date(tarea.recurrencia.fechaBase)
      : tarea.fechaHoraEjecucion ? new Date(tarea.fechaHoraEjecucion) : null;
    if (!base) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const anioActual = hoy.getFullYear();
    const completados = tarea.completadoParaAno || [];
    if (completados.includes(anioActual)) return null;
    let next = new Date(anioActual, base.getMonth(), base.getDate());
    if (next < hoy) next = new Date(anioActual + 1, base.getMonth(), base.getDate());
    return next;
  };

  // Obtener todas las tareas pendientes (incluye recurrentes con próxima ocurrencia)
  const todasLasTareas = useMemo(() => {
    const tareas = [];
    contactos.forEach(contacto => {
      if (contacto.tareas && contacto.tareas.length > 0) {
        contacto.tareas.forEach((tarea, index) => {
          if (tarea.completada && !tarea.recurrencia?.tipo) return;
          let fechaEjecucion = null;
          if (tarea.recurrencia?.tipo === 'anual') {
            fechaEjecucion = proximaOcurrenciaAnual(tarea);
            if (!fechaEjecucion) return;
          } else if (!tarea.completada && tarea.fechaHoraEjecucion) {
            fechaEjecucion = new Date(tarea.fechaHoraEjecucion);
          }
          if (fechaEjecucion) {
            tareas.push({
              ...tarea,
              contactoId: contacto._id,
              contactoNombre: contacto.nombre,
              contactoTelefono: contacto.telefono,
              contactoFoto: contacto.foto,
              fechaEjecucion,
              fechaHoraCreacion: tarea.fechaHoraCreacion,
              tareaIndex: index,
              esRecurrente: !!tarea.recurrencia?.tipo,
            });
          }
        });
      }
    });
    return tareas.sort((a, b) => a.fechaEjecucion - b.fechaEjecucion);
  }, [contactos]);

  // Historial: tareas completadas
  const tareasHistorial = useMemo(() => {
    const list = [];
    contactos.forEach(contacto => {
      if (contacto.tareas) {
        contacto.tareas.forEach((tarea, index) => {
          if (tarea.completada && tarea.fechaHoraCompletado) {
            list.push({
              ...tarea,
              contactoId: contacto._id,
              contactoNombre: contacto.nombre,
              fechaCompletado: new Date(tarea.fechaHoraCompletado),
              tareaIndex: index,
            });
          }
        });
      }
    });
    return list.sort((a, b) => b.fechaCompletado - a.fechaCompletado);
  }, [contactos]);

  // Filtrar tareas según filtro de tiempo y filtro de tipo
  const tareasFiltradas = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let list = todasLasTareas;

    // Filtro por tiempo
    if (filtroActivo !== 'Todas') {
      list = list.filter(tarea => {
        const fechaEjecucion = new Date(tarea.fechaEjecucion);
        fechaEjecucion.setHours(0, 0, 0, 0);
        switch (filtroActivo) {
          case 'Hoy':
            return fechaEjecucion.getTime() === hoy.getTime();
          case 'Semana': {
            const finSemana = new Date(hoy);
            finSemana.setDate(finSemana.getDate() + 7);
            return fechaEjecucion >= hoy && fechaEjecucion < finSemana;
          }
          case 'Mes': {
            const finMes = new Date(hoy);
            finMes.setMonth(finMes.getMonth() + 1);
            return fechaEjecucion >= hoy && fechaEjecucion < finMes;
          }
          default:
            return true;
        }
      });
    }

    // Filtro por tipo (clasificación)
    if (filtroTipoActivo !== 'Todas') {
      list = list.filter(tarea => (tarea.clasificacion || 'Otro') === filtroTipoActivo);
    }

    // Filtro por contacto
    if (filtroContactoId) {
      list = list.filter(tarea => tarea.contactoId === filtroContactoId);
    }

    return list;
  }, [todasLasTareas, filtroActivo, filtroTipoActivo, filtroContactoId]);

  const toggleTareaCompletada = async (contactoId, tareaIndex) => {
    try {
      const contacto = contactos.find(c => c._id === contactoId);
      if (!contacto) return;

      const tareasActualizadas = [...(contacto.tareas || [])];
      const tarea = tareasActualizadas[tareaIndex];
      const nuevaCompletada = !tarea.completada;

      if (nuevaCompletada) {
        tareasActualizadas[tareaIndex].fechaHoraCompletado = new Date();
        tareasActualizadas[tareaIndex].completada = true;
        if (tarea.recurrencia?.tipo === 'anual') {
          const anio = new Date().getFullYear();
          const completados = [...(tarea.completadoParaAno || []), anio];
          tareasActualizadas[tareaIndex].completadoParaAno = [...new Set(completados)];
        }
      } else {
        delete tareasActualizadas[tareaIndex].fechaHoraCompletado;
        tareasActualizadas[tareaIndex].completada = false;
        if (tarea.recurrencia?.tipo === 'anual' && tarea.completadoParaAno?.length) {
          const anio = new Date().getFullYear();
          tareasActualizadas[tareaIndex].completadoParaAno = (tarea.completadoParaAno || []).filter(y => y !== anio);
        }
      }

      const result = await updateContactTareas(contactoId, tareasActualizadas);
      if (result.success) {
        setContactos(prev => prev.map(c => c._id === contactoId ? result.contacto : c));
        const pendingCount = await getPendingSyncCount();
        setPendingSyncCount(pendingCount);
        if (result.offline) console.log('📝 Cambio guardado localmente');
      }
    } catch (error) {
      console.error('Error actualizando gesto:', error);
    }
  };

  const restablecerTareaDelHistorial = async (contactoId, tareaIndex) => {
    await toggleTareaCompletada(contactoId, tareaIndex);
    setModalHistorialVisible(false);
  };

  const abrirEditarTarea = (item) => {
    setTareaEditando(item);
    setEditDescripcion(item.descripcion || '');
    setEditClasificacion(item.clasificacion || 'Llamar');
    setEditFechaEjecucion(item.fechaEjecucion ? new Date(item.fechaEjecucion) : new Date());
    setModalEditarVisible(true);
  };

  const guardarEditarTarea = async () => {
    if (!tareaEditando) return;
    try {
      const contacto = contactos.find(c => c._id === tareaEditando.contactoId);
      if (!contacto) return;
      const tareasActualizadas = [...(contacto.tareas || [])];
      const idx = tareaEditando.tareaIndex;
      if (idx < 0 || idx >= tareasActualizadas.length) return;
      const actual = tareasActualizadas[idx];
      tareasActualizadas[idx] = {
        ...actual,
        descripcion: editDescripcion.trim() || actual.descripcion,
        clasificacion: editClasificacion,
        fechaHoraEjecucion: editFechaEjecucion,
        ...(editRecurrenteAnual
          ? {
              recurrencia: { tipo: 'anual', fechaBase: editFechaEjecucion },
              completadoParaAno: actual.completadoParaAno || [],
            }
          : actual.recurrencia?.tipo === 'anual'
            ? { recurrencia: null, completadoParaAno: undefined }
            : {}),
      };
      const result = await updateContactTareas(tareaEditando.contactoId, tareasActualizadas);
      if (result.success) {
        setContactos(prev => prev.map(c => c._id === tareaEditando.contactoId ? result.contacto : c));
        setModalEditarVisible(false);
        setTareaEditando(null);
      }
    } catch (error) {
      console.error('Error guardando tarea:', error);
    }
  };

  const abrirModalCrearTarea = () => {
    setPasoCrearTarea('contacto');
    setContactoSeleccionadoParaTarea(null);
    setNewTaskDescripcion('');
    setNewTaskClasificacion(TIPOS_DE_GESTO_DISPLAY[0] || 'Llamar');
    setNewTaskFechaEjecucion(new Date());
    setNewTaskRecurrenteAnual(false);
    setModalCrearTareaVisible(true);
  };

  // Abrir modal "Crear gesto" o "Historial" cuando se navega desde el overlay; refrescar lista si viene de guardar gesto desde voz
  useFocusEffect(
    useCallback(() => {
      if (route.params?.openCrearGesto) {
        navigation.setParams({ openCrearGesto: undefined });
        abrirModalCrearTarea();
      }
      if (route.params?.openHistorialGestos) {
        navigation.setParams({ openHistorialGestos: undefined });
        setModalHistorialVisible(true);
      }
      if (route.params?.refreshGestos) {
        navigation.setParams({ refreshGestos: undefined });
        cargarTareas();
      }
    }, [route.params?.openCrearGesto, route.params?.openHistorialGestos, route.params?.refreshGestos, navigation])
  );

  const cerrarModalCrearTarea = () => {
    setModalCrearTareaVisible(false);
    setPasoCrearTarea('contacto');
    setContactoSeleccionadoParaTarea(null);
  };

  const seleccionarContactoParaTarea = (contacto) => {
    setContactoSeleccionadoParaTarea(contacto);
    setPasoCrearTarea('formulario');
  };

  const volverASelectorContacto = () => {
    setContactoSeleccionadoParaTarea(null);
    setPasoCrearTarea('contacto');
  };

  const guardarNuevaTarea = async () => {
    if (!contactoSeleccionadoParaTarea?._id) return;
    if (!newTaskDescripcion.trim()) {
      Alert.alert('Atención', 'Describe la atención.');
      return;
    }
    const tareasExistentes = Array.isArray(contactoSeleccionadoParaTarea.tareas) ? contactoSeleccionadoParaTarea.tareas : [];
    const fechaEjecucion = new Date();
    const nuevaTarea = {
      fechaHoraCreacion: new Date(),
      descripcion: newTaskDescripcion.trim(),
      fechaHoraEjecucion: fechaEjecucion,
      clasificacion: newTaskClasificacion,
      completada: false,
      ...(newTaskRecurrenteAnual && {
        recurrencia: { tipo: 'anual', fechaBase: fechaEjecucion },
        completadoParaAno: [],
      }),
    };
    const tareasActualizadas = [...tareasExistentes, nuevaTarea];
    try {
      const result = await updateContactTareas(contactoSeleccionadoParaTarea._id, tareasActualizadas);
      if (result.success) {
        setContactos(prev => prev.map(c => c._id === contactoSeleccionadoParaTarea._id ? result.contacto : c));
        cerrarModalCrearTarea();
      } else {
        Alert.alert('Error', 'No se pudo guardar la atención.');
      }
    } catch (e) {
      console.error('Error guardando nuevo gesto:', e);
      Alert.alert('Error', 'No se pudo guardar la atención.');
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

  const formatearHora = (fecha) => formatTime12h(fecha);

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

  const renderLeftActions = (item, contacto, tareaIndex) => {
    if (tareaIndex < 0 || !contacto) return null;
    return (
      <View style={styles.swipeListoContainer}>
        <Ionicons name="checkmark-done" size={24} color="white" />
        <Text style={styles.swipeListoText}>Listo</Text>
      </View>
    );
  };

  const ejecutarAccionGesto = (item, contacto) => {
    const clasificacion = item.clasificacion || 'Otro';
    const config = getGestoConfig(clasificacion);
    const telefono = item.contactoTelefono || contacto?.telefono;
    if (config.action === 'call' && telefono) {
      Linking.openURL(`tel:${limpiarTelefono(telefono)}`);
    } else if (config.action === 'whatsapp' && telefono) {
      Linking.openURL(`whatsapp://send?phone=${limpiarTelefono(telefono)}`);
    }
  };

  const renderTarea = ({ item, index }) => {
    const contacto = contactos.find(c => c._id === item.contactoId);
    const tareaIndex = item.tareaIndex !== undefined ? item.tareaIndex : 
      (contacto?.tareas?.findIndex(t => {
        const tFechaCreacion = t.fechaHoraCreacion ? new Date(t.fechaHoraCreacion).getTime() : null;
        const itemFechaCreacion = item.fechaHoraCreacion ? new Date(item.fechaHoraCreacion).getTime() : null;
        const tFechaEjecucion = t.fechaHoraEjecucion ? new Date(t.fechaHoraEjecucion).getTime() : null;
        const itemFechaEjecucion = item.fechaEjecucion ? item.fechaEjecucion.getTime() : null;
        return tFechaCreacion === itemFechaCreacion && tFechaEjecucion === itemFechaEjecucion;
      }) ?? -1);

    const clasificacion = item.clasificacion || 'Otro';
    const gestoConfig = getGestoConfig(clasificacion);
    const tieneAccion = gestoConfig.action && (item.contactoTelefono || contacto?.telefono);

    return (
      <Swipeable
        renderLeftActions={() => renderLeftActions(item, contacto, tareaIndex)}
        onSwipeableOpen={(direction) => {
          if (direction === 'left' && tareaIndex >= 0 && contacto) {
            toggleTareaCompletada(item.contactoId, tareaIndex);
          }
        }}
        friction={2}
        leftThreshold={80}
      >
        <View style={styles.tareaItem}>
          <View style={styles.tareaLeft}>
            <TouchableOpacity
              style={styles.editTareaButtonLeft}
              onPress={() => abrirEditarTarea(item)}
            >
              <Ionicons name="brush-outline" size={22} color={COLORES.agua} />
            </TouchableOpacity>
            
            <View style={styles.tareaInfo}>
              {/* Fila 1: Acción (con emoji) a la izquierda, nombre del contacto a la derecha */}
              <View style={styles.tareaHeader}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.tareaTitulo} numberOfLines={1}>
                      {gestoConfig.emoji} {gestoConfig.actionLabel ?? clasificacion}
                    </Text>
                  {item.esRecurrente && (
                    <View style={styles.recurrenteBadge}>
                      <Text style={styles.recurrenteBadgeText}>Anual</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.tareaContactoDerecha} numberOfLines={1}>
                  {item.contactoNombre || '—'}
                </Text>
              </View>
            
              <Text style={styles.tareaDescripcion} numberOfLines={2}>
                {item.descripcion}
              </Text>
            
              <View style={styles.tareaMeta}>
                <View style={[
                  styles.prioridadBadge,
                  { backgroundColor: getPrioridadColor(item.fechaEjecucion) }
                ]}>
                  <Text style={styles.prioridadText}>
                    {formatearFecha(item.fechaEjecucion)}
                  </Text>
                </View>
                <View style={styles.horaContainer}>
                  <Ionicons name="time-outline" size={14} color={COLORES.textoSecundario} />
                  <Text style={styles.horaText}>{formatearHora(item.fechaEjecucion)}</Text>
                </View>
              </View>

              {/* Botón de acción: icono + nombre (Llamar, Enviar mensaje, etc.) */}
              {tieneAccion ? (
                <TouchableOpacity
                  style={[styles.accionButton, { backgroundColor: gestoConfig.color }]}
                  onPress={() => ejecutarAccionGesto(item, contacto)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={gestoConfig.icon} size={20} color="white" />
                  <Text style={styles.accionButtonText}>{gestoConfig.actionLabel ?? clasificacion}</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.accionButton, styles.accionButtonInactivo]}>
                  <Text style={styles.accionButtonEmoji}>{gestoConfig.emoji}</Text>
                  <Text style={styles.accionButtonTextInactivo}>{gestoConfig.actionLabel ?? clasificacion}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Swipeable>
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

  const formatRecordingTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Franja roja grabando: siempre encima en toda la app vía GlobalVoiceOverlay */}

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name="sparkles" size={24} color={COLORES.agua} />
            <Text style={styles.headerTitle}>Atenciones</Text>
          </View>
          <TouchableOpacity onPress={() => setModalHistorialVisible(true)} style={{ padding: 8 }} accessibilityLabel="Historial de gestos">
            <Ionicons name="time-outline" size={24} color={COLORES.textoSuave} />
          </TouchableOpacity>
          <TouchableOpacity onPress={openAyuda} style={{ padding: 8 }} accessibilityLabel="Ayuda">
            <Ionicons name="help-circle-outline" size={26} color={COLORES.textoSuave} />
          </TouchableOpacity>
          <NotificationBell />
        </View>
        <Text style={styles.headerSubtitle}>Pequeños gestos que quieres tener con quienes te importan</Text>
      </View>

      {/* Desplegables: Filtro, Tipo, Contacto */}
      <View style={styles.desplegablesRow}>
        <View style={styles.desplegableWrap}>
          <View style={styles.desplegableLabelRow}>
            <Ionicons name="filter-outline" size={14} color={COLORES.textoSecundario} />
            <Text style={styles.desplegableLabel}>Filtro</Text>
          </View>
          <TouchableOpacity
            style={styles.desplegableButton}
            onPress={() => setDropdownTiempoVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.desplegableButtonText} numberOfLines={1}>{filtroActivo}</Text>
            <Ionicons name="chevron-down" size={20} color={COLORES.textoSecundario} />
          </TouchableOpacity>
        </View>
        <View style={styles.desplegableWrap}>
          <View style={styles.desplegableLabelRow}>
            <Ionicons name="pricetag-outline" size={14} color={COLORES.textoSecundario} />
            <Text style={styles.desplegableLabel}>Tipo</Text>
          </View>
          <TouchableOpacity
            style={styles.desplegableButton}
            onPress={() => setDropdownTipoVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.desplegableButtonText} numberOfLines={1}>{filtroTipoActivo}</Text>
            <Ionicons name="chevron-down" size={20} color={COLORES.textoSecundario} />
          </TouchableOpacity>
        </View>
        <View style={styles.desplegableWrap}>
          <View style={styles.desplegableLabelRow}>
            <Ionicons name="person-outline" size={14} color={COLORES.textoSecundario} />
            <Text style={styles.desplegableLabel}>Contacto</Text>
          </View>
          <TouchableOpacity
            style={styles.desplegableButton}
            onPress={() => setDropdownContactoVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.desplegableButtonText} numberOfLines={1}>
              {filtroContactoId ? (contactos.find(c => c._id === filtroContactoId)?.nombre || 'Contacto') : 'Todos'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={COLORES.textoSecundario} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal desplegable Filtro */}
      <Modal
        visible={dropdownTiempoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownTiempoVisible(false)}
      >
        <View style={styles.dropdownOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDropdownTiempoVisible(false)} />
          <View style={styles.dropdownContent}>
            <Text style={styles.dropdownTitle}>Filtro</Text>
            <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
              {FILTROS.map((opcion) => (
                <TouchableOpacity
                  key={opcion}
                  style={[styles.dropdownItem, filtroActivo === opcion && styles.dropdownItemActive]}
                  onPress={() => {
                    setFiltroActivo(opcion);
                    setDropdownTiempoVisible(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, filtroActivo === opcion && styles.dropdownItemTextActive]}>{opcion}</Text>
                  {filtroActivo === opcion && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal desplegable Tipo */}
      <Modal
        visible={dropdownTipoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownTipoVisible(false)}
      >
        <View style={styles.dropdownOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDropdownTipoVisible(false)} />
          <View style={styles.dropdownContent}>
                <Text style={styles.dropdownTitle}>Tipo de atención</Text>
            <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
              {FILTROS_TIPO.map((opcion) => (
                <TouchableOpacity
                  key={opcion}
                  style={[styles.dropdownItem, filtroTipoActivo === opcion && styles.dropdownItemActive]}
                  onPress={() => {
                    setFiltroTipoActivo(opcion);
                    setDropdownTipoVisible(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, filtroTipoActivo === opcion && styles.dropdownItemTextActive]}>{opcion}</Text>
                  {filtroTipoActivo === opcion && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal desplegable Contacto */}
      <Modal
        visible={dropdownContactoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownContactoVisible(false)}
      >
        <View style={styles.dropdownOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDropdownContactoVisible(false)} />
          <View style={styles.dropdownContent}>
            <Text style={styles.dropdownTitle}>Buscar por contacto</Text>
            <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.dropdownItem, !filtroContactoId && styles.dropdownItemActive]}
                onPress={() => {
                  setFiltroContactoId(null);
                  setDropdownContactoVisible(false);
                }}
              >
                <Text style={[styles.dropdownItemText, !filtroContactoId && styles.dropdownItemTextActive]}>Todos</Text>
                {!filtroContactoId && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
              </TouchableOpacity>
              {contactos.map((c) => (
                <TouchableOpacity
                  key={c._id}
                  style={[styles.dropdownItem, filtroContactoId === c._id && styles.dropdownItemActive]}
                  onPress={() => {
                    setFiltroContactoId(c._id);
                    setDropdownContactoVisible(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, filtroContactoId === c._id && styles.dropdownItemTextActive]} numberOfLines={1}>{c.nombre || 'Sin nombre'}</Text>
                  {filtroContactoId === c._id && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Lista de gestos */}
      <FlatList
        data={tareasFiltradas}
        keyExtractor={(item, index) => `${item.contactoId}-${item.fechaHoraCreacion}-${index}`}
        renderItem={renderTarea}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="footsteps-outline" size={64} color={COLORES.textoSuave} />
            <Text style={styles.emptyText}>
              {filtroActivo === 'Hoy' 
                ? 'No hay atenciones para hoy' 
                : filtroActivo === 'Semana'
                ? 'No hay atenciones esta semana'
                : filtroActivo === 'Mes'
                ? 'No hay atenciones este mes'
                : 'No hay atenciones'}
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

      {/* Micrófono: siempre visible encima de todo vía GlobalVoiceOverlay (App.js) */}

      {/* Modal Preview nota de voz: elegir guardar como gesto o interacción */}
      <Modal
        visible={modalVoicePreviewVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVoicePreviewVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalVoicePreviewContent}>
            <View style={styles.modalVoicePreviewHeader}>
              <Text style={styles.modalVoicePreviewTitle}>{voicePreviewData ? 'Preview de la nota' : 'Nota grabada'}</Text>
              <TouchableOpacity onPress={async () => {
                if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                setModalVoicePreviewVisible(false);
                setVoicePreviewData(null);
                setVoicePreviewAudioUri(null);
                setVoicePreviewTempId(null);
                setVoicePreviewTranscription(null);
                setVoiceTranscribing(false);
              }}>
                <Ionicons name="close" size={24} color={COLORES.texto} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalVoicePreviewBody} showsVerticalScrollIndicator={false}>
              {voicePreviewAudioUri && (
                <>
                  <Text style={styles.modalVoicePreviewText}>Grabación lista. Toca Reproducir para escuchar.</Text>
                  <TouchableOpacity
                    style={styles.modalVoicePreviewPlayButton}
                    onPress={async () => {
                      const r = await playPreviewUri(voicePreviewAudioUri);
                      if (r.error) Alert.alert('Audio', r.error);
                    }}
                  >
                    <Ionicons name="play" size={24} color="white" />
                    <Text style={styles.modalVoicePreviewPlayButtonText}>Reproducir nota</Text>
                  </TouchableOpacity>
                  {voiceTranscribing && (
                    <Text style={[styles.modalVoicePreviewText, { marginTop: 12, fontStyle: 'italic' }]}>Transcribiendo...</Text>
                  )}
                  {!voiceTranscribing && voicePreviewTranscription !== null && (
                    <>
                      <Text style={styles.modalVoicePreviewLabel}>Transcripción:</Text>
                      <Text style={styles.modalVoicePreviewText}>{voicePreviewTranscription || '—'}</Text>
                    </>
                  )}
                </>
              )}
              {voicePreviewData && (
                <>
                  <Text style={[styles.modalVoicePreviewLabel, { marginTop: 8, fontWeight: '700' }]}>Así se verá tu atención</Text>
                  <View style={styles.previewGestoCard}>
                    <View style={styles.previewGestoHeader}>
                      <Text style={styles.previewGestoTipo} numberOfLines={1}>
                        {getGestoConfig(voicePreviewData.clasificacion).emoji} {getGestoConfig(voicePreviewData.clasificacion).actionLabel ?? voicePreviewData.clasificacion}
                      </Text>
                      <Text style={styles.previewGestoContacto} numberOfLines={1}>
                        {voicePreviewData.contactoNombre || voicePreviewData.vinculo || 'Sin asignar'}
                      </Text>
                    </View>
                    <Text style={styles.previewGestoDescripcion} numberOfLines={3}>
                      {voicePreviewData.descripcion || voicePreviewData.texto || voicePreviewTranscription || '—'}
                    </Text>
                    <View style={styles.previewGestoMeta}>
                      <TouchableOpacity
                        style={styles.previewGestoFechaBadge}
                        onPress={() => { setDatePickerModeVoice('date'); setShowDatePickerVoice(true); }}
                      >
                        <Text style={styles.previewGestoFechaText}>
                          {voicePreviewFechaEjecucion.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {formatTime12h(voicePreviewFechaEjecucion)}
                        </Text>
                        <Ionicons name="calendar-outline" size={16} color={COLORES.texto} />
                      </TouchableOpacity>
                      <View style={[styles.previewGestoAccionButton, { backgroundColor: getGestoConfig(voicePreviewData.clasificacion).color }]}>
                        <Ionicons name={getGestoConfig(voicePreviewData.clasificacion).icon} size={18} color="white" />
                        <Text style={styles.previewGestoAccionText}>{getGestoConfig(voicePreviewData.clasificacion).actionLabel ?? voicePreviewData.clasificacion}</Text>
                      </View>
                    </View>
                  </View>
                  {showDatePickerVoice && (
                    <DateTimePicker
                      value={voicePreviewFechaEjecucion}
                      mode={datePickerModeVoice}
                      minimumDate={new Date()}
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(e, d) => {
                        if (e.type === 'dismissed') { setShowDatePickerVoice(false); return; }
                        const date = d || voicePreviewFechaEjecucion;
                        if (datePickerModeVoice === 'date') {
                          setVoicePreviewFechaEjecucion(date);
                          if (Platform.OS === 'android') setShowDatePickerVoice(false);
                          else setDatePickerModeVoice('time');
                        } else {
                          setVoicePreviewFechaEjecucion(date);
                          setShowDatePickerVoice(false);
                        }
                      }}
                    />
                  )}
                </>
              )}
            </ScrollView>
            <View style={styles.modalVoicePreviewActions}>
              {voicePreviewData && (
              <>
                <TouchableOpacity
                  style={[
                    styles.modalVoicePreviewButton,
                    styles.modalVoicePreviewButtonTask,
                    (voicePreviewData.tipo === 'tarea') && styles.modalVoicePreviewButtonSuggested,
                  ]}
                  onPress={async () => {
                    if (!voicePreviewTempId) {
                      Alert.alert('Error', 'Error de conexión. No se pudo subir la nota. Comprueba tu internet e intenta de nuevo.');
                      return;
                    }
                    let contactoId = voicePreviewData?.contactoId;
                    if (!contactoId && voicePreviewData?.contactoNombre && Array.isArray(contactos)) {
                      const porNombre = contactos.find(c => normalizeForMatch(c.nombre) === normalizeForMatch(voicePreviewData.contactoNombre));
                      if (porNombre?._id) contactoId = porNombre._id;
                    }
                    if (!voicePreviewData || !contactoId) {
                      const nombre = voicePreviewData?.contactoNombre || voicePreviewData?.vinculo || '';
                      Alert.alert('Aviso', nombre
                        ? `No se pudo asignar el contacto. Comprueba que "${nombre}" está en tu lista de vínculos.`
                        : 'No hay contacto asignado. Menciona el nombre del contacto en la nota o añade contactos y graba de nuevo.');
                      return;
                    }
                    const contact = contactos.find(c => c._id === contactoId);
                    if (!contact) {
                      Alert.alert('Error', 'Contacto no encontrado. Actualiza la lista (arrastra para actualizar).');
                      return;
                    }
                    try {
                      const textoTranscripcion = (voicePreviewData.texto || voicePreviewTranscription || '').trim();
                      if (!textoTranscripcion) {
                        Alert.alert('Aviso', 'No hay texto para guardar. Asegúrate de que la transcripción se completó.');
                        return;
                      }
                      const clasificacion = TIPOS_DE_GESTO_DISPLAY.includes(voicePreviewData.clasificacion) ? voicePreviewData.clasificacion : 'Otro';
                      let fechaEjecucion = voicePreviewFechaEjecucion && !isNaN(voicePreviewFechaEjecucion.getTime()) ? voicePreviewFechaEjecucion : new Date();
                      if (fechaEjecucion.getTime() < Date.now()) fechaEjecucion = new Date();
                      await saveTaskFromVoice(contactoId, voicePreviewTempId, fechaEjecucion, clasificacion, textoTranscripcion);
                      if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                      cargarTareas();
                      setModalVoicePreviewVisible(false);
                      setVoicePreviewData(null);
                      setVoicePreviewAudioUri(null);
                      setVoicePreviewTempId(null);
                      setVoicePreviewTranscription(null);
                      setVoiceTranscribing(false);
                      Alert.alert('Atención guardada', 'Tu atención se guardó correctamente. Ya está en la lista.');
                    } catch (e) {
                      const isNetwork = !e.message || /red|conexión|network|timeout|fetch/i.test(String(e.message));
                      Alert.alert('Error', isNetwork ? 'Error de conexión. Comprueba internet e intenta de nuevo.' : (e.message || 'No se pudo guardar.'));
                    }
                  }}
              >
                <Ionicons name="heart" size={22} color="white" />
                <Text style={styles.modalVoicePreviewButtonText}>Guardar como atención</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalVoicePreviewButton, styles.modalVoicePreviewButtonInteraction]}
                  onPress={async () => {
                    if (!voicePreviewTempId) {
                      Alert.alert('Error', 'Error de conexión. No se pudo subir la nota. Comprueba tu internet e intenta de nuevo.');
                      return;
                    }
                    let contactoId = voicePreviewData?.contactoId;
                    if (!contactoId && voicePreviewData?.contactoNombre && Array.isArray(contactos)) {
                      const porNombre = contactos.find(c => normalizeForMatch(c.nombre) === normalizeForMatch(voicePreviewData.contactoNombre));
                      if (porNombre?._id) contactoId = porNombre._id;
                    }
                    if (!voicePreviewData || !contactoId) {
                      const nombre = voicePreviewData?.contactoNombre || voicePreviewData?.vinculo || '';
                      Alert.alert('Aviso', nombre
                        ? `No se pudo asignar el contacto. Comprueba que "${nombre}" está en tu lista de vínculos.`
                        : 'No hay contacto asignado. Menciona el nombre del contacto en la nota o añade contactos y graba de nuevo.');
                      return;
                    }
                    const contact = contactos.find(c => c._id === contactoId);
                    if (!contact) {
                      Alert.alert('Error', 'Contacto no encontrado. Actualiza la lista (arrastra para actualizar).');
                      return;
                    }
                    try {
                      const textoTranscripcion = (voicePreviewData.texto || voicePreviewTranscription || '').trim();
                      if (!textoTranscripcion) {
                        Alert.alert('Aviso', 'No hay texto para guardar. Asegúrate de que la transcripción se completó.');
                        return;
                      }
                      const { contacto } = await saveInteractionFromVoice(contactoId, voicePreviewTempId, textoTranscripcion);
                      if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                      cargarTareas();
                      setModalVoicePreviewVisible(false);
                      setVoicePreviewData(null);
                      setVoicePreviewAudioUri(null);
                      setVoicePreviewTempId(null);
                      setVoicePreviewTranscription(null);
                      setVoiceTranscribing(false);
                      Alert.alert(
                        'Momento guardado',
                        'Se guardó como texto. Toca "Ver momentos" para ir directo a verlo.',
                        [
                          { text: 'Ver momentos', onPress: () => navigation.navigate('Vínculos', { openContactId: contactoId, openContact: contacto }) },
                          { text: 'Cerrar', style: 'cancel' }
                        ]
                      );
                    } catch (e) {
                      const isNetwork = !e.message || /red|conexión|network|timeout|fetch/i.test(String(e.message));
                      Alert.alert('Error', isNetwork ? 'Error de conexión. Comprueba internet e intenta de nuevo.' : (e.message || 'No se pudo guardar.'));
                    }
                  }}
                >
                  <Ionicons name="sparkles" size={22} color="white" />
                  <Text style={styles.modalVoicePreviewButtonText}>Guardar como momento</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalVoicePreviewButton, styles.modalVoicePreviewButtonRefugio]}
                  onPress={async () => {
                    if (!voicePreviewTempId) {
                      Alert.alert('Error', 'Error de conexión. No se pudo subir la nota. Comprueba tu internet e intenta de nuevo.');
                      return;
                    }
                    try {
                      await saveDesahogoFromVoice(voicePreviewTempId);
                      if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                      setModalVoicePreviewVisible(false);
                      setVoicePreviewData(null);
                      setVoicePreviewAudioUri(null);
                      setVoicePreviewTempId(null);
                      setVoicePreviewTranscription(null);
                      setVoiceTranscribing(false);
                      navigation.navigate('Mi Refugio', { refreshDesahogos: true });
                      Alert.alert(
                        'Guardado en Mi Refugio',
                        'Tu desahogo se guardó. Solo tú puedes verlo.',
                        [
                          { text: 'Ver Mi Refugio', onPress: () => navigation.navigate('Mi Refugio', { refreshDesahogos: true }) },
                          { text: 'Cerrar', style: 'cancel' },
                        ]
                      );
                    } catch (e) {
                      const isNetwork = !e.message || /red|conexión|network|timeout|fetch/i.test(String(e.message));
                      Alert.alert('Error', isNetwork ? 'Error de conexión. Comprueba internet e intenta de nuevo.' : (e.message || 'No se pudo guardar en Mi Refugio.'));
                    }
                  }}
                >
                  <Ionicons name="document-text-outline" size={22} color="white" />
                  <Text style={styles.modalVoicePreviewButtonText}>Guardar como Desahogo</Text>
                </TouchableOpacity>
              </>
              )}
              <TouchableOpacity
                style={styles.modalVoicePreviewCancel}
                onPress={async () => {
                if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                setModalVoicePreviewVisible(false);
                setVoicePreviewData(null);
                setVoicePreviewAudioUri(null);
                setVoicePreviewTempId(null);
                setVoicePreviewTranscription(null);
                setVoiceTranscribing(false);
              }}
              >
                <Text style={styles.modalVoicePreviewCancelText}>{voicePreviewData ? 'Cancelar' : 'Cerrar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Botones + y reloj historial están en el overlay global (GlobalVoiceOverlay) */}

      {/* Modal Historial */}
      <Modal
        visible={modalHistorialVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalHistorialVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalHistorialContent}>
            <View style={styles.modalHistorialHeader}>
              <Text style={styles.modalHistorialTitle}>Historial de atenciones</Text>
              <TouchableOpacity onPress={() => setModalHistorialVisible(false)}>
                <Ionicons name="close" size={24} color={COLORES.texto} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={tareasHistorial}
              keyExtractor={(item, i) => `${item.contactoId}-${item.fechaHoraCreacion}-${i}`}
              renderItem={({ item }) => (
                <View style={styles.historialItem}>
                  <View style={styles.historialItemContent}>
                    <Text style={styles.historialItemTitulo}>{item.clasificacion || 'Atención'}</Text>
                    <Text style={styles.historialItemDesc} numberOfLines={1}>{item.audioBase64 ? '[Nota de voz]' : item.descripcion}</Text>
                    <Text style={styles.historialItemMeta}>
                      {item.contactoNombre} · {item.fechaCompletado.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })} {formatTime12h(item.fechaCompletado)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.historialItemRestablecer}
                    onPress={() => restablecerTareaDelHistorial(item.contactoId, item.tareaIndex)}
                  >
                    <Ionicons name="arrow-undo-outline" size={20} color={COLORES.agua} />
                    <Text style={styles.historialItemRestablecerText}>Restablecer</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.historialEmpty}>Sin historial</Text>}
              contentContainerStyle={styles.historialList}
            />
          </View>
        </View>
      </Modal>

      {/* Modal Editar Atención */}
      <Modal
        visible={modalEditarVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalEditarVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalEditarContent}>
            <View style={styles.modalEditarHeader}>
              <Text style={styles.modalEditarTitle}>Editar atención</Text>
              <TouchableOpacity onPress={() => setModalEditarVisible(false)}>
                <Ionicons name="close" size={24} color={COLORES.texto} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalEditarBody}>
              <Text style={styles.modalLabel}>Tipo</Text>
              <View style={styles.clasificacionRow}>
                {TIPOS_DE_GESTO_DISPLAY.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.clasificacionChip, editClasificacion === c && styles.clasificacionChipActive]}
                    onPress={() => setEditClasificacion(c)}
                  >
                    <Text style={[styles.clasificacionChipText, editClasificacion === c && styles.clasificacionChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalLabel}>Descripción</Text>
              <TextInput
                style={styles.modalInput}
                value={editDescripcion}
                onChangeText={setEditDescripcion}
                placeholder="Notas de la atención"
                placeholderTextColor={COLORES.textoSuave}
                multiline
              />
              <Text style={styles.modalLabel}>Fecha y hora</Text>
              <TouchableOpacity style={styles.modalDateButton} onPress={() => { setDatePickerMode('date'); setShowDatePicker(true); }}>
                <Text style={styles.modalDateText}>{editFechaEjecucion.toLocaleDateString('es-ES')} {formatTime12h(editFechaEjecucion)}</Text>
                <Ionicons name="calendar-outline" size={20} color={COLORES.textoSecundario} />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={editFechaEjecucion}
                  mode={datePickerMode}
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(e, d) => {
                    if (e.type === 'dismissed') { setShowDatePicker(false); return; }
                    const date = d || editFechaEjecucion;
                    if (datePickerMode === 'date') {
                      setEditFechaEjecucion(date);
                      if (Platform.OS === 'android') setShowDatePicker(false);
                      else setDatePickerMode('time');
                    } else {
                      setEditFechaEjecucion(date);
                      setShowDatePicker(false);
                    }
                  }}
                />
              )}
            </ScrollView>
            <View style={styles.modalEditarFooter}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setModalEditarVisible(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={guardarEditarTarea}>
                <Text style={styles.modalSaveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Crear Atención: paso 1 elegir contacto, paso 2 formulario */}
      <Modal
        visible={modalCrearTareaVisible}
        animationType="slide"
        transparent
        onRequestClose={cerrarModalCrearTarea}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCrearTareaContent}>
            <View style={styles.modalCrearTareaHeader}>
              {pasoCrearTarea === 'formulario' ? (
                <TouchableOpacity onPress={volverASelectorContacto} style={styles.modalCrearTareaBack}>
                  <Ionicons name="arrow-back" size={24} color={COLORES.agua} />
                  <Text style={styles.modalCrearTareaBackText}>Contactos</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.modalCrearTareaTitle}>¿Quieres agregar una Atención?</Text>
              )}
              <TouchableOpacity onPress={cerrarModalCrearTarea}>
                <Ionicons name="close" size={24} color={COLORES.texto} />
              </TouchableOpacity>
            </View>

            {pasoCrearTarea === 'contacto' && (
              <View style={styles.modalCrearTareaBody}>
                <Text style={styles.modalCrearTareaSubtitle}>Elige a esa persona especial.</Text>
                {contactos.length === 0 ? (
                  <View style={styles.modalCrearTareaEmpty}>
                    <Ionicons name="people-outline" size={48} color={COLORES.textoSuave} />
                    <Text style={styles.modalCrearTareaEmptyText}>No hay contactos</Text>
                    <Text style={styles.modalCrearTareaEmptyHint}>Añade contactos desde la pestaña Vínculos.</Text>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.modalCrearTareaList}
                    contentContainerStyle={styles.modalCrearTareaBurbujasContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {contactos.map((item) => (
                      <TouchableOpacity
                        key={item._id}
                        style={styles.modalCrearTareaBurbujaWrap}
                        onPress={() => seleccionarContactoParaTarea(item)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.modalCrearTareaBurbuja}>
                          {item.foto && item.foto.length > 20 ? (
                            <Image source={{ uri: item.foto }} style={styles.modalCrearTareaBurbujaImagen} />
                          ) : (
                            <View style={styles.modalCrearTareaBurbujaInicial}>
                              <Text style={styles.modalCrearTareaBurbujaInicialText} numberOfLines={1}>
                                {(item.nombre || '?').trim().charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.modalCrearTareaBurbujaNombre} numberOfLines={1}>{item.nombre || 'Sin nombre'}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {pasoCrearTarea === 'formulario' && contactoSeleccionadoParaTarea && (
              <>
                <View style={styles.modalCrearTareaParaQuien}>
                  {contactoSeleccionadoParaTarea.foto && contactoSeleccionadoParaTarea.foto.length > 20 ? (
                    <Image source={{ uri: contactoSeleccionadoParaTarea.foto }} style={styles.modalCrearTareaAvatar} />
                  ) : (
                    <View style={styles.modalCrearTareaAvatarPlaceholder}>
                      <Ionicons name="person" size={24} color={COLORES.textoSecundario} />
                    </View>
                  )}
                  <Text style={styles.modalCrearTareaParaQuienNombre}>{contactoSeleccionadoParaTarea.nombre}</Text>
                </View>
                <ScrollView style={styles.modalCrearTareaForm} showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalLabel}>Tipo</Text>
                  <View style={styles.clasificacionRow}>
                    {TIPOS_DE_GESTO_DISPLAY.map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.clasificacionChip, newTaskClasificacion === c && styles.clasificacionChipActive]}
                        onPress={() => setNewTaskClasificacion(c)}
                      >
                        <Text style={[styles.clasificacionChipText, newTaskClasificacion === c && styles.clasificacionChipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.modalLabel}>Descripción</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={newTaskDescripcion}
                    onChangeText={setNewTaskDescripcion}
                    placeholder="Qué quieres hacer (ej. Llamar para felicitar)"
                    placeholderTextColor={COLORES.textoSuave}
                    multiline
                  />
                  <View style={[styles.modalRecurrenteRow, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                    <Text style={styles.modalLabel}>Repetir cada año</Text>
                    <TouchableOpacity
                      style={[styles.modalRecurrenteChip, newTaskRecurrenteAnual && styles.modalRecurrenteChipActive]}
                      onPress={() => setNewTaskRecurrenteAnual(!newTaskRecurrenteAnual)}
                    >
                      <Text style={[styles.modalRecurrenteChipText, newTaskRecurrenteAnual && styles.modalRecurrenteChipTextActive]}>
                        {newTaskRecurrenteAnual ? 'Sí' : 'No'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
                <View style={styles.modalEditarFooter}>
                  <TouchableOpacity style={styles.modalCancelButton} onPress={volverASelectorContacto}>
                    <Text style={styles.modalCancelText}>Cambiar contacto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveButton} onPress={guardarNuevaTarea}>
                    <Text style={styles.modalSaveText}>Guardar atención</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORES.texto,
  },
  headerSubtitle: {
    fontSize: 16,
    color: COLORES.textoSecundario,
    marginTop: 4,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: COLORES.fondoSecundario,
    borderRadius: 12,
  },
  sourceBadgeText: {
    fontSize: 12,
    color: COLORES.textoSecundario,
    fontWeight: '500',
  },
  filtrosSection: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  filtrosSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    marginBottom: 6,
  },
  desplegablesRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  desplegableWrap: {
    flex: 1,
  },
  desplegableLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  desplegableLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORES.textoSecundario,
  },
  desplegableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: COLORES.fondoSecundario,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  desplegableButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORES.texto,
    flex: 1,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dropdownContent: {
    backgroundColor: COLORES.fondo,
    borderRadius: 16,
    paddingVertical: 8,
    maxHeight: 320,
  },
  dropdownList: {
    maxHeight: 260,
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dropdownItemActive: {
    backgroundColor: COLORES.fondoSecundario,
  },
  dropdownItemText: {
    fontSize: 16,
    color: COLORES.texto,
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: COLORES.agua,
    fontWeight: '600',
  },
  filtrosScroll: {
    flexGrow: 0,
  },
  filtrosScrollContent: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
  },
  filtrosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  filtrosContainer: {
    flexDirection: 'row',
    flex: 1,
    gap: 12,
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C62828',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'white',
  },
  recordingText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  recordingTime: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  recordingHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  modalVoicePreviewContent: {
    backgroundColor: COLORES.fondo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalVoicePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  modalVoicePreviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORES.texto,
  },
  modalVoicePreviewBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 220,
  },
  modalVoicePreviewPlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORES.agua,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  modalVoicePreviewPlayButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalVoicePreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    marginTop: 12,
    marginBottom: 4,
  },
  resumenGestoCard: {
    backgroundColor: COLORES.fondoSecundario || '#f0f2f5',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  previewGestoCard: {
    backgroundColor: COLORES.fondoSecundario || '#f0f2f5',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde || '#E0E0E0',
  },
  previewGestoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewGestoTipo: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORES.texto,
    flex: 1,
  },
  previewGestoContacto: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    marginLeft: 8,
    maxWidth: '45%',
  },
  previewGestoDescripcion: {
    fontSize: 14,
    color: COLORES.texto,
    lineHeight: 20,
    marginBottom: 10,
  },
  previewGestoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  previewGestoFechaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORES.aguaClaro || '#E1F5FE',
    borderRadius: 8,
  },
  previewGestoFechaText: {
    fontSize: 13,
    color: COLORES.texto,
    fontWeight: '600',
  },
  previewGestoAccionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  previewGestoAccionText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
  },
  modalVoicePreviewText: {
    fontSize: 15,
    color: COLORES.texto,
    lineHeight: 22,
  },
  modalVoicePreviewActions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 28,
    gap: 12,
  },
  modalVoicePreviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  modalVoicePreviewButtonTask: {
    backgroundColor: COLORES.agua,
  },
  modalVoicePreviewButtonInteraction: {
    backgroundColor: COLORES.textoSecundario,
  },
  modalVoicePreviewButtonRefugio: {
    backgroundColor: '#6B7FD7',
  },
  modalVoicePreviewButtonSuggested: {
    borderWidth: 2,
    borderColor: 'white',
  },
  modalVoicePreviewSuggestion: {
    fontWeight: '600',
    marginBottom: 8,
    color: COLORES.agua,
  },
  modalVoicePreviewButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalVoicePreviewCancel: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalVoicePreviewCancelText: {
    fontSize: 15,
    color: COLORES.textoSecundario,
  },
  floatingButtonPremium: {
    position: 'absolute',
    bottom: 168,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  floatingButtonPremiumInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORES.agua,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  floatingButtonPremiumActive: {
    opacity: 0.95,
  },
  floatingButtonNuevaTarea: {
    position: 'absolute',
    bottom: 96,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  floatingButtonNuevaTareaInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORES.agua,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORES.agua,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingButtonHistorial: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  floatingButtonHistorialInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORES.agua,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORES.agua,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  swipeListoContainer: {
    backgroundColor: COLORES.activo,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
    borderRadius: 16,
    marginBottom: 12,
    marginRight: 12,
  },
  swipeListoText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  editTareaButtonLeft: {
    padding: 8,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editTareaButton: {
    padding: 4,
  },
  recurrenteBadge: {
    backgroundColor: COLORES.fondoSecundario,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  recurrenteBadgeText: {
    fontSize: 11,
    color: COLORES.textoSecundario,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalHistorialContent: {
    backgroundColor: COLORES.fondo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHistorialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  modalHistorialTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORES.texto,
  },
  historialList: {
    padding: 16,
    paddingBottom: 32,
  },
  historialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 8,
  },
  historialItemContent: {
    flex: 1,
    marginRight: 12,
  },
  historialItemTitulo: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORES.texto,
  },
  historialItemDesc: {
    fontSize: 13,
    color: COLORES.textoSecundario,
    marginTop: 2,
  },
  historialItemMeta: {
    fontSize: 12,
    color: COLORES.textoSuave,
    marginTop: 4,
  },
  historialItemRestablecer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORES.fondoSecundario,
  },
  historialItemRestablecerText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORES.agua,
  },
  historialEmpty: {
    textAlign: 'center',
    color: COLORES.textoSecundario,
    paddingVertical: 24,
  },
  modalEditarContent: {
    backgroundColor: COLORES.fondo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalEditarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  modalEditarTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORES.texto,
  },
  modalEditarBody: {
    padding: 16,
    maxHeight: 400,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.texto,
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: COLORES.texto,
    borderWidth: 1,
    borderColor: COLORES.fondoSecundario,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  clasificacionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  clasificacionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORES.fondoSecundario,
  },
  clasificacionChipActive: {
    backgroundColor: COLORES.agua,
  },
  clasificacionChipText: {
    fontSize: 13,
    color: COLORES.textoSecundario,
    fontWeight: '500',
  },
  clasificacionChipTextActive: {
    color: 'white',
  },
  modalDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORES.fondoSecundario,
  },
  modalDateText: {
    fontSize: 15,
    color: COLORES.texto,
  },
  modalRecurrenteRow: {
    marginTop: 16,
  },
  modalRecurrenteTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalRecurrenteLabel: {
    fontSize: 14,
    color: COLORES.texto,
    fontWeight: '500',
  },
  modalRecurrenteChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: COLORES.fondoSecundario,
  },
  modalRecurrenteChipActive: {
    backgroundColor: COLORES.agua,
  },
  modalRecurrenteChipText: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    fontWeight: '600',
  },
  modalRecurrenteChipTextActive: {
    color: 'white',
  },
  modalEditarFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORES.fondoSecundario,
  },
  modalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalCancelText: {
    fontSize: 16,
    color: COLORES.textoSecundario,
  },
  modalSaveButton: {
    backgroundColor: COLORES.agua,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  modalCrearTareaContent: {
    backgroundColor: COLORES.fondo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    maxHeight: '90%',
    minHeight: 320,
    height: '90%',
  },
  modalCrearTareaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  modalCrearTareaTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORES.texto,
  },
  modalCrearTareaBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalCrearTareaBackText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.agua,
  },
  modalCrearTareaBody: {
    flex: 1,
  },
  modalCrearTareaSubtitle: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  modalCrearTareaList: {
    flex: 1,
  },
  modalCrearTareaListContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  modalCrearTareaBurbujasContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    justifyContent: 'flex-start',
    gap: 16,
  },
  modalCrearTareaBurbujaWrap: {
    width: Math.floor((Dimensions.get('window').width - 20 * 2 - 16 * 3) / 3),
    alignItems: 'center',
    marginBottom: 4,
  },
  modalCrearTareaBurbuja: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: COLORES.fondoSecundario,
    borderWidth: 2,
    borderColor: COLORES.agua,
  },
  modalCrearTareaBurbujaImagen: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  modalCrearTareaBurbujaInicial: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORES.aguaClaro || '#E1F5FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCrearTareaBurbujaInicialText: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORES.agua,
  },
  modalCrearTareaBurbujaNombre: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORES.texto,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: '100%',
  },
  modalCrearTareaContactoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
    gap: 12,
  },
  modalCrearTareaAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  modalCrearTareaAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORES.fondoSecundario,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCrearTareaContactoInfo: {
    flex: 1,
  },
  modalCrearTareaContactoNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
  },
  modalCrearTareaContactoTelefono: {
    fontSize: 13,
    color: COLORES.textoSecundario,
    marginTop: 2,
  },
  modalCrearTareaEmpty: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  modalCrearTareaEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
  },
  modalCrearTareaEmptyHint: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    textAlign: 'center',
  },
  modalCrearTareaParaQuien: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORES.fondoSecundario,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 12,
  },
  modalCrearTareaParaQuienNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
  },
  modalCrearTareaForm: {
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: 360,
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
  tareaContactoDerecha: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    maxWidth: '45%',
    textAlign: 'right',
  },
  accionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  accionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
  accionButtonInactivo: {
    backgroundColor: COLORES.fondoSecundario,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  accionButtonEmoji: {
    fontSize: 18,
  },
  accionButtonTextInactivo: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORES.textoSecundario,
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
