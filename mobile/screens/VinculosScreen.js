import React, { useEffect, useState, useRef, useMemo } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  Dimensions, 
  ActivityIndicator, 
  TouchableOpacity, 
  FlatList, 
  Image,
  Alert,
  Linking,
  Animated,
  Easing,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  PanResponder
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORES } from '../constants/colores';
import { API_URL, fetchWithAuth } from '../constants/api';
import { API_SOURCE_LABEL, API_SOURCE_ICON } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  loadContacts, 
  createContact, 
  updateContact, 
  deleteContact,
  getConnectionStatus,
  getPendingSyncCount,
  syncPendingChanges,
  saveContactsToCache,
  updateContactInteracciones,
  updateContactTareas
} from '../services/syncService';
import NetInfo from '@react-native-community/netinfo';
import { validatePhone, validateBirthday, validateName, sanitizeText } from '../utils/validations';
import { startRecording, stopRecording, playPreviewUri, uploadVoiceTemp, deleteVoiceTemp, transcribeVoiceTemp } from '../services/voiceToTaskService';
import NotificationBell from '../components/NotificationBell';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const BUBBLE_SIZE = Math.max(100, (SCREEN_WIDTH - 60) / 3);
const BUBBLE_SIZE_INNER = BUBBLE_SIZE - 12; // Tamaño interno de la burbuja
const BUBBLE_RADIUS = BUBBLE_SIZE_INNER / 2; // Radio de la burbuja
const BUBBLE_SIZE_IMAGE = BUBBLE_SIZE - 24; // Tamaño para imagen/inicial
const BUBBLE_RADIUS_IMAGE = BUBBLE_SIZE_IMAGE / 2; // Radio para imagen/inicial
const BUBBLE_FONT_SIZE = BUBBLE_SIZE * 0.28; // Tamaño de fuente
const BADGE_OFFSET = 8; // Iconos como cuadro: muerden el borde de la burbuja (arriba-izq, arriba-der, abajo-der)
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.30;

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
  'Cumpleaños': 'cumpleanos' // Caso especial que requiere fecha de nacimiento
};

const PRIORIDADES = ['💖 Alta', '✨ Media', '💤 Baja'];
const CLASIFICACIONES = ['Familia', 'Mejor Amigo', 'Amigo', 'Trabajo', 'Conocido'];
const CLASIFICACIONES_TAREAS = ['Llamar', 'Visitar', 'Enviar mensaje', 'Regalo', 'Evento', 'Otro'];

export default function VinculosScreen() {
  // Estados principales
  const [vinculos, setVinculos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const animaciones = useRef({});
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const burbujaRefs = useRef({});
  const regarAnimaciones = useRef({});
  
  // Estados para modo swipe/descubrir
  const [misContactos, setMisContactos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pilaAcciones, setPilaAcciones] = useState([]);
  const [modoJuego, setModoJuego] = useState(false);
  const activeIndex = useRef(0);
  const contactsRef = useRef([]);
  const position = useRef(new Animated.ValueXY()).current;
  const isSwiping = useRef(false);
  
  // Estados para modales
  const [modalVisible, setModalVisible] = useState(false);
  const [modalSelectorVisible, setModalSelectorVisible] = useState(false);
  const [modalFotoFullscreen, setModalFotoFullscreen] = useState(false);
  const [datosEditados, setDatosEditados] = useState({});
  const [agendaTelefonica, setAgendaTelefonica] = useState([]);
  const [filtroAgenda, setFiltroAgenda] = useState('');
  const [guardando, setGuardando] = useState(false);
  
  // Estados para formulario
  const [diaCumple, setDiaCumple] = useState('');
  const [mesCumple, setMesCumple] = useState('');
  const [anioCumple, setAnioCumple] = useState('');
  const [edadCalculada, setEdadCalculada] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState('date');
  
  // Voz → tarea/interacción (IA): grabación, preview y guardar
  const [voiceRecording, setVoiceRecording] = useState(null);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [voicePreviewData, setVoicePreviewData] = useState(null);
  const [voicePreviewAudioUri, setVoicePreviewAudioUri] = useState(null);
  const [voicePreviewTempId, setVoicePreviewTempId] = useState(null);
  const [modalVoicePreviewVisible, setModalVoicePreviewVisible] = useState(false);
  const [voicePreviewTranscription, setVoicePreviewTranscription] = useState(null);
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  const recordingPulseAnim = useRef(new Animated.Value(1)).current;

  // Transcribir nota temporal con Whisper cuando se abre el modal con tempId
  useEffect(() => {
    if (!modalVoicePreviewVisible || !voicePreviewTempId) return;
    console.log('[VinculosScreen] Iniciando transcripción para tempId:', voicePreviewTempId);
    setVoiceTranscribing(true);
    setVoicePreviewTranscription(null);
    transcribeVoiceTemp(voicePreviewTempId).then((result) => {
      setVoiceTranscribing(false);
      console.log('[VinculosScreen] transcribeVoiceTemp resultado:', result.success ? { textoLength: (result.texto || '').length } : { error: result.error });
      if (result.success) setVoicePreviewTranscription(result.texto || '');
      else setVoicePreviewTranscription(result.error || 'Error al transcribir');
    }).catch((err) => {
      console.log('[VinculosScreen] transcribeVoiceTemp excepción:', err?.message);
      setVoiceTranscribing(false);
      setVoicePreviewTranscription('Error al transcribir');
    });
  }, [modalVoicePreviewVisible, voicePreviewTempId]);

  // Timer de grabación (actualizar cada segundo)
  useEffect(() => {
    if (!voiceRecording) {
      setRecordingElapsed(0);
      return;
    }
    setRecordingElapsed(0);
    const interval = setInterval(() => setRecordingElapsed(prev => prev + 1), 1000);
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

  // Estados para modal de interacciones (historial, se pueden editar)
  const [modalInteraccionesVisible, setModalInteraccionesVisible] = useState(false);
  const [textoInteraccion, setTextoInteraccion] = useState('');
  const [fechaHoraInteraccion, setFechaHoraInteraccion] = useState(new Date());
  const [showDatePickerInteraccion, setShowDatePickerInteraccion] = useState(false);
  const [dateModeInteraccion, setDateModeInteraccion] = useState('date');
  // Editar interacción existente
  const [interaccionEditando, setInteraccionEditando] = useState(null); // { interaccion }
  const [modalEditarInteraccionVisible, setModalEditarInteraccionVisible] = useState(false);
  const [editInteraccionDescripcion, setEditInteraccionDescripcion] = useState('');
  const [editInteraccionFecha, setEditInteraccionFecha] = useState(new Date());
  const [showDatePickerEditInteraccion, setShowDatePickerEditInteraccion] = useState(false);
  const [dateModeEditInteraccion, setDateModeEditInteraccion] = useState('date');
  
  // Estados para modal de tareas (separado, se pueden borrar y completar)
  const [modalTareasVisible, setModalTareasVisible] = useState(false);
  const [textoTarea, setTextoTarea] = useState('');
  const [fechaHoraEjecucion, setFechaHoraEjecucion] = useState(new Date());
  const [clasificacionTarea, setClasificacionTarea] = useState('Llamar');
  const [tareaRecurrenteAnual, setTareaRecurrenteAnual] = useState(false);
  const [showDatePickerEjecucion, setShowDatePickerEjecucion] = useState(false);
  const [dateModeEjecucion, setDateModeEjecucion] = useState('date');
  const [tareaDesdeTarea, setTareaDesdeTarea] = useState(null); // Para crear tarea desde otra tarea
  
  // Estados para botón Regar: agregar interacción desde pantalla (elegir contacto → formulario)
  const [modalRegarVisible, setModalRegarVisible] = useState(false);
  const [pasoRegar, setPasoRegar] = useState('contacto'); // 'contacto' | 'formulario'
  const [contactoSeleccionadoParaRegar, setContactoSeleccionadoParaRegar] = useState(null);
  const [textoInteraccionRegar, setTextoInteraccionRegar] = useState('');
  const [fechaHoraInteraccionRegar, setFechaHoraInteraccionRegar] = useState(new Date());
  const [showDatePickerRegar, setShowDatePickerRegar] = useState(false);
  const [dateModeRegar, setDateModeRegar] = useState('date');
  
  // Estado para menú de acciones de burbuja
  const [menuVisible, setMenuVisible] = useState(false);
  const [contactoSeleccionado, setContactoSeleccionado] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuLado, setMenuLado] = useState('right'); // 'left' o 'right'
  const menuAnimation = useRef(new Animated.Value(0)).current;

  // Estados para notificaciones
  const [modalNotificacionesVisible, setModalNotificacionesVisible] = useState(false);
  const [notificaciones, setNotificaciones] = useState([]);
  const [notificacionesVistas, setNotificacionesVistas] = useState(new Set());

  useEffect(() => {
    cargarVinculos();
    
    // Monitorear estado de conexión y sincronizar periódicamente
    const checkConnection = async () => {
      const online = await getConnectionStatus();
      setIsOnline(online);
      
      if (online) {
        // Intentar sincronizar pendientes cuando hay conexión
        const syncResult = await syncPendingChanges();
        if (syncResult && syncResult.successful > 0) {
          await cargarVinculos(); // Recargar después de sincronizar
        }
      }
      
      // Actualizar contador de pendientes
      const pendingCount = await getPendingSyncCount();
      setPendingSyncCount(pendingCount);
    };
    
    // Verificar conexión inmediatamente
    checkConnection();
    
    // Listener de cambios de conexión en tiempo real
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable !== false;
      console.log('📡 NetInfo state:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        online
      });
      setIsOnline(online);
      console.log('📡 Estado de conexión actualizado - isOnline:', online);
      
      if (online) {
        // Reconectado, sincronizar pendientes
        syncPendingChanges().then(() => {
          cargarVinculos();
        });
      }
    });
    
    // Log inicial del estado
    console.log('📡 Estado inicial isOnline:', isOnline);
    
    const interval = setInterval(() => {
      cargarVinculos();
      checkConnection();
    }, 60000);
    
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
    
    return () => {
      clearInterval(interval);
      clearInterval(connectionInterval);
    };
  }, []);

  // Animación de pulso para el botón flotante de swipe
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1.15,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => { 
    activeIndex.current = currentIndex; 
  }, [currentIndex]);
  
  useEffect(() => { 
    contactsRef.current = misContactos; 
  }, [misContactos]);

  useEffect(() => {
    if (anioCumple && mesCumple && diaCumple && anioCumple.length === 4) {
      const hoy = new Date();
      const nacimiento = new Date(anioCumple, mesCumple - 1, diaCumple);
      let edad = hoy.getFullYear() - nacimiento.getFullYear();
      if (hoy < new Date(hoy.getFullYear(), mesCumple - 1, diaCumple)) edad--;
      setEdadCalculada(edad);
    } else { 
      setEdadCalculada(null); 
    }
  }, [diaCumple, mesCumple, anioCumple]);

  const cargarVinculos = async () => {
    try {
      setCargando(true);
      
      // Verificar estado de conexión
      const online = await getConnectionStatus();
      setIsOnline(online);
      
      // Cargar contactos (con fallback a cache)
      const result = await loadContacts();
      
      if (result.fromCache && online) {
        // Si cargó del cache pero hay conexión, intentar sincronizar
        syncPendingChanges();
      }
      
      // Actualizar contador de pendientes
      const pendingCount = await getPendingSyncCount();
      setPendingSyncCount(pendingCount);
      
      console.log('Vínculos cargados:', result.contactos.length, result.fromCache ? '(desde cache)' : '(desde servidor)');
      const contactosCargados = result.contactos || [];
      setVinculos(contactosCargados);
      setCargando(false);
      
      // Inicializar animaciones para cada burbuja
      contactosCargados.forEach((item, index) => {
        const key = item._id || item.telefono || index.toString();
        if (!animaciones.current[key]) {
          animaciones.current[key] = {
            float: new Animated.Value(0),
            pulse: new Animated.Value(1),
          };
          setTimeout(() => iniciarAnimacion(key), 100 + index * 50);
        }
        
        // Inicializar animación de regar si es necesario
        const degradacionTemp = calcularDegradacion(item);
        if (degradacionTemp.nivel > 0.4) {
          if (!regarAnimaciones.current[key]) {
            regarAnimaciones.current[key] = {
              translateY: new Animated.Value(0),
            };
            setTimeout(() => iniciarAnimacionRegar(key), 200 + index * 50);
          }
        } else {
          // Limpiar animación si ya no necesita regar
          if (regarAnimaciones.current[key]) {
            delete regarAnimaciones.current[key];
          }
        }
      });
    } catch (error) {
      console.error('Error cargando vínculos:', error);
      setCargando(false);
      setVinculos([]);
    }
  };

  const iniciarAnimacion = (key) => {
    if (!animaciones.current[key]) return;
    
    const { float, pulse } = animaciones.current[key];
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 3000 + Math.random() * 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 3000 + Math.random() * 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.02,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const iniciarAnimacionRegar = (key) => {
    if (!regarAnimaciones.current[key]) return;
    
    const { translateY } = regarAnimaciones.current[key];
    
    // Animación de subir y bajar (indicando que falta regar)
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -6,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const calcularDegradacion = (contacto) => {
    const frecuencia = contacto.frecuencia || 'Mensual';
    let diasEsperados = 30;
    
    // Manejo especial para Cumpleaños
    if (frecuencia === 'Cumpleaños') {
      if (!contacto.fechaNacimiento) {
        // Sin fecha de nacimiento, tratar como muy urgente
        return { 
          nivel: 1, 
          diasSinAtencion: 365, 
          opacidad: 0.5, 
          escala: 0.7,
          saturacion: 0.3
        };
      }
      
      // Calcular días hasta el próximo cumpleaños
      const partes = contacto.fechaNacimiento.split('/');
      if (partes.length < 2) {
        return { 
          nivel: 1, 
          diasSinAtencion: 365, 
          opacidad: 0.5, 
          escala: 0.7,
          saturacion: 0.3
        };
      }
      
      const hoy = new Date();
      const mesCumple = parseInt(partes[1]) - 1; // Mes (0-11)
      const diaCumple = parseInt(partes[0]);
      const anioActual = hoy.getFullYear();
      
      let proximoCumple = new Date(anioActual, mesCumple, diaCumple);
      if (proximoCumple < hoy) {
        proximoCumple = new Date(anioActual + 1, mesCumple, diaCumple);
      }
      
      const diasHastaCumple = Math.floor((proximoCumple - hoy) / (1000 * 60 * 60 * 24));
      diasEsperados = 30; // Considerar que debemos estar atentos 30 días antes
      
      // Si faltan menos de 30 días, es urgente
      if (diasHastaCumple <= 30) {
        const ratio = (30 - diasHastaCumple) / 30;
        return {
          nivel: ratio,
          diasSinAtencion: diasHastaCumple,
          opacidad: Math.max(0.6, 1 - ratio * 0.3),
          escala: Math.max(0.8, 1 - ratio * 0.15),
          saturacion: Math.max(0.5, 1 - ratio * 0.3)
        };
      }
      
      // Si falta mucho, está bien
      return {
        nivel: 0,
        diasSinAtencion: diasHastaCumple,
        opacidad: 1,
        escala: 1,
        saturacion: 1
      };
    }
    
    diasEsperados = FRECUENCIAS[frecuencia] || 30;
    
    let ultimaInteraccion = null;
    if (contacto.fechaRecordatorio) {
      ultimaInteraccion = new Date(contacto.fechaRecordatorio);
    } else if (contacto.interacciones && contacto.interacciones.length > 0) {
      // Solo usar interacciones (no tareas) para calcular degradación
      const interaccionesOrdenadas = contacto.interacciones
        .filter(i => i.fechaHora) // Solo interacciones con fecha
        .sort((a, b) => new Date(b.fechaHora) - new Date(a.fechaHora));
      if (interaccionesOrdenadas.length > 0) {
        ultimaInteraccion = new Date(interaccionesOrdenadas[0].fechaHora);
      }
    }
    
    if (!ultimaInteraccion) {
      return { 
        nivel: 1, 
        diasSinAtencion: diasEsperados * 2, 
        opacidad: 0.6, 
        escala: 0.8,
        saturacion: 0.5
      };
    }
    
    const hoy = new Date();
    const diasSinAtencion = Math.floor((hoy - ultimaInteraccion) / (1000 * 60 * 60 * 24));
    const ratio = diasSinAtencion / diasEsperados;
    
    let nivel = Math.min(ratio, 2.5) / 2.5;
    let opacidad = Math.max(0.55, 1 - nivel * 0.45);
    let escala = Math.max(0.75, 1 - nivel * 0.25);
    let saturacion = Math.max(0.4, 1 - nivel * 0.6);
    
    return { nivel, diasSinAtencion, opacidad, escala, saturacion };
  };

  const obtenerColorDegradacion = (nivel) => {
    if (nivel < 0.25) return COLORES.activo;
    if (nivel < 0.55) return COLORES.atencion;
    return COLORES.urgente;
  };

  // Algoritmo de Interacción Social
  // Calcula un score basado en datos completados, interacciones, frecuencia y cumplimiento de tareas
  const calcularScoreInteraccionSocial = (contacto) => {
    let score = 0;
    const pesos = {
      datosCompletados: 30,    // Máximo 30 puntos
      interacciones: 25,       // Máximo 25 puntos
      frecuencia: 20,          // Máximo 20 puntos
      cumplimientoTareas: 25   // Máximo 25 puntos
    };

    // 1. Puntos por datos completados en el modal (máximo 30 puntos)
    let puntosDatos = 0;
    if (contacto.foto && contacto.foto.length > 20) puntosDatos += 5; // Foto
    if (contacto.fechaNacimiento) {
      const partes = contacto.fechaNacimiento.split('/');
      if (partes.length >= 2) puntosDatos += 5; // Día y mes
      if (partes.length >= 3 && partes[2]) puntosDatos += 3; // Año completo
    }
    if (contacto.clasificacion && CLASIFICACIONES.includes(contacto.clasificacion)) puntosDatos += 4; // Clasificación
    if (contacto.prioridad && PRIORIDADES.includes(contacto.prioridad)) puntosDatos += 4; // Prioridad
    if (contacto.frecuencia && Object.keys(FRECUENCIAS).includes(contacto.frecuencia)) puntosDatos += 4; // Frecuencia
    if (contacto.nombre && contacto.nombre.trim().length > 0) puntosDatos += 3; // Nombre
    if (contacto.telefono && contacto.telefono.length > 0) puntosDatos += 2; // Teléfono
    
    score += Math.min(puntosDatos, pesos.datosCompletados);

    // 2. Puntos por cantidad de interacciones (máximo 25 puntos)
    const numInteracciones = contacto.interacciones ? contacto.interacciones.length : 0;
    // Escala logarítmica: 0 interacciones = 0 puntos, 1-2 = 5pts, 3-5 = 10pts, 6-10 = 15pts, 11-20 = 20pts, 21+ = 25pts
    let puntosInteracciones = 0;
    if (numInteracciones === 0) puntosInteracciones = 0;
    else if (numInteracciones <= 2) puntosInteracciones = 5;
    else if (numInteracciones <= 5) puntosInteracciones = 10;
    else if (numInteracciones <= 10) puntosInteracciones = 15;
    else if (numInteracciones <= 20) puntosInteracciones = 20;
    else puntosInteracciones = 25;
    
    score += puntosInteracciones;

    // 3. Puntos por frecuencia de riego establecida (máximo 20 puntos)
    // Frecuencias más cortas indican más atención
    let puntosFrecuencia = 0;
    if (contacto.frecuencia) {
      const diasFrecuencia = FRECUENCIAS[contacto.frecuencia];
      if (diasFrecuencia === 'cumpleanos') {
        puntosFrecuencia = 15; // Cumpleaños es especial
      } else if (diasFrecuencia <= 3) {
        puntosFrecuencia = 20; // Cada 2-3 días = máxima atención
      } else if (diasFrecuencia <= 7) {
        puntosFrecuencia = 18; // Semanal
      } else if (diasFrecuencia <= 15) {
        puntosFrecuencia = 15; // Cada 15 días
      } else if (diasFrecuencia <= 30) {
        puntosFrecuencia = 12; // Mensual
      } else if (diasFrecuencia <= 60) {
        puntosFrecuencia = 8; // Cada 2 meses
      } else if (diasFrecuencia <= 90) {
        puntosFrecuencia = 5; // Cada 3 meses
      } else {
        puntosFrecuencia = 3; // Cada 6 meses o anual
      }
    } else {
      puntosFrecuencia = 5; // Sin frecuencia definida = baja atención
    }
    
    score += puntosFrecuencia;

    // 4. Puntos por cumplimiento de tareas (máximo 25 puntos)
    const tareas = contacto.tareas || [];
    const totalTareas = tareas.length;
    const tareasCompletadas = tareas.filter(t => t.completada).length;
    
    let puntosCumplimiento = 0;
    if (totalTareas === 0) {
      puntosCumplimiento = 10; // Sin tareas = puntaje neutro
    } else {
      const tasaCumplimiento = tareasCompletadas / totalTareas;
      puntosCumplimiento = Math.round(tasaCumplimiento * 15); // 0-15 puntos por cumplimiento básico
      
      // Bonus por tareas completadas recientemente (indica atención activa)
      const hoy = new Date();
      const tareasCompletadasConFecha = tareas.filter(t => t.completada && t.fechaHoraCompletado);
      let puntosRecencia = 0;
      
      tareasCompletadasConFecha.forEach(tarea => {
        const fechaCompletado = new Date(tarea.fechaHoraCompletado);
        const diasDesdeCompletado = Math.floor((hoy - fechaCompletado) / (1000 * 60 * 60 * 24));
        
        // Más puntos por tareas completadas recientemente
        if (diasDesdeCompletado <= 7) {
          puntosRecencia += 2; // Completadas en la última semana
        } else if (diasDesdeCompletado <= 30) {
          puntosRecencia += 1; // Completadas en el último mes
        } else if (diasDesdeCompletado <= 90) {
          puntosRecencia += 0.5; // Completadas en los últimos 3 meses
        }
        // Tareas completadas hace más de 3 meses no dan bonus de recencia
      });
      
      puntosCumplimiento += Math.min(puntosRecencia, 5); // Máximo 5 puntos por recencia
      
      // Bonus por tener tareas programadas (indica planificación)
      if (totalTareas >= 5) puntosCumplimiento += 5; // Bonus por tener muchas tareas
      else if (totalTareas >= 3) puntosCumplimiento += 3;
      else if (totalTareas >= 1) puntosCumplimiento += 1;
    }
    
    score += Math.min(puntosCumplimiento, pesos.cumplimientoTareas);

    return score;
  };

  // Calcula el porcentaje de atención normalizado (1-100) comparando con todos los contactos
  const calcularPorcentajeAtencion = (contacto, todosLosContactos) => {
    if (!todosLosContactos || todosLosContactos.length === 0) return 50; // Valor neutro si no hay contactos
    
    const scoreContacto = calcularScoreInteraccionSocial(contacto);
    
    // Calcular scores de todos los contactos
    const scores = todosLosContactos.map(c => calcularScoreInteraccionSocial(c));
    
    // Encontrar min y max para normalizar
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    
    // Si todos tienen el mismo score, retornar 50%
    if (maxScore === minScore) return 50;
    
    // Normalizar a escala 1-100
    const porcentaje = Math.round(1 + ((scoreContacto - minScore) / (maxScore - minScore)) * 99);
    
    return Math.max(1, Math.min(100, porcentaje)); // Asegurar que esté entre 1 y 100
  };

  const STORAGE_KEY_NOTIFICACIONES_VISTAS = '@notificaciones_vistas';

  const cargarNotificacionesVistas = async () => {
    try {
      const vistasJson = await AsyncStorage.getItem(STORAGE_KEY_NOTIFICACIONES_VISTAS);
      if (vistasJson) {
        setNotificacionesVistas(new Set(JSON.parse(vistasJson)));
      }
    } catch (error) {
      console.error('Error cargando notificaciones vistas:', error);
    }
  };

  const guardarNotificacionesVistas = async (vistas) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_NOTIFICACIONES_VISTAS, JSON.stringify(Array.from(vistas)));
    } catch (error) {
      console.error('Error guardando notificaciones vistas:', error);
    }
  };

  const cargarNotificaciones = async () => {
    try {
      const res = await fetchWithAuth(API_URL);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const contactos = await res.json();
      
      const notifs = [];
      const hoy = new Date();
      
      // 1. Tareas pendientes
      contactos.forEach(contacto => {
        if (contacto.tareas && contacto.tareas.length > 0) {
          contacto.tareas.forEach(tarea => {
            if (!tarea.completada && tarea.fechaHoraEjecucion) {
              const fechaEjecucion = new Date(tarea.fechaHoraEjecucion);
              const hoyTemp = new Date();
              hoyTemp.setHours(0, 0, 0, 0);
              fechaEjecucion.setHours(0, 0, 0, 0);
              const diasRestantes = Math.floor((fechaEjecucion - hoyTemp) / (1000 * 60 * 60 * 24));
              
              if (diasRestantes >= -7) {
                notifs.push({
                  id: `tarea-${contacto._id}-${tarea.fechaHoraCreacion}`,
                  tipo: 'tarea',
                  prioridad: diasRestantes <= 0 ? 'urgente' : diasRestantes <= 3 ? 'alta' : 'media',
                  titulo: `📋 ${tarea.clasificacion || 'Tarea'}`,
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
      
      // 3. Cumpleaños próximos
      contactos.forEach(contacto => {
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
                tipo: 'cumpleanos',
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
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    }
  };

  const marcarComoVista = async (notificacionId) => {
    const nuevasVistas = new Set(notificacionesVistas);
    nuevasVistas.add(notificacionId);
    setNotificacionesVistas(nuevasVistas);
    await guardarNotificacionesVistas(nuevasVistas);
  };

  const eliminarNotificacion = async (notificacionId) => {
    const nuevasVistas = new Set(notificacionesVistas);
    nuevasVistas.add(notificacionId); // Marcar como vista al eliminar
    setNotificacionesVistas(nuevasVistas);
    await guardarNotificacionesVistas(nuevasVistas);
  };

  const eliminarTodasNotificaciones = async () => {
    const todasIds = notificaciones.map(n => n.id);
    const nuevasVistas = new Set([...notificacionesVistas, ...todasIds]);
    setNotificacionesVistas(nuevasVistas);
    await guardarNotificacionesVistas(nuevasVistas);
  };

  const obtenerColorPrioridad = (prioridad) => {
    switch (prioridad) {
      case 'urgente': return COLORES.urgente;
      case 'alta': return COLORES.atencion;
      case 'media': return COLORES.activo;
      default: return COLORES.textoSuave;
    }
  };

  const normalizarTelefono = (telf) => telf ? telf.replace(/[^\d]/g, '') : '';
  const limpiarTelefonoVisual = (telf) => telf ? telf.replace(/[^\d+]/g, '') : '';

  // Funciones del modo swipe/descubrir
  const prepararDatosJuego = async (silent = false) => {
    if(!silent) setCargando(true);
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Image],
      });
      const validos = data.filter(c => c.name && c.phoneNumbers && c.phoneNumbers[0]);
      const aleatorios = validos.sort(() => 0.5 - Math.random()).slice(0, 30); 
      setMisContactos(aleatorios);
      setCurrentIndex(0); 
      activeIndex.current = 0; 
      setPilaAcciones([]); 
      isSwiping.current = false;
    }
    if(!silent) setCargando(false);
  };

  const activarModoJuego = async () => {
    if (misContactos.length === 0) await prepararDatosJuego();
    setModoJuego(true);
  };

  const cerrarModoJuego = () => {
    setModoJuego(false);
    prepararDatosJuego(true);
    cargarVinculos();
  };

  const onSwipeComplete = (direction) => {
    const idx = activeIndex.current;
    const item = contactsRef.current[idx];
    if (!item || !item.name) return;

    setPilaAcciones(prev => [...prev, { index: idx, tipo: direction === 'right' ? 'guardar' : 'descartar', item }]);

    if (direction === 'right') {
      const telefono = item.phoneNumbers && item.phoneNumbers[0] && item.phoneNumbers[0].number 
        ? limpiarTelefonoVisual(item.phoneNumbers[0].number) 
        : '';
      
      if (telefono) {
        const datos = {
          nombre: item.name || 'Sin nombre',
          telefono: telefono,
          prioridad: '✨ Media',
          frecuencia: 'Mensual',
          clasificacion: 'Amigo',
          foto: item.image && item.image.uri ? item.image.uri : ''
        };
        guardarEnServidor(datos);
        cargarVinculos();
      }
    }

    if (position && position.setValue) {
      position.setValue({ x: 0, y: 0 });
    }
    setCurrentIndex(prev => Math.min(prev + 1, misContactos.length));
    isSwiping.current = false;
  };
  
  const forceSwipe = (direction) => {
    if (isSwiping.current || !position) return;
    if (currentIndex >= misContactos.length) return;
    
    isSwiping.current = true;
    const x = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
    Animated.timing(position, { toValue: { x, y: 0 }, duration: 250, useNativeDriver: false }).start(() => {
      onSwipeComplete(direction);
    });
  };

  const deshacerAccion = () => {
    if (isSwiping.current || pilaAcciones.length === 0 || currentIndex === 0) return;
    if (!position) return;
    
    isSwiping.current = true;
    const ultima = pilaAcciones[pilaAcciones.length - 1];
    if (ultima && ultima.tipo === 'guardar' && ultima.item) {
      const phoneNumbers = ultima.item.phoneNumbers;
      if (phoneNumbers && phoneNumbers[0] && phoneNumbers[0].number) {
        const telf = limpiarTelefonoVisual(phoneNumbers[0].number);
        borrarDelServidor(telf);
        cargarVinculos();
      }
    }
    setPilaAcciones(prev => prev.slice(0, -1));
    setCurrentIndex(prev => Math.max(0, prev - 1));
    if (position && position.setValue) {
      position.setValue({ x: 0, y: 0 });
    }
    isSwiping.current = false;
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => {
      if (!position || isSwiping.current || currentIndex >= misContactos.length) return false;
      return true;
    },
    onPanResponderMove: (evt, gestureState) => {
      if (isSwiping.current || !position || currentIndex >= misContactos.length) return;
      if (position.setValue) {
        position.setValue({ x: gestureState.dx, y: gestureState.dy });
      }
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (isSwiping.current || !position || currentIndex >= misContactos.length) return;
      if (gestureState.dx > SWIPE_THRESHOLD) forceSwipe('right');
      else if (gestureState.dx < -SWIPE_THRESHOLD) forceSwipe('left');
      else if (position.setValue) {
        Animated.spring(position, { toValue: { x: 0, y: 0 }, friction: 6, tension: 60, useNativeDriver: false }).start();
      }
    }
  }), [currentIndex, misContactos.length]);

  const getCardStyle = () => {
    try {
      if (!position || !position.x || typeof position.x.interpolate !== 'function') {
        return { transform: [{ rotate: '0deg' }] };
      }
      const rotate = position.x.interpolate({ 
        inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5], 
        outputRange: ['-120deg', '0deg', '120deg'] 
      });
      const layout = position.getLayout ? position.getLayout() : {};
      return { ...layout, transform: [{ rotate }] };
    } catch (error) {
      console.warn('Error en getCardStyle:', error);
      return { transform: [{ rotate: '0deg' }] };
    }
  };

  // Funciones de servidor con sincronización offline
  const guardarEnServidor = async (datos) => {
    try {
      const datosLimpios = { ...datos, telefono: limpiarTelefonoVisual(datos.telefono) };
      
      // Limpiar campos internos antes de guardar
      const bodyData = { ...datosLimpios };
      delete bodyData._isLocal;
      delete bodyData._pendingSync;
      
      let result;
      if (datosLimpios._id && !datosLimpios._id.startsWith('temp_')) {
        // Actualizar contacto existente
        result = await updateContact(datosLimpios._id, bodyData);
      } else {
        // Crear nuevo contacto
        delete bodyData._id;
        result = await createContact(bodyData);
      }
      
      // Actualizar estado local inmediatamente
      if (result.success) {
        await cargarVinculos();
        const pendingCount = await getPendingSyncCount();
        setPendingSyncCount(pendingCount);
        
        if (result.offline) {
          console.log('📝 Cambios guardados localmente, se sincronizarán cuando haya conexión');
        }
      }
      
      return result.success;
    } catch (error) {
      console.error('Error guardando contacto:', error);
      Alert.alert('Error', 'No se pudo guardar el contacto. Los cambios se guardaron localmente.');
      return false; 
    }
  };

  const borrarDelServidor = async (telefonoRaw) => {
    try {
      // Buscar el contacto por teléfono
      const contacto = vinculos.find(c => 
        normalizarTelefono(c.telefono) === normalizarTelefono(telefonoRaw)
      );
      
      if (!contacto || !contacto._id) {
        console.error('Contacto no encontrado para eliminar');
        return false;
      }
      
      const result = await deleteContact(contacto._id);
      
      if (result.success) {
        await cargarVinculos();
        const pendingCount = await getPendingSyncCount();
        setPendingSyncCount(pendingCount);
        
        if (result.offline) {
          console.log('🗑️ Eliminación guardada localmente, se sincronizará cuando haya conexión');
        }
      }
      
      return result.success;
    } catch (error) {
      console.error('Error eliminando contacto:', error);
      return false; 
    }
  };

  // Funciones de modales
  const abrirDirectorio = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      setCargando(true);
      try {
        const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Image] });
        console.log('📱 Contactos obtenidos:', data.length);
        const validos = data.filter(c => c.name && c.phoneNumbers && c.phoneNumbers[0]);
        console.log('✅ Contactos válidos:', validos.length);
        if (validos.length > 0) {
          console.log('📋 Primer contacto:', JSON.stringify(validos[0], null, 2));
        }
        setAgendaTelefonica(validos.sort((a,b) => a.name.localeCompare(b.name)));
        setCargando(false);
        setModalSelectorVisible(true);
      } catch (error) {
        console.error('❌ Error cargando contactos:', error);
        setCargando(false);
        Alert.alert("Error", "No se pudieron cargar los contactos");
      }
    } else { 
      Alert.alert("Permiso denegado"); 
    }
  };

  const estaImportado = (contacto) => {
    if (!contacto.phoneNumbers || !contacto.phoneNumbers[0]) return false;
    const telefonoContacto = limpiarTelefonoVisual(contacto.phoneNumbers[0].number);
    return vinculos.some(c => normalizarTelefono(c.telefono) === normalizarTelefono(telefonoContacto));
  };

  const importarContacto = async (c) => {
    if (estaImportado(c)) {
      Alert.alert("Ya importado", "Este contacto ya está en tu lista de vínculos.");
      return;
    }
    
    const nuevo = { 
      nombre: c.name, 
      telefono: limpiarTelefonoVisual(c.phoneNumbers[0].number), 
      prioridad: '✨ Media', 
      frecuencia: 'Mensual', 
      clasificacion: 'Conocido', 
      foto: c.image ? c.image.uri : '' 
    };
    setGuardando(true);
    if (await guardarEnServidor(nuevo)) {
      cargarVinculos(); // Actualiza la lista para marcar el contacto como importado
      // El modal permanece abierto para permitir agregar más contactos
      // El usuario puede cerrarlo manualmente cuando lo desee
    } else {
      Alert.alert("Error", "No se pudo importar el contacto. Intenta nuevamente.");
    }
    setGuardando(false);
  };

  const abrirModalVip = (item) => {
    const telfBuscado = normalizarTelefono(item.telefono);
    const contacto = vinculos.find(c => normalizarTelefono(c.telefono) === telfBuscado) || item;
    let prio = contacto.prioridad; 
    if (!PRIORIDADES.includes(prio)) prio = '✨ Media';
    let freq = contacto.frecuencia; 
    if (!FRECUENCIAS.hasOwnProperty(freq)) freq = 'Mensual';
    let clas = contacto.clasificacion; 
    if (!CLASIFICACIONES.includes(clas)) clas = 'Amigo';
    const partes = (contacto.fechaNacimiento || '').split('/');
    setDiaCumple(partes[0] || ''); 
    setMesCumple(partes[1] || ''); 
    setAnioCumple(partes[2] || '');
    setDatosEditados({ 
      ...contacto, 
      telefonoOriginal: contacto.telefono, 
      telefono: limpiarTelefonoVisual(contacto.telefono), 
      prioridad: prio, 
      frecuencia: freq, 
      clasificacion: clas,
      tareas: contacto.tareas || [], // Asegurar que tareas existe
      interacciones: contacto.interacciones || [] // Asegurar que interacciones existe
    });
    setModalVisible(true);
  };

  const guardarCambios = async () => {
    // Validar que si la frecuencia es Cumpleaños, debe tener fecha de nacimiento
    if (datosEditados.frecuencia === 'Cumpleaños') {
      if (!diaCumple || !mesCumple) {
        Alert.alert(
          'Fecha de cumpleaños requerida',
          'Para usar la frecuencia "Cumpleaños" debes ingresar al menos el día y mes de nacimiento.',
          [{ text: 'Entendido' }]
        );
        return;
      }
      
      // Validar que el día y mes sean válidos
      const dia = parseInt(diaCumple);
      const mes = parseInt(mesCumple);
      if (isNaN(dia) || isNaN(mes) || dia < 1 || dia > 31 || mes < 1 || mes > 12) {
        Alert.alert(
          'Fecha inválida',
          'Por favor ingresa una fecha de cumpleaños válida (día: 1-31, mes: 1-12).',
          [{ text: 'Entendido' }]
        );
        return;
      }
    }
    
    setGuardando(true);
    
    try {
      let fechaNac = (diaCumple && mesCumple) ? `${diaCumple}/${mesCumple}` : '';
      if (fechaNac && anioCumple) fechaNac += `/${anioCumple}`;
      
      const nuevo = { 
        ...datosEditados, 
        fechaNacimiento: fechaNac,
        telefono: limpiarTelefonoVisual(datosEditados.telefono)
      };
      
      // Si el contacto tiene _id, usar PUT para actualizar (no eliminar y crear nuevo)
      if (datosEditados._id) {
        // Actualizar contacto existente con PUT
        const guardado = await guardarEnServidor(nuevo);
        
        if (!guardado) {
          const online = await getConnectionStatus();
          if (!online) {
            Alert.alert(
              "Guardado local", 
              "El contacto se guardó localmente. Se sincronizará cuando haya conexión a internet."
            );
          } else {
            Alert.alert("Error", "No se pudo actualizar el contacto. Intenta nuevamente.");
          }
          setGuardando(false);
          return;
        }
      } else {
        // Contacto nuevo: solo eliminar el viejo si cambió el teléfono
        const telefonoCambio = datosEditados.telefonoOriginal && 
                              normalizarTelefono(datosEditados.telefonoOriginal) !== 
                              normalizarTelefono(datosEditados.telefono);
        
        if (telefonoCambio && datosEditados.telefonoOriginal) {
          // Si cambió el teléfono, eliminar el viejo
          const telefonoViejo = limpiarTelefonoVisual(datosEditados.telefonoOriginal);
          await borrarDelServidor(telefonoViejo);
        }
        
        // Crear nuevo contacto con POST
        const guardado = await guardarEnServidor(nuevo);
        
        if (!guardado) {
          const online = await getConnectionStatus();
          if (!online) {
            Alert.alert(
              "Guardado local", 
              "El contacto se guardó localmente. Se sincronizará cuando haya conexión a internet."
            );
          } else {
            Alert.alert("Error", "No se pudo guardar el contacto. Intenta nuevamente.");
          }
          setGuardando(false);
          return;
        }
      }
      
      setGuardando(false); 
      setModalVisible(false);
      cargarVinculos();
    } catch (error) {
      console.error('Error en guardarCambios:', error);
      Alert.alert("Error", "Ocurrió un error inesperado. Por favor intenta nuevamente.");
      setGuardando(false);
    }
  };
  
  const elegirFoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'Images', allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
    if (!r.canceled) setDatosEditados(prev => ({ ...prev, foto: 'data:image/jpeg;base64,' + r.assets[0].base64 }));
  };

  const eliminarContacto = () => {
    Alert.alert(
      "Eliminar contacto",
      `¿Estás seguro de que deseas eliminar a ${datosEditados.nombre || 'este contacto'} de tus vínculos? Esta acción no se puede deshacer.`,
      [
        {
          text: "Cancelar",
          style: "cancel"
        },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              // Usar el teléfono original (sin limpiar) para eliminar del servidor
              const telefonoAEliminar = datosEditados.telefonoOriginal || limpiarTelefonoVisual(datosEditados.telefono);
              const eliminado = await borrarDelServidor(telefonoAEliminar);
              if (eliminado) {
                setModalVisible(false);
                cargarVinculos();
                Alert.alert("Éxito", "Contacto eliminado correctamente");
              } else {
                Alert.alert("Error", "No se pudo eliminar el contacto");
              }
            } catch (error) {
              console.error('Error eliminando contacto:', error);
              Alert.alert("Error", "Ocurrió un error al eliminar el contacto");
            }
          }
        }
      ]
    );
  };

  // Funciones para gestionar interacciones (solo historial, no se pueden borrar)
  const agregarInteraccion = async () => {
    if (!textoInteraccion.trim()) {
      Alert.alert("Atención", "Describe la interacción.");
      return;
    }
    
    const nuevaInteraccion = { 
      fechaHora: fechaHoraInteraccion,
      descripcion: textoInteraccion
    };
    const interaccionesActualizadas = [...(datosEditados.interacciones || []), nuevaInteraccion];
    
    try {
      const res = await fetchWithAuth(`${API_URL}/${datosEditados._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interacciones: interaccionesActualizadas })
      });
      
      if (res.ok) {
        const data = await res.json();
        setDatosEditados({ ...data, telefonoOriginal: datosEditados.telefonoOriginal, telefono: datosEditados.telefono });
        setTextoInteraccion("");
        setFechaHoraInteraccion(new Date());
        cargarVinculos();
      }
    } catch (e) { 
      Alert.alert("Error", "No se pudo conectar con el servidor."); 
    }
  };

  const abrirEditarInteraccion = (item) => {
    setInteraccionEditando({ interaccion: item });
    setEditInteraccionDescripcion(item.descripcion || '');
    setEditInteraccionFecha(item.fechaHora ? new Date(item.fechaHora) : new Date());
    setModalEditarInteraccionVisible(true);
  };

  const cerrarEditarInteraccion = () => {
    setModalEditarInteraccionVisible(false);
    setInteraccionEditando(null);
  };

  const guardarEditarInteraccion = async () => {
    if (!interaccionEditando?.interaccion || !datosEditados._id) return;
    if (!editInteraccionDescripcion.trim()) {
      Alert.alert('Atención', 'La descripción no puede estar vacía.');
      return;
    }
    const lista = datosEditados.interacciones || [];
    const ref = interaccionEditando.interaccion;
    let idx = lista.findIndex((i) => i === ref);
    if (idx === -1) {
      const refTs = ref.fechaHora ? new Date(ref.fechaHora).getTime() : 0;
      idx = lista.findIndex((i) => (i.descripcion || '') === (ref.descripcion || '') && (i.fechaHora ? new Date(i.fechaHora).getTime() : 0) === refTs);
    }
    if (idx === -1) {
      Alert.alert('Error', 'No se encontró la interacción.');
      return;
    }
    const actualizadas = [...lista];
    actualizadas[idx] = {
      ...actualizadas[idx],
      descripcion: editInteraccionDescripcion.trim(),
      fechaHora: editInteraccionFecha instanceof Date ? editInteraccionFecha : new Date(editInteraccionFecha),
    };
    try {
      const result = await updateContactInteracciones(datosEditados._id, actualizadas);
      if (result.success) {
        setDatosEditados((prev) => ({ ...prev, interacciones: result.contacto.interacciones || actualizadas }));
        cargarVinculos();
        cerrarEditarInteraccion();
      } else {
        Alert.alert('Error', 'No se pudo guardar la interacción.');
      }
    } catch (e) {
      console.error('Error guardando interacción:', e);
      Alert.alert('Error', 'No se pudo guardar la interacción.');
    }
  };

  // Funciones para gestionar tareas (separadas, se pueden borrar y completar)
  const agregarTarea = async () => {
    if (!textoTarea.trim()) {
      Alert.alert("Atención", "Describe la tarea.");
      return;
    }
    
    const fechaEjecucionValida = (fechaHoraEjecucion instanceof Date && !isNaN(fechaHoraEjecucion.getTime())) ? fechaHoraEjecucion : new Date();
    
    // Asegurar que datosEditados.tareas existe y es un array
    const tareasExistentes = Array.isArray(datosEditados.tareas) ? datosEditados.tareas : [];
    
    const nuevaTarea = { 
      fechaHoraCreacion: new Date(),
      descripcion: textoTarea.trim(),
      fechaHoraEjecucion: fechaEjecucionValida,
      clasificacion: clasificacionTarea,
      completada: false,
      interaccionRelacionada: tareaDesdeTarea ? (tareaDesdeTarea._id || null) : null,
      ...(tareaRecurrenteAnual && {
        recurrencia: { tipo: 'anual', fechaBase: fechaEjecucionValida },
        completadoParaAno: [],
      }),
    };
    
    if (!datosEditados._id) {
      Alert.alert("Error", "El contacto debe estar guardado antes de agregar tareas.");
      return;
    }
    
    const tareasActualizadas = [...tareasExistentes, nuevaTarea];
    
    console.log('=== AGREGAR TAREA ===');
    console.log('Nueva tarea:', nuevaTarea);
    console.log('Tareas existentes:', tareasExistentes.length);
    console.log('Tareas actualizadas:', tareasActualizadas.length);
    console.log('ID del contacto:', datosEditados._id);
    
    try {
      const result = await updateContactTareas(datosEditados._id, tareasActualizadas);
      
      if (result.success) {
        console.log('✅ Tarea guardada exitosamente');
        
        // Asegurar que tareas es un array antes de actualizar el estado
        const tareasGuardadas = Array.isArray(result.contacto.tareas) ? result.contacto.tareas : [];
        
        setDatosEditados({ 
          ...result.contacto, 
          telefonoOriginal: datosEditados.telefonoOriginal, 
          telefono: datosEditados.telefono,
          tareas: tareasGuardadas
        });
        setTextoTarea("");
        setFechaHoraEjecucion(new Date());
        setClasificacionTarea('Llamar');
        setTareaRecurrenteAnual(false);
        setTareaDesdeTarea(null);
        
        // Actualizar contador de pendientes
        const pendingCount = await getPendingSyncCount();
        setPendingSyncCount(pendingCount);
        
        cargarVinculos();
        
        if (result.offline) {
          console.log('📝 Tarea guardada localmente, se sincronizará cuando haya conexión');
        }
      } else {
        Alert.alert("Error", "No se pudo guardar la tarea.");
      }
    } catch (e) { 
      console.error('❌ Error agregando tarea:', e);
      Alert.alert("Error", "No se pudo guardar la tarea."); 
    }
  };

  const toggleTareaCompletada = async (index) => {
    if (!datosEditados._id) {
      Alert.alert("Error", "El contacto debe estar guardado.");
      return;
    }
    
    const tareasActualizadas = [...(datosEditados.tareas || [])];
    const tarea = tareasActualizadas[index];
    const nuevaCompletada = !tarea.completada;
    
    if (nuevaCompletada) {
      tareasActualizadas[index].fechaHoraCompletado = new Date();
      tareasActualizadas[index].completada = true;
      if (tarea.recurrencia?.tipo === 'anual') {
        const anio = new Date().getFullYear();
        const completados = [...(tarea.completadoParaAno || []), anio];
        tareasActualizadas[index].completadoParaAno = [...new Set(completados)];
      }
    } else {
      delete tareasActualizadas[index].fechaHoraCompletado;
      tareasActualizadas[index].completada = false;
      if (tarea.recurrencia?.tipo === 'anual' && tarea.completadoParaAno?.length) {
        const anio = new Date().getFullYear();
        tareasActualizadas[index].completadoParaAno = (tarea.completadoParaAno || []).filter(y => y !== anio);
      }
    }
    
    try {
      const result = await updateContactTareas(datosEditados._id, tareasActualizadas);
      
      if (result.success) {
        setDatosEditados({ 
          ...result.contacto, 
          telefonoOriginal: datosEditados.telefonoOriginal, 
          telefono: datosEditados.telefono 
        });
        
        // Actualizar contador de pendientes
        const pendingCount = await getPendingSyncCount();
        setPendingSyncCount(pendingCount);
        
        cargarVinculos();
        
        if (result.offline) {
          console.log('📝 Cambio de tarea guardado localmente, se sincronizará cuando haya conexión');
        }
      } else {
        Alert.alert("Error", "No se pudo actualizar la tarea.");
      }
    } catch (e) { 
      console.error('Error actualizando tarea:', e);
      Alert.alert("Error", "No se pudo actualizar la tarea."); 
    }
  };

  const eliminarTarea = async (index) => {
    if (!datosEditados._id) {
      Alert.alert("Error", "El contacto debe estar guardado.");
      return;
    }
    
    Alert.alert(
      "Eliminar tarea",
      "¿Estás seguro de eliminar esta tarea?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            const tareasActualizadas = [...(datosEditados.tareas || [])];
            tareasActualizadas.splice(index, 1);
            
            try {
              const result = await updateContactTareas(datosEditados._id, tareasActualizadas);
              
              if (result.success) {
                setDatosEditados({ 
                  ...result.contacto, 
                  telefonoOriginal: datosEditados.telefonoOriginal, 
                  telefono: datosEditados.telefono 
                });
                
                // Actualizar contador de pendientes
                const pendingCount = await getPendingSyncCount();
                setPendingSyncCount(pendingCount);
                
                cargarVinculos();
                
                if (result.offline) {
                  console.log('📝 Eliminación de tarea guardada localmente, se sincronizará cuando haya conexión');
                }
              } else {
                Alert.alert("Error", "No se pudo eliminar la tarea.");
              }
            } catch (e) { 
              console.error('Error eliminando tarea:', e);
              Alert.alert("Error", "No se pudo eliminar la tarea."); 
            }
          }
        }
      ]
    );
  };

  // Al abrir el modal de tareas, asegurar fecha/hora por defecto = ahora (por si se entra por otra ruta)
  useEffect(() => {
    if (modalTareasVisible) {
      setFechaHoraEjecucion(prev => (prev && prev instanceof Date && !isNaN(prev.getTime()) ? prev : new Date()));
    }
  }, [modalTareasVisible]);

  // Fecha/hora a mostrar en el formulario de nueva tarea (siempre un Date válido para evitar campo vacío)
  const fechaEjecucionDisplay = useMemo(() => {
    const d = fechaHoraEjecucion;
    return (d instanceof Date && !isNaN(d.getTime())) ? d : new Date();
  }, [fechaHoraEjecucion]);

  const crearTareaDesdeTarea = (tarea) => {
    setTareaDesdeTarea(tarea);
    setTextoTarea("");
    setFechaHoraEjecucion(new Date());
    setClasificacionTarea(tarea.clasificacion || 'Llamar');
    setModalTareasVisible(true);
  };

  const SelectorChips = ({ opciones, seleccionado, onSelect, colorActive }) => (
    <View style={styles.chipContainer}>
      {opciones.map(op => (
        <TouchableOpacity key={op} style={[styles.chip, seleccionado === op && { backgroundColor: colorActive, borderColor: colorActive }]} onPress={() => onSelect(op)}>
          <Text style={[styles.chipText, seleccionado === op && { color: 'white' }]}>{op}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const abrirMenuAcciones = (contacto, refObj) => {
    setContactoSeleccionado(contacto);
    
    // Obtener posición de la burbuja usando ref
    const ref = refObj && refObj.current ? refObj.current : null;
    if (ref) {
      ref.measureInWindow((x, y, width, height) => {
        const bubbleCenterX = x + width / 2;
        const bubbleCenterY = y + height / 2;
        
        // Determinar si mostrar a la izquierda o derecha
        // Si la burbuja está en la mitad izquierda, mostrar menú a la derecha
        // Si está en la mitad derecha, mostrar menú a la izquierda
        const lado = bubbleCenterX < SCREEN_WIDTH / 2 ? 'right' : 'left';
        setMenuLado(lado);
        
        // Ajustar posición Y para que los iconos quepan en pantalla
        const iconHeight = 56;
        const iconSpacing = 12;
        const totalHeight = (4 * iconHeight) + (3 * iconSpacing);
        let adjustedY = bubbleCenterY;
        
        // Si está muy arriba, ajustar hacia abajo
        if (adjustedY < totalHeight / 2) {
          adjustedY = totalHeight / 2 + 20;
        }
        // Si está muy abajo, ajustar hacia arriba
        if (adjustedY > SCREEN_HEIGHT - totalHeight / 2) {
          adjustedY = SCREEN_HEIGHT - totalHeight / 2 - 20;
        }
        
        setMenuPosition({ 
          x: bubbleCenterX, 
          y: adjustedY 
        });
        setMenuVisible(true);
        
        // Animación de entrada
        Animated.spring(menuAnimation, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }).start();
      });
    } else {
      // Fallback: usar una posición aproximada basada en el índice
      const index = vinculos.findIndex(c => c._id === contacto._id || c.telefono === contacto.telefono);
      const row = Math.floor(index / 3);
      const col = index % 3;
      const bubbleCenterX = (col * BUBBLE_SIZE) + (BUBBLE_SIZE / 2) + 15;
      const bubbleCenterY = 200 + (row * BUBBLE_SIZE) + (BUBBLE_SIZE / 2);
      
      // Determinar lado
      const lado = bubbleCenterX < SCREEN_WIDTH / 2 ? 'right' : 'left';
      setMenuLado(lado);
      
      setMenuPosition({ x: bubbleCenterX, y: bubbleCenterY });
      setMenuVisible(true);
      
      // Animación de entrada
      Animated.spring(menuAnimation, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  };

  const cerrarMenu = () => {
    Animated.timing(menuAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setMenuVisible(false);
      setContactoSeleccionado(null);
    });
  };

  const llamarContacto = (contacto) => {
    cerrarMenu();
    Linking.openURL(`tel:${limpiarTelefonoVisual(contacto.telefono)}`);
  };

  const abrirWhatsApp = (contacto) => {
    cerrarMenu();
    Linking.openURL(`whatsapp://send?phone=${limpiarTelefonoVisual(contacto.telefono)}`);
  };

  const abrirContacto = (contacto) => {
    cerrarMenu();
    abrirModalVip(contacto);
  };

  const regarContacto = (contacto) => {
    cerrarMenu();
    // Cargar datos del contacto para el modal de interacciones
    const telfBuscado = normalizarTelefono(contacto.telefono);
    const contactoCompleto = vinculos.find(c => normalizarTelefono(c.telefono) === telfBuscado) || contacto;
    
    // Preparar datos editados sin abrir el modal de contacto
    let prio = contactoCompleto.prioridad; 
    if (!PRIORIDADES.includes(prio)) prio = '✨ Media';
    let freq = contactoCompleto.frecuencia; 
    if (!FRECUENCIAS.hasOwnProperty(freq)) freq = 'Mensual';
    let clas = contactoCompleto.clasificacion; 
    if (!CLASIFICACIONES.includes(clas)) clas = 'Amigo';
    const partes = (contactoCompleto.fechaNacimiento || '').split('/');
    
    setDatosEditados({ 
      ...contactoCompleto, 
      telefonoOriginal: contactoCompleto.telefono, 
      telefono: limpiarTelefonoVisual(contactoCompleto.telefono), 
      prioridad: prio, 
      frecuencia: freq, 
      clasificacion: clas,
      tareas: contactoCompleto.tareas || [], // Asegurar que tareas existe
      interacciones: contactoCompleto.interacciones || [] // Asegurar que interacciones existe
    });
    
    // Inicializar estados de los modales
    setTextoInteraccion("");
    setFechaHoraInteraccion(new Date());
    setTextoTarea("");
    setFechaHoraEjecucion(new Date());
    setClasificacionTarea('Llamar');
    setTareaDesdeTarea(null);
    
    // Abrir directamente el modal de interacciones
    setModalInteraccionesVisible(true);
  };

  // Flujo Regar desde botón flotante: elegir contacto → agregar interacción
  const abrirModalRegar = () => {
    setPasoRegar('contacto');
    setContactoSeleccionadoParaRegar(null);
    setTextoInteraccionRegar('');
    setFechaHoraInteraccionRegar(new Date());
    setModalRegarVisible(true);
  };

  const cerrarModalRegar = () => {
    setModalRegarVisible(false);
    setPasoRegar('contacto');
    setContactoSeleccionadoParaRegar(null);
  };

  const seleccionarContactoParaRegar = (contacto) => {
    setContactoSeleccionadoParaRegar(contacto);
    setPasoRegar('formulario');
  };

  const volverASelectorContactoRegar = () => {
    setContactoSeleccionadoParaRegar(null);
    setPasoRegar('contacto');
  };

  const guardarNuevaInteraccionRegar = async () => {
    if (!contactoSeleccionadoParaRegar?._id) return;
    if (!textoInteraccionRegar.trim()) {
      Alert.alert('Atención', 'Describe la interacción.');
      return;
    }
    const nuevaInteraccion = {
      fechaHora: fechaHoraInteraccionRegar,
      descripcion: textoInteraccionRegar.trim(),
    };
    const interaccionesExistentes = Array.isArray(contactoSeleccionadoParaRegar.interacciones) ? contactoSeleccionadoParaRegar.interacciones : [];
    const interaccionesActualizadas = [...interaccionesExistentes, nuevaInteraccion];
    try {
      const result = await updateContactInteracciones(contactoSeleccionadoParaRegar._id, interaccionesActualizadas);
      if (result.success) {
        setVinculos(prev => prev.map(c => c._id === contactoSeleccionadoParaRegar._id ? result.contacto : c));
        cerrarModalRegar();
      } else {
        Alert.alert('Error', 'No se pudo guardar la interacción.');
      }
    } catch (e) {
      console.error('Error guardando interacción:', e);
      Alert.alert('Error', 'No se pudo guardar la interacción.');
    }
  };

  const renderBurbuja = ({ item, index }) => {
    if (!item) return null;
    
    const degradacion = calcularDegradacion(item);
    const colorBurbuja = obtenerColorDegradacion(degradacion.nivel);
    const tieneTareaPendiente = item.tareas && item.tareas.some(t => !t.completada);
    const bubbleKey = (item._id || item.telefono || index).toString();
    const animacion = animaciones.current[bubbleKey];
    
    const opacidadFinal = Math.max(0.6, degradacion.opacidad);
    const escalaFinal = Math.max(0.8, degradacion.escala);
    
    let translateY = 0;
    let scaleAnimated = escalaFinal;
    
    if (animacion && animacion.float && animacion.pulse) {
      translateY = animacion.float.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -4]
      });
      scaleAnimated = Animated.multiply(
        new Animated.Value(escalaFinal),
        animacion.pulse
      );
    }
    
    if (!burbujaRefs.current[bubbleKey]) {
      burbujaRefs.current[bubbleKey] = { current: null };
    }
    
    return (
      <Animated.View
        ref={(ref) => {
          if (ref) {
            burbujaRefs.current[bubbleKey].current = ref;
          }
        }}
        style={[
          styles.burbujaContainer,
          {
            opacity: opacidadFinal,
            transform: animacion && animacion.float && animacion.pulse ? [
              { translateY },
              { scale: scaleAnimated }
            ] : [
              { scale: escalaFinal }
            ],
          }
        ]}
      >
        <TouchableOpacity
          onPress={() => abrirMenuAcciones(item, burbujaRefs.current[bubbleKey])}
          activeOpacity={0.8}
          style={styles.burbujaTouchable}
        >
          {/* Contenedor del círculo + badges para que los iconos queden sobre el borde de la burbuja */}
          <View style={styles.burbujaWrapper}>
            <View style={[
              styles.burbuja, 
              { 
                borderColor: colorBurbuja,
                borderWidth: degradacion.nivel < 0.3 ? 2.5 : 2,
              }
            ]}>
              <View style={[
                styles.burbujaGradiente,
                { opacity: 1 - degradacion.nivel * 0.6 }
              ]} />
              
              {item.foto && item.foto.length > 20 ? (
                <View style={styles.burbujaImagenContainer}>
                  <Image 
                    source={{ uri: item.foto }} 
                    style={styles.burbujaImagen}
                  />
                  <View style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: 'rgba(255, 255, 255, 0.3)',
                      opacity: 1 - degradacion.saturacion,
                      borderRadius: BUBBLE_RADIUS_IMAGE,
                    }
                  ]} />
                </View>
              ) : (
                <View style={[
                  styles.burbujaInicial,
                  { 
                    backgroundColor: degradacion.nivel > 0.5 ? COLORES.fondoTerciario : COLORES.fondoSecundario,
                  }
                ]}>
                  <Ionicons 
                    name="person" 
                    size={BUBBLE_SIZE_IMAGE * 0.5} 
                    color={COLORES.textoSuave}
                    style={{ opacity: degradacion.saturacion }}
                  />
                </View>
              )}
            </View>
            
            {/* Iconos como cuadro: arriba-izq campanita, arriba-der gota, abajo-der corazón */}
            {tieneTareaPendiente && (
              <View style={[styles.badgeTarea, { borderColor: COLORES.atencion }]}>
                <Ionicons name="notifications" size={20} color={COLORES.atencion} />
              </View>
            )}
            {degradacion.nivel > 0.4 && (() => {
              const regarAnim = regarAnimaciones.current[bubbleKey];
              if (!regarAnim) return null;
              return (
                <Animated.View
                  style={[
                    styles.badgeRegar,
                    {
                      transform: [
                        { translateY: regarAnim.translateY }
                      ]
                    }
                  ]}
                >
                  <Ionicons name="water" size={20} color={COLORES.agua} />
                </Animated.View>
              );
            })()}
            {item.prioridad && item.prioridad.includes('Alta') && (
              <View style={[styles.badgePrioridad, { borderColor: COLORES.urgente }]}>
                <Ionicons name="heart" size={20} color={COLORES.urgente} />
              </View>
            )}
          </View>
          
          <Text style={[
            styles.burbujaNombre,
            { color: COLORES.texto }
          ]} numberOfLines={1}>
            {item.nombre}
          </Text>
          
          {degradacion.nivel > 0.25 && (
            <View style={[
              styles.degradacionBadge, 
              { 
                backgroundColor: colorBurbuja,
                opacity: 0.9
              }
            ]}>
              <Text style={styles.degradacionTexto}>
                {degradacion.diasSinAtencion}d
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Render del modo swipe/descubrir
  if (modoJuego) {
    if (misContactos.length === 0 || currentIndex >= misContactos.length) {
      return (
        <View style={styles.gameContainer}>
          <View style={styles.gameHeader}>
            <TouchableOpacity onPress={cerrarModoJuego} style={styles.exitButton}>
              <Ionicons name="close-circle" size={32} color="white" />
              <Text style={styles.exitText}>Salir</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.gameTitle}>¡Terminaste!</Text>
          <Text style={{color: 'white', fontSize: 18, textAlign: 'center', marginTop: 20}}>
            Has revisado todos los contactos disponibles
          </Text>
          <TouchableOpacity 
            onPress={prepararDatosJuego} 
            style={[styles.controlBtn, {marginTop: 30, backgroundColor: COLORES.activo}]}
          >
            <Text style={{color: 'white', fontSize: 16, fontWeight: 'bold'}}>Cargar más contactos</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    if (currentIndex < misContactos.length) {
      const contactoActual = misContactos[currentIndex];
      
      if (!contactoActual || !contactoActual.name) {
        return (
          <View style={styles.gameContainer}>
            <View style={styles.gameHeader}>
              <TouchableOpacity onPress={cerrarModoJuego} style={styles.exitButton}>
                <Ionicons name="close-circle" size={32} color="white" />
                <Text style={styles.exitText}>Salir</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.gameTitle}>Error al cargar contacto</Text>
            <TouchableOpacity onPress={() => setCurrentIndex(prev => prev + 1)} style={styles.controlBtn}>
              <Text style={{color: 'white'}}>Siguiente</Text>
            </TouchableOpacity>
          </View>
        );
      }
      
      const nombreContacto = contactoActual.name || 'Sin nombre';
      const inicialNombre = nombreContacto.charAt(0).toUpperCase();
      const tieneImagen = contactoActual.image && contactoActual.image.uri;
      const numeroTelefono = contactoActual.phoneNumbers && contactoActual.phoneNumbers[0] && contactoActual.phoneNumbers[0].number
        ? contactoActual.phoneNumbers[0].number
        : 'Sin teléfono';
      
      const listaAgendaFiltradaSwipe = agendaTelefonica.filter(c => c.name.toLowerCase().includes(filtroAgenda.toLowerCase()));

      return (
        <View style={styles.gameContainer}>
          {/* Modal de importación en modo swipe */}
          <Modal animationType="slide" visible={modalSelectorVisible} onRequestClose={() => setModalSelectorVisible(false)}>
            <SafeAreaView style={styles.modalFull}>
              <View style={styles.modalHeaderImportar}>
                <Text style={styles.modalTitleImportar}>Importar 📒</Text>
                <TouchableOpacity onPress={() => setModalSelectorVisible(false)} style={styles.modalCloseButton}>
                  <Ionicons name="close" size={24} color={COLORES.agua} />
                </TouchableOpacity>
              </View>
              <View style={styles.searchBarContainerModal}>
                <Ionicons name="search" size={20} color={COLORES.textoSuave} style={styles.searchIcon} />
                <TextInput 
                  style={styles.searchInputModal} 
                  placeholder="Buscar contacto..." 
                  value={filtroAgenda} 
                  onChangeText={setFiltroAgenda}
                  placeholderTextColor={COLORES.textoSuave}
                />
              </View>
              {listaAgendaFiltradaSwipe.length === 0 ? (
                <View style={styles.emptyModalState}>
                  <Ionicons name="search-outline" size={64} color={COLORES.textoSuave} />
                  <Text style={styles.emptyModalText}>
                    {filtroAgenda ? 'No se encontraron contactos' : 'No hay contactos disponibles'}
                  </Text>
                </View>
              ) : (
                <FlatList 
                  data={listaAgendaFiltradaSwipe}
                  keyExtractor={(item) => item.id || item.name + item.phoneNumbers?.[0]?.number}
                  renderItem={({item}) => {
                    const yaImportado = estaImportado(item);
                    return (
                      <TouchableOpacity 
                        style={[
                          styles.contactItem,
                          yaImportado && styles.contactItemImported
                        ]} 
                        onPress={() => !yaImportado && importarContacto(item)}
                        activeOpacity={yaImportado ? 1 : 0.7}
                        disabled={yaImportado}
                      >
                        <View style={[
                          styles.contactItemAvatar,
                          yaImportado && styles.contactItemAvatarImported
                        ]}>
                          <Text style={[
                            styles.contactItemAvatarText,
                            yaImportado && styles.contactItemAvatarTextImported
                          ]}>
                            {item.name ? item.name.charAt(0).toUpperCase() : '?'}
                          </Text>
                        </View>
                        <View style={styles.contactItemInfo}>
                          <View style={styles.contactItemNameContainer}>
                            <Text style={[
                              styles.contactItemName,
                              yaImportado && styles.contactItemNameImported
                            ]} numberOfLines={1}>
                              {item.name || 'Sin nombre'}
                            </Text>
                            {yaImportado && (
                              <View style={styles.importedBadge}>
                                <Ionicons name="checkmark-circle" size={16} color={COLORES.activo} />
                                <Text style={styles.importedBadgeText}>Importado</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[
                            styles.contactItemPhone,
                            yaImportado && styles.contactItemPhoneImported
                          ]} numberOfLines={1}>
                            {item.phoneNumbers && item.phoneNumbers[0] ? item.phoneNumbers[0].number : 'Sin teléfono'}
                          </Text>
                        </View>
                        {yaImportado ? (
                          <Ionicons name="checkmark-circle" size={28} color={COLORES.activo} style={styles.contactItemAddIcon} />
                        ) : (
                          <Ionicons name="add-circle" size={28} color={COLORES.activo} style={styles.contactItemAddIcon} />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  contentContainerStyle={styles.flatListContent}
                  showsVerticalScrollIndicator={true}
                />
              )}
            </SafeAreaView>
          </Modal>

          <View style={styles.gameHeader}>
            <TouchableOpacity onPress={cerrarModoJuego} style={styles.exitButton}>
              <Ionicons name="close-circle" size={32} color="white" />
              <Text style={styles.exitText}>Salir</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.gameTitle}>¿Cultivar relación?</Text>
          <View style={styles.cardArea}>
            <Animated.View 
              key={currentIndex} 
              style={[styles.card, getCardStyle()]} 
              {...(panResponder && panResponder.panHandlers ? panResponder.panHandlers : {})}
            >
              <View style={styles.cardInner}>
                {tieneImagen ? (
                  <Image 
                    source={{ uri: contactoActual.image.uri }} 
                    style={styles.cardImage}
                    onError={() => console.warn('Error cargando imagen del contacto')}
                  />
                ) : (
                  <Text style={styles.initial}>{inicialNombre}</Text>
                )}
                <Text style={styles.name}>{nombreContacto}</Text>
                <Text style={styles.number}>{numeroTelefono}</Text>
              </View>
            </Animated.View>
            <View style={styles.buttonsOverlay}>
              <TouchableOpacity 
                style={[styles.controlBtn, styles.btnNo]} 
                onPress={() => forceSwipe('left')}
                disabled={isSwiping.current}
              >
                <Ionicons name="close" size={40} color={COLORES.urgente} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.controlBtn, styles.btnUndo, {opacity: currentIndex === 0 ? 0.3 : 1}]} 
                onPress={deshacerAccion} 
                disabled={currentIndex === 0 || isSwiping.current}
              >
                <Ionicons name="arrow-undo" size={40} color={COLORES.atencion} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.controlBtn, styles.btnYes]} 
                onPress={() => forceSwipe('right')}
                disabled={isSwiping.current}
              >
                <Ionicons name="heart" size={40} color={COLORES.activo} />
              </TouchableOpacity>
            </View>
          </View>
          {/* Botón flotante para importar contactos - fuera del cardArea */}
          <View style={styles.bottomButtonContainer}>
            <TouchableOpacity 
              style={styles.floatingButtonImport}
              onPress={abrirDirectorio}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add" size={20} color="white" />
              <Text style={styles.floatingButtonImportText}>Importar contactos</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
  }

  if (cargando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORES.agua} />
      </View>
    );
  }

  if (vinculos.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.container}>
            <View style={styles.headerContainer}>
              <Text style={styles.header}>Vínculos</Text>
            </View>
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={80} color={COLORES.textoSuave} />
              <Text style={styles.emptyText}>No hay vínculos para mostrar</Text>
              <Text style={styles.emptySubtext}>Toca el botón para descubrir contactos</Text>
            </View>
          </View>
          {/* Botón flotante para modo swipe */}
          <Animated.View
            style={[
              styles.floatingButton,
              {
                transform: [{ scale: pulseAnimation }],
              }
            ]}
          >
            <TouchableOpacity 
              style={styles.floatingButtonInner}
              onPress={activarModoJuego}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal" size={24} color="white" />
            </TouchableOpacity>
          </Animated.View>
        </GestureHandlerRootView>
      </SafeAreaView>
    );
  }

  const listaAgendaFiltrada = agendaTelefonica.filter(c => c.name.toLowerCase().includes(filtroAgenda.toLowerCase()));

  const formatRecordingTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
        {/* Indicador de grabación en pantalla (absolute para quedar por encima del fondo) */}
        {voiceRecording && (
          <View style={styles.recordingBarWrapper}>
            <View style={styles.recordingBar}>
              <Animated.View style={[styles.recordingDot, { transform: [{ scale: recordingPulseAnim }] }]} />
              <Text style={styles.recordingText}>Grabando...</Text>
              <Text style={styles.recordingTime}>{formatRecordingTime(recordingElapsed)}</Text>
              <Text style={styles.recordingHint}>Toca el micrófono para enviar</Text>
            </View>
          </View>
        )}
        {/* Fondo decorativo con gradiente y círculos animados */}
        <FondoDecorativo />
        
        
        {/* Modal de edición de contacto */}
        <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Cultivar Relación 🌱</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Ionicons name="close-circle" size={30} color={COLORES.textoSuave} />
                  </TouchableOpacity>
                </View>
                
                {/* Foto con barra de nivel de atención */}
                {(() => {
                  try {
                    const porcentajeAtencion = calcularPorcentajeAtencion(datosEditados, vinculos);
                    // Determinar colores según el nivel: verde >= 70%, amarillo 40-69%, rojo < 40%
                    const colorVerde = COLORES.activo || '#66BB6A';
                    const colorAmarillo = COLORES.atencion || '#FFA726';
                    const colorRojo = COLORES.urgente || '#EF5350';
                    
                    // Determinar qué color usar según el porcentaje
                    let colorBarra = colorRojo;
                    if (porcentajeAtencion >= 70) {
                      colorBarra = colorVerde;
                    } else if (porcentajeAtencion >= 40) {
                      colorBarra = colorAmarillo;
                    }
                    
                    return (
                      <View style={styles.photoWithBarContainer}>
                        <View style={styles.photoContainer}>
                          {datosEditados.foto ? (
                            <TouchableOpacity onPress={() => setModalFotoFullscreen(true)}>
                              <Image key={datosEditados.foto.length} source={{ uri: datosEditados.foto }} style={styles.photo} />
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity onPress={elegirFoto}>
                              <View style={styles.photoPlaceholder}>
                                <Ionicons name="camera" size={35} color="white" />
                              </View>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity onPress={elegirFoto}>
                            <Text style={styles.photoLabel}>Cambiar foto</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.barraAtencionContainer}>
                          <View style={styles.barraAtencion}>
                            {/* Fondo con 3 secciones de colores (verde arriba, amarillo medio, rojo abajo) */}
                            <View style={styles.barraAtencionFondo}>
                              <View style={[styles.barraAtencionSegmento, { backgroundColor: colorVerde, flex: 1 }]} />
                              <View style={[styles.barraAtencionSegmento, { backgroundColor: colorAmarillo, flex: 1 }]} />
                              <View style={[styles.barraAtencionSegmento, { backgroundColor: colorRojo, flex: 1 }]} />
                            </View>
                            {/* Barra de llenado según porcentaje (se llena desde abajo) */}
                            <View style={[
                              styles.barraAtencionFill,
                              { 
                                height: `${porcentajeAtencion}%`,
                                backgroundColor: colorBarra
                              }
                            ]} />
                          </View>
                          <Text style={[styles.barraAtencionPorcentaje, { color: colorBarra }]}>
                            {Math.round(porcentajeAtencion)}%
                          </Text>
                        </View>
                      </View>
                    );
                  } catch (error) {
                    console.error('Error calculando porcentaje de atención:', error);
                    return (
                      <View style={styles.photoContainer}>
                        {datosEditados.foto ? (
                          <TouchableOpacity onPress={() => setModalFotoFullscreen(true)}>
                            <Image key={datosEditados.foto.length} source={{ uri: datosEditados.foto }} style={styles.photo} />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={elegirFoto}>
                            <View style={styles.photoPlaceholder}>
                              <Ionicons name="camera" size={35} color="white" />
                            </View>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={elegirFoto}>
                          <Text style={styles.photoLabel}>Cambiar foto</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }
                })()}
                <TextInput 
                  style={styles.inputName} 
                  value={datosEditados.nombre} 
                  onChangeText={(t) => setDatosEditados({...datosEditados, nombre: t})} 
                  placeholder="Nombre" 
                />
                <Text style={styles.phoneDisplay}>{datosEditados.telefono}</Text>
                
                {/* Iconos pequeños para acciones rápidas */}
                <View style={styles.iconosAccionContainer}>
                  <TouchableOpacity 
                    style={styles.iconoAccion}
                    onPress={() => {
                      setTextoInteraccion("");
                      setFechaHoraInteraccion(new Date());
                      setModalInteraccionesVisible(true);
                    }}
                  >
                    <Ionicons name="chatbubbles" size={20} color="white" />
                    {datosEditados.interacciones && datosEditados.interacciones.length > 0 && (
                      <View style={styles.iconoBadge}>
                        <Text style={styles.iconoBadgeText}>{datosEditados.interacciones.length}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.iconoAccion, { backgroundColor: COLORES.atencion }]}
                    onPress={() => {
                      setTextoTarea("");
                      setFechaHoraEjecucion(new Date());
                      setClasificacionTarea('Llamar');
                      setTareaDesdeTarea(null);
                      setModalTareasVisible(true);
                    }}
                  >
                    <Ionicons name="checkbox" size={20} color="white" />
                    {datosEditados.tareas && datosEditados.tareas.filter(t => !t.completada).length > 0 && (
                      <View style={styles.iconoBadge}>
                        <Text style={styles.iconoBadgeText}>{datosEditados.tareas.filter(t => !t.completada).length}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.iconoAccion, { backgroundColor: '#25D366' }]}
                    onPress={() => {
                      if (datosEditados.telefono) {
                        Linking.openURL(`whatsapp://send?phone=${limpiarTelefonoVisual(datosEditados.telefono)}`);
                      }
                    }}
                  >
                    <Ionicons name="logo-whatsapp" size={20} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.iconoAccion, { backgroundColor: '#007AFF' }]}
                    onPress={() => {
                      if (datosEditados.telefono) {
                        Linking.openURL(`tel:${limpiarTelefonoVisual(datosEditados.telefono)}`);
                      }
                    }}
                  >
                    <Ionicons name="call" size={20} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.iconoAccion, { backgroundColor: COLORES.agua }]}
                    onPress={() => {
                      setTextoInteraccion("");
                      setFechaHoraInteraccion(new Date());
                      setModalInteraccionesVisible(true);
                    }}
                  >
                    <Ionicons name="water" size={20} color="white" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.sectionContainer}>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                    <Text style={styles.sectionTitle}>
                      🎂 Cumpleaños {edadCalculada !== null && <Text style={{color: COLORES.agua}}>({edadCalculada} años)</Text>}
                    </Text>
                    {datosEditados.frecuencia === 'Cumpleaños' && (!diaCumple || !mesCumple) && (
                      <View style={styles.warningBadge}>
                        <Ionicons name="alert-circle" size={14} color={COLORES.urgente} />
                        <Text style={styles.warningText}>Requerido</Text>
                      </View>
                    )}
                  </View>
                  {datosEditados.frecuencia === 'Cumpleaños' && (!diaCumple || !mesCumple) && (
                    <Text style={styles.warningMessage}>
                      ⚠️ La frecuencia "Cumpleaños" requiere al menos día y mes de nacimiento
                    </Text>
                  )}
                  <View style={styles.birthdayRow}>
                    <TextInput 
                      style={[
                        styles.inputDate, 
                        datosEditados.frecuencia === 'Cumpleaños' && !diaCumple && styles.inputDateRequired
                      ]} 
                      placeholder="Día" 
                      keyboardType="number-pad" 
                      maxLength={2} 
                      value={diaCumple} 
                      onChangeText={setDiaCumple} 
                    />
                    <Text style={styles.slash}>/</Text>
                    <TextInput 
                      style={[
                        styles.inputDate, 
                        datosEditados.frecuencia === 'Cumpleaños' && !mesCumple && styles.inputDateRequired
                      ]} 
                      placeholder="Mes" 
                      keyboardType="number-pad" 
                      maxLength={2} 
                      value={mesCumple} 
                      onChangeText={setMesCumple} 
                    />
                    <Text style={styles.slash}>/</Text>
                    <TextInput style={[styles.inputDate, {flex:1.5}]} placeholder="Año (opcional)" keyboardType="number-pad" maxLength={4} value={anioCumple} onChangeText={setAnioCumple} />
                  </View>
                </View>
                <Text style={styles.label}>Círculo Social</Text>
                <SelectorChips 
                  opciones={CLASIFICACIONES} 
                  seleccionado={datosEditados.clasificacion} 
                  colorActive={COLORES.atencion} 
                  onSelect={(v) => setDatosEditados({...datosEditados, clasificacion: v})} 
                />
                <Text style={styles.label}>Importancia</Text>
                <SelectorChips 
                  opciones={PRIORIDADES} 
                  seleccionado={datosEditados.prioridad} 
                  colorActive={COLORES.urgente} 
                  onSelect={(v) => setDatosEditados({...datosEditados, prioridad: v})} 
                />
                <Text style={styles.label}>Frecuencia de Riego</Text>
                <SelectorChips 
                  opciones={Object.keys(FRECUENCIAS)} 
                  seleccionado={datosEditados.frecuencia} 
                  colorActive={COLORES.activo} 
                  onSelect={(v) => setDatosEditados({...datosEditados, frecuencia: v})} 
                />
                <TouchableOpacity style={styles.saveButton} onPress={guardarCambios} disabled={guardando}>
                  {guardando ? <ActivityIndicator color="white" /> : <Text style={styles.saveButtonText}>💾 Guardar Cambios</Text>}
                </TouchableOpacity>
                
                {/* Botón de eliminar contacto */}
                <TouchableOpacity 
                  style={[styles.saveButton, { marginTop: 16, backgroundColor: COLORES.urgente, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }]} 
                  onPress={eliminarContacto}
                >
                  <Ionicons name="trash-outline" size={20} color="white" />
                  <Text style={styles.saveButtonText}>Eliminar de mis vínculos</Text>
                </TouchableOpacity>
                
                <View style={{height: 40}} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Modal de interacciones */}
        <Modal animationType="slide" visible={modalInteraccionesVisible} onRequestClose={() => setModalInteraccionesVisible(false)}>
          <SafeAreaView style={styles.modalFull}>
            <View style={styles.modalInteraccionesContainer}>
              <View style={styles.modalHeaderImportar}>
                <Text style={styles.modalTitleImportar}>💬 Interacciones - {datosEditados.nombre || 'Contacto'}</Text>
                <TouchableOpacity onPress={() => setModalInteraccionesVisible(false)} style={styles.modalCloseButton}>
                  <Ionicons name="close" size={24} color={COLORES.agua} />
                </TouchableOpacity>
              </View>
            
            {/* Formulario para nueva interacción */}
            <KeyboardAvoidingView 
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{ flex: 0 }}
            >
              <View style={styles.nuevaInteraccionContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={styles.label}>Nueva Interacción</Text>
                  {/* Botón Premium - Voice Note e IA */}
                  <TouchableOpacity 
                    style={styles.premiumButton}
                    onPress={() => {
                      Alert.alert(
                        "Función Premium",
                        "Esta función estará disponible próximamente. Podrás grabar notas de voz que se convertirán automáticamente en texto usando IA.",
                        [{ text: "Entendido" }]
                      );
                    }}
                  >
                    <View style={styles.premiumButtonContent}>
                      <Ionicons name="mic" size={18} color={COLORES.agua} />
                      <Ionicons name="star" size={14} color="#FFD700" style={{ marginLeft: 4 }} />
                      <Text style={styles.premiumButtonText}>Premium</Text>
                    </View>
                  </TouchableOpacity>
                </View>
                <TextInput 
                  style={styles.inputNuevaInteraccion} 
                  value={textoInteraccion} 
                  onChangeText={setTextoInteraccion} 
                  placeholder="Describe lo más importante de esta interacción..." 
                  multiline={true}
                />
              
              {/* Fecha y hora de la interacción */}
              <View style={styles.interaccionOptionsRow}>
                <TouchableOpacity 
                  style={styles.interaccionFechaButton}
                  onPress={() => {
                    setDateModeInteraccion('date');
                    setShowDatePickerInteraccion(true);
                  }}
                >
                  <Ionicons name="calendar" size={16} color={COLORES.agua} />
                  <Text style={styles.interaccionFechaButtonText}>
                    {fechaHoraInteraccion ? `${fechaHoraInteraccion.toLocaleDateString()} ${fechaHoraInteraccion.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : "Fecha/Hora"}
                  </Text>
                </TouchableOpacity>
              </View>
              {showDatePickerInteraccion && (
                <DateTimePicker 
                  testID="dateTimePickerInteraccion" 
                  value={fechaHoraInteraccion} 
                  mode={dateModeInteraccion} 
                  is24Hour={true} 
                  display="default" 
                  onChange={(e,d) => { 
                    if(e.type==='dismissed'){setShowDatePickerInteraccion(false);return;} 
                    const curr=d||new Date(); 
                    if(dateModeInteraccion==='date'){
                      setFechaHoraInteraccion(curr);
                      if(Platform.OS==='android'){
                        setShowDatePickerInteraccion(false);
                        setTimeout(()=>{setDateModeInteraccion('time');setShowDatePickerInteraccion(true);},100);
                      }else{
                        setDateModeInteraccion('time');
                      }
                    }else{
                      setFechaHoraInteraccion(curr);
                      setShowDatePickerInteraccion(false);
                    } 
                  }} 
                />
              )}
              
              <Text style={[styles.label, { fontSize: 10, color: COLORES.textoSuave, marginTop: 4, marginBottom: 2 }]}>
                Las interacciones son historial permanente y no se pueden borrar
              </Text>
              
              <TouchableOpacity 
                style={[styles.addInteraccionButton, !textoInteraccion.trim() && styles.addInteraccionButtonDisabled]} 
                onPress={agregarInteraccion}
                disabled={!textoInteraccion.trim()}
              >
                <Ionicons name="add-circle" size={18} color="white" />
                <Text style={styles.addInteraccionButtonText}>Agregar Interacción</Text>
              </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>

            {/* Lista de interacciones (se pueden editar) */}
            <FlatList
              style={{ flex: 1 }}
              data={datosEditados.interacciones ? [...datosEditados.interacciones].sort((a, b) => {
                if (!a.fechaHora || !b.fechaHora) return 0;
                return new Date(b.fechaHora) - new Date(a.fechaHora);
              }) : []}
              keyExtractor={(item, index) => `${item.fechaHora}-${index}`}
              renderItem={({item, index}) => (
                <View style={styles.interaccionItem}>
                  <View style={styles.interaccionContent}>
                    <Text style={styles.interaccionTexto}>
                      {item.descripcion}
                    </Text>
                    <View style={styles.interaccionMeta}>
                      {item.fechaHora && (
                        <Text style={styles.interaccionFecha}>
                          {new Date(item.fechaHora).toLocaleDateString()} {new Date(item.fechaHora).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.interaccionEditButton}
                    onPress={() => abrirEditarInteraccion(item)}
                  >
                    <Ionicons name="pencil-outline" size={22} color={COLORES.agua} />
                  </TouchableOpacity>
                </View>
              )}
              contentContainerStyle={styles.interaccionesListContent}
              ListEmptyComponent={
                <View style={styles.emptyInteraccionesState}>
                  <Ionicons name="chatbubbles-outline" size={48} color={COLORES.textoSuave} />
                  <Text style={styles.emptyInteraccionesText}>No hay interacciones registradas</Text>
                </View>
              }
            />
            </View>
          </SafeAreaView>
        </Modal>

        {/* Modal Editar interacción */}
        <Modal
          visible={modalEditarInteraccionVisible}
          animationType="slide"
          transparent
          onRequestClose={cerrarEditarInteraccion}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalEditarInteraccionContent}>
              <View style={styles.modalEditarInteraccionHeader}>
                <Text style={styles.modalEditarInteraccionTitle}>Editar interacción</Text>
                <TouchableOpacity onPress={cerrarEditarInteraccion}>
                  <Ionicons name="close" size={24} color={COLORES.texto} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalEditarInteraccionBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalEditarInteraccionLabel}>Descripción</Text>
                <TextInput
                  style={styles.inputNuevaInteraccion}
                  value={editInteraccionDescripcion}
                  onChangeText={setEditInteraccionDescripcion}
                  placeholder="Describe la interacción..."
                  placeholderTextColor={COLORES.textoSuave}
                  multiline
                />
                <Text style={styles.modalEditarInteraccionLabel}>Fecha y hora</Text>
                <TouchableOpacity
                  style={styles.interaccionFechaButton}
                  onPress={() => { setDateModeEditInteraccion('date'); setShowDatePickerEditInteraccion(true); }}
                >
                  <Ionicons name="calendar" size={16} color={COLORES.agua} />
                  <Text style={styles.interaccionFechaButtonText}>
                    {editInteraccionFecha ? `${editInteraccionFecha.toLocaleDateString('es-ES')} ${editInteraccionFecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Seleccionar'}
                  </Text>
                </TouchableOpacity>
                {showDatePickerEditInteraccion && (
                  <DateTimePicker
                    value={editInteraccionFecha}
                    mode={dateModeEditInteraccion}
                    is24Hour
                    display="default"
                    onChange={(e, d) => {
                      if (e.type === 'dismissed') { setShowDatePickerEditInteraccion(false); return; }
                      const curr = d || editInteraccionFecha;
                      if (dateModeEditInteraccion === 'date') {
                        setEditInteraccionFecha(curr);
                        if (Platform.OS === 'android') {
                          setShowDatePickerEditInteraccion(false);
                          setTimeout(() => { setDateModeEditInteraccion('time'); setShowDatePickerEditInteraccion(true); }, 100);
                        } else {
                          setDateModeEditInteraccion('time');
                        }
                      } else {
                        setEditInteraccionFecha(curr);
                        setShowDatePickerEditInteraccion(false);
                      }
                    }}
                  />
                )}
              </ScrollView>
              <View style={styles.modalEditarInteraccionFooter}>
                <TouchableOpacity style={styles.modalEditarInteraccionCancelButton} onPress={cerrarEditarInteraccion}>
                  <Text style={styles.modalEditarInteraccionCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalEditarInteraccionSaveButton, !editInteraccionDescripcion.trim() && styles.addInteraccionButtonDisabled]}
                  onPress={guardarEditarInteraccion}
                  disabled={!editInteraccionDescripcion.trim()}
                >
                  <Text style={styles.modalEditarInteraccionSaveText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal de tareas */}
        <Modal animationType="slide" visible={modalTareasVisible} onRequestClose={() => setModalTareasVisible(false)}>
          <SafeAreaView style={styles.modalFull}>
            <View style={styles.modalHeaderImportar}>
              <Text style={styles.modalTitleImportar}>📌 Tareas - {datosEditados.nombre || 'Contacto'}</Text>
              <TouchableOpacity onPress={() => setModalTareasVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color={COLORES.agua} />
              </TouchableOpacity>
            </View>
            
            {/* Formulario para nueva tarea */}
            <View style={styles.nuevaInteraccionContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[styles.label, { fontSize: 14 }]}>Nueva Tarea</Text>
                {/* Botón Premium - Voice Note e IA */}
                <TouchableOpacity 
                  style={styles.premiumButton}
                  onPress={() => {
                    Alert.alert(
                      "Función Premium",
                      "Esta función estará disponible próximamente. Podrás grabar notas de voz que se convertirán automáticamente en texto usando IA.",
                      [{ text: "Entendido" }]
                    );
                  }}
                >
                  <View style={styles.premiumButtonContent}>
                    <Ionicons name="mic" size={14} color={COLORES.agua} />
                    <Ionicons name="star" size={11} color="#FFD700" style={{ marginLeft: 2 }} />
                    <Text style={styles.premiumButtonText}>Premium</Text>
                  </View>
                </TouchableOpacity>
              </View>
              <TextInput 
                style={styles.inputNuevaInteraccion} 
                value={textoTarea} 
                onChangeText={setTextoTarea} 
                placeholder="Notas de la tarea (ej: Preguntar por su perro)..." 
                multiline={true}
              />
              
              <Text style={styles.label}>Fecha y hora de ejecución</Text>
              <TouchableOpacity 
                style={[styles.interaccionFechaButton, styles.interaccionFechaButtonTarea]}
                onPress={() => {
                  setDateModeEjecucion('date');
                  setShowDatePickerEjecucion(true);
                  if (!fechaHoraEjecucion || !(fechaHoraEjecucion instanceof Date) || isNaN(fechaHoraEjecucion.getTime())) {
                    setFechaHoraEjecucion(new Date());
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.interaccionFechaButtonIconWrap}>
                  <Ionicons name="calendar" size={32} color={COLORES.agua} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.interaccionFechaButtonHint}>Toca para elegir fecha y hora</Text>
                  <Text style={[styles.interaccionFechaButtonText, { color: COLORES.texto, fontSize: 14 }]}>
                    {fechaEjecucionDisplay.toLocaleDateString('es-ES')} · {fechaEjecucionDisplay.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={COLORES.textoSuave} />
              </TouchableOpacity>
              {showDatePickerEjecucion && (
                <DateTimePicker 
                  testID="dateTimePickerEjecucion" 
                  value={fechaEjecucionDisplay} 
                  mode={dateModeEjecucion} 
                  is24Hour={true} 
                  display="default" 
                  onChange={(e,d) => { 
                    if(e.type==='dismissed'){setShowDatePickerEjecucion(false);return;} 
                    const curr=d||new Date(); 
                    if(dateModeEjecucion==='date'){
                      setFechaHoraEjecucion(curr);
                      if(Platform.OS==='android'){
                        setShowDatePickerEjecucion(false);
                        setTimeout(()=>{setDateModeEjecucion('time');setShowDatePickerEjecucion(true);},100);
                      }else{
                        setDateModeEjecucion('time');
                      }
                    }else{
                      setFechaHoraEjecucion(curr);
                      setShowDatePickerEjecucion(false);
                    } 
                  }} 
                />
              )}
              
              <Text style={styles.label}>Clasificación</Text>
              <SelectorChips 
                opciones={CLASIFICACIONES_TAREAS} 
                seleccionado={clasificacionTarea} 
                colorActive={COLORES.agua} 
                onSelect={(v) => setClasificacionTarea(v)} 
              />
              
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}
                onPress={() => setTareaRecurrenteAnual(!tareaRecurrenteAnual)}
              >
                <Ionicons 
                  name={tareaRecurrenteAnual ? "checkbox" : "checkbox-outline"} 
                  size={22} 
                  color={tareaRecurrenteAnual ? COLORES.agua : COLORES.textoSuave} 
                />
                <Text style={[styles.label, { marginBottom: 0, fontSize: 14 }]}>Repetir cada año (ej. cumpleaños)</Text>
              </TouchableOpacity>
              
              {tareaDesdeTarea && (
                <Text style={[styles.label, { fontSize: 12, color: COLORES.textoSuave, marginTop: 8 }]}>
                  Creando tarea desde: {tareaDesdeTarea.descripcion}
                </Text>
              )}
              
              <TouchableOpacity 
                style={[styles.addInteraccionButton, !textoTarea.trim() && styles.addInteraccionButtonDisabled]} 
                onPress={agregarTarea}
                disabled={!textoTarea.trim()}
              >
                <Ionicons name="add-circle" size={20} color="white" />
                <Text style={styles.addInteraccionButtonText}>Agregar Tarea</Text>
              </TouchableOpacity>
            </View>

            {/* Lista de tareas */}
            <FlatList
              data={datosEditados.tareas ? [...datosEditados.tareas].sort((a, b) => {
                // Primero las no completadas, luego por fecha de ejecución
                if (!a.completada && b.completada) return -1;
                if (a.completada && !b.completada) return 1;
                if (!a.fechaHoraEjecucion || !b.fechaHoraEjecucion) return 0;
                return new Date(a.fechaHoraEjecucion) - new Date(b.fechaHoraEjecucion);
              }) : []}
              keyExtractor={(item, index) => `${item.fechaHoraCreacion || item._id || index}-${index}`}
              renderItem={({item, index}) => (
                <View style={[styles.interaccionItem, item.completada && styles.interaccionItemCompletada]}>
                  <TouchableOpacity 
                    style={styles.interaccionCheckbox}
                    onPress={() => toggleTareaCompletada(index)}
                  >
                    <Ionicons 
                      name={item.completada ? "checkbox" : "checkbox-outline"} 
                      size={24} 
                      color={item.completada ? COLORES.activo : COLORES.textoSuave} 
                    />
                  </TouchableOpacity>
                  <View style={styles.interaccionContent}>
                    <Text style={[styles.interaccionTexto, item.completada && styles.interaccionTextoCompletada]}>
                      {item.descripcion}
                    </Text>
                    <View style={styles.interaccionMeta}>
                      {item.clasificacion && (
                        <View style={styles.interaccionClasificacionBadge}>
                          <Text style={styles.interaccionClasificacionText}>{item.clasificacion}</Text>
                        </View>
                      )}
                      {item.fechaHoraEjecucion && (
                        <Text style={styles.interaccionEjecucion}>
                          📅 {new Date(item.fechaHoraEjecucion).toLocaleDateString()} {new Date(item.fechaHoraEjecucion).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </Text>
                      )}
                      {item.completada && item.fechaHoraCompletado && (
                        <Text style={[styles.interaccionEjecucion, { color: COLORES.activo, marginTop: 4 }]}>
                          ✅ Completada: {new Date(item.fechaHoraCompletado).toLocaleDateString()} {new Date(item.fechaHoraCompletado).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity 
                      style={styles.interaccionDeleteButton}
                      onPress={() => crearTareaDesdeTarea(item)}
                    >
                      <Ionicons name="copy-outline" size={20} color={COLORES.agua} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.interaccionDeleteButton}
                      onPress={() => eliminarTarea(index)}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORES.urgente} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              contentContainerStyle={styles.interaccionesListContent}
              ListEmptyComponent={
                <View style={styles.emptyInteraccionesState}>
                  <Ionicons name="checkbox-outline" size={48} color={COLORES.textoSuave} />
                  <Text style={styles.emptyInteraccionesText}>No hay tareas registradas</Text>
                </View>
              }
            />
          </SafeAreaView>
        </Modal>

        {/* Modal de menú de acciones de burbuja - Minimalista con iconos flotantes */}
        <Modal 
          animationType="fade" 
          transparent={true} 
          visible={menuVisible} 
          onRequestClose={cerrarMenu}
        >
          <TouchableOpacity 
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={cerrarMenu}
          >
            {contactoSeleccionado && (() => {
              const iconOffset = 80;
              const iconStyle = menuLado === 'right' ? { left: iconOffset } : { right: iconOffset };
              const translateXRange = menuLado === 'right' ? [-20, 0] : [20, 0];
              
              return (
                <View style={[styles.menuFloatingContainer, { left: menuPosition.x, top: menuPosition.y }]}>
                  {/* Línea conectora desde el centro hacia los iconos */}
                  <Animated.View
                    style={[
                      styles.menuConnector,
                      {
                        [menuLado === 'right' ? 'left' : 'right']: 0,
                        top: -68, // Centro vertical de los iconos
                        width: iconOffset,
                        opacity: menuAnimation.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 0, 0.25]
                        }),
                        transform: [
                          {
                            scaleX: menuAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 1]
                            })
                          }
                        ]
                      }
                    ]}
                  />
                  
                  {/* Punto central que conecta visualmente */}
                  <Animated.View
                    style={[
                      styles.menuCenterDot,
                      {
                        opacity: menuAnimation,
                        transform: [
                          {
                            scale: menuAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 1]
                            })
                          }
                        ]
                      }
                    ]}
                  />
                  
                  {/* Contenedor de iconos con fondo sutil */}
                  <Animated.View
                    style={[
                      styles.menuIconsGroup,
                      {
                        [menuLado === 'right' ? 'left' : 'right']: iconOffset,
                        opacity: menuAnimation,
                        transform: [
                          {
                            translateX: menuAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: translateXRange
                            })
                          }
                        ]
                      }
                    ]}
                  >
                    {/* Nombre del contacto */}
                    <Animated.View
                      style={[
                        styles.menuContactName,
                        {
                          opacity: menuAnimation.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [0, 0, 1]
                          })
                        }
                      ]}
                    >
                      <Text style={styles.menuContactNameText} numberOfLines={1}>
                        {contactoSeleccionado.nombre}
                      </Text>
                    </Animated.View>
                    
                    {/* Iconos en columna vertical */}
                    {/* Icono WhatsApp - Primero */}
                    <Animated.View
                      style={[
                        styles.menuFloatingIcon,
                        {
                          marginBottom: 12,
                          opacity: menuAnimation,
                          transform: [
                            {
                              scale: menuAnimation.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 1]
                              })
                            }
                          ]
                        }
                      ]}
                    >
                      <TouchableOpacity 
                        style={[styles.menuFloatingButton, { backgroundColor: COLORES.activo }]}
                        onPress={() => abrirWhatsApp(contactoSeleccionado)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="logo-whatsapp" size={24} color="white" />
                      </TouchableOpacity>
                    </Animated.View>

                    {/* Icono Llamar - Segundo */}
                    <Animated.View
                      style={[
                        styles.menuFloatingIcon,
                        {
                          marginBottom: 12,
                          opacity: menuAnimation,
                          transform: [
                            {
                              scale: menuAnimation.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 1]
                              })
                            }
                          ]
                        }
                      ]}
                    >
                      <TouchableOpacity 
                        style={[styles.menuFloatingButton, { backgroundColor: '#1976D2' }]}
                        onPress={() => llamarContacto(contactoSeleccionado)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="call" size={24} color="white" />
                      </TouchableOpacity>
                    </Animated.View>

                    {/* Icono Contacto - Tercero */}
                    <Animated.View
                      style={[
                        styles.menuFloatingIcon,
                        {
                          marginBottom: 12,
                          opacity: menuAnimation,
                          transform: [
                            {
                              scale: menuAnimation.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 1]
                              })
                            }
                          ]
                        }
                      ]}
                    >
                      <TouchableOpacity 
                        style={[styles.menuFloatingButton, { backgroundColor: COLORES.atencion }]}
                        onPress={() => abrirContacto(contactoSeleccionado)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="person" size={24} color="white" />
                      </TouchableOpacity>
                    </Animated.View>

                    {/* Icono Regar - Cuarto */}
                    <Animated.View
                      style={[
                        styles.menuFloatingIcon,
                        {
                          opacity: menuAnimation,
                          transform: [
                            {
                              scale: menuAnimation.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 1]
                              })
                            }
                          ]
                        }
                      ]}
                    >
                      <TouchableOpacity 
                        style={[styles.menuFloatingButton, { backgroundColor: COLORES.agua }]}
                        onPress={() => regarContacto(contactoSeleccionado)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="water" size={24} color="white" />
                      </TouchableOpacity>
                    </Animated.View>
                  </Animated.View>
                </View>
              );
            })()}
          </TouchableOpacity>
        </Modal>

        {/* Modal de importación */}
        <Modal animationType="slide" visible={modalSelectorVisible} onRequestClose={() => setModalSelectorVisible(false)}>
          <SafeAreaView style={styles.modalFull}>
            <View style={styles.modalHeaderImportar}>
              <Text style={styles.modalTitleImportar}>Importar 📒</Text>
              <TouchableOpacity onPress={() => setModalSelectorVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color={COLORES.agua} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchBarContainerModal}>
              <Ionicons name="search" size={20} color={COLORES.textoSuave} style={styles.searchIcon} />
              <TextInput 
                style={styles.searchInputModal} 
                placeholder="Buscar contacto..." 
                value={filtroAgenda} 
                onChangeText={setFiltroAgenda}
                placeholderTextColor={COLORES.textoSuave || '#8e8e93'}
              />
            </View>
            {cargando ? (
              <View style={styles.emptyModalState}>
                <ActivityIndicator size="large" color={COLORES.agua} />
                <Text style={styles.emptyModalText}>Cargando contactos...</Text>
              </View>
            ) : listaAgendaFiltrada.length === 0 ? (
              <View style={styles.emptyModalState}>
                <Ionicons name="search-outline" size={64} color={COLORES.textoSuave} />
                <Text style={styles.emptyModalText}>
                  {filtroAgenda ? 'No se encontraron contactos' : 'No hay contactos disponibles'}
                </Text>
                {agendaTelefonica.length > 0 && (
                  <Text style={[styles.emptyModalText, { marginTop: 8, fontSize: 12 }]}>
                    Total en agenda: {agendaTelefonica.length}
                  </Text>
                )}
              </View>
            ) : (
              <FlatList 
                data={listaAgendaFiltrada}
                keyExtractor={(item) => item.id || item.name + item.phoneNumbers?.[0]?.number}
                renderItem={({item, index}) => {
                  if (index === 0) {
                    console.log('🔍 Renderizando primer contacto:', JSON.stringify({
                      name: item.name,
                      phone: item.phoneNumbers?.[0]?.number,
                      id: item.id
                    }, null, 2));
                    console.log('🎨 COLORES disponibles:', {
                      texto: COLORES.texto,
                      textoSecundario: COLORES.textoSecundario
                    });
                  }
                  const yaImportado = estaImportado(item);
                  const nombreContacto = item.name || 'Sin nombre';
                  const telefonoContacto = item.phoneNumbers && item.phoneNumbers[0] ? item.phoneNumbers[0].number : 'Sin teléfono';
                  
                  // Debug: verificar que tenemos datos
                  if (index < 3) {
                    console.log(`📝 Contacto ${index}: nombre="${nombreContacto}", teléfono="${telefonoContacto}"`);
                  }
                  
                  return (
                    <TouchableOpacity 
                      style={[
                        styles.contactItem,
                        yaImportado && styles.contactItemImported
                      ]} 
                      onPress={() => !yaImportado && importarContacto(item)}
                      activeOpacity={yaImportado ? 1 : 0.7}
                      disabled={yaImportado}
                    >
                      <View style={[
                        styles.contactItemAvatar,
                        yaImportado && styles.contactItemAvatarImported
                      ]}>
                        <Text style={[
                          styles.contactItemAvatarText,
                          yaImportado && styles.contactItemAvatarTextImported
                        ]}>
                          {nombreContacto.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.contactItemInfo}>
                        <View style={styles.contactItemNameContainer}>
                          <Text 
                            style={[
                              styles.contactItemName,
                              yaImportado && styles.contactItemNameImported
                            ]} 
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {nombreContacto}
                          </Text>
                          {yaImportado && (
                            <View style={styles.importedBadge}>
                              <Ionicons name="checkmark-circle" size={16} color={COLORES.activo || '#4CAF50'} />
                              <Text style={styles.importedBadgeText}>Importado</Text>
                            </View>
                          )}
                        </View>
                        <Text 
                          style={[
                            styles.contactItemPhone,
                            yaImportado && styles.contactItemPhoneImported
                          ]} 
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {telefonoContacto}
                        </Text>
                      </View>
                      {yaImportado ? (
                        <Ionicons name="checkmark-circle" size={28} color={COLORES.activo || '#4CAF50'} style={styles.contactItemAddIcon} />
                      ) : (
                        <Ionicons name="add-circle" size={28} color={COLORES.activo || '#4CAF50'} style={styles.contactItemAddIcon} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                contentContainerStyle={styles.flatListContent}
                showsVerticalScrollIndicator={true}
                ListEmptyComponent={
                  <View style={styles.emptyModalState}>
                    <Ionicons name="people-outline" size={64} color={COLORES.textoSuave || '#8e8e93'} />
                    <Text style={styles.emptyModalText}>
                      {agendaTelefonica.length === 0 
                        ? 'No se encontraron contactos en tu agenda' 
                        : 'No hay contactos que coincidan con la búsqueda'}
                    </Text>
                  </View>
                }
              />
            )}
          </SafeAreaView>
        </Modal>

        <View style={styles.headerContainer}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.header}>Vínculos</Text>
              {pendingSyncCount > 0 && (
                <TouchableOpacity 
                  style={styles.pendingSyncIndicator}
                  onPress={async () => {
                    if (isOnline) {
                      await syncPendingChanges();
                      await cargarVinculos();
                    }
                  }}
                >
                  <Ionicons name="sync" size={16} color={COLORES.atencion} />
                  <Text style={styles.pendingSyncText}>{pendingSyncCount}</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.subheader}>Gestiona tus relaciones importantes</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.contadorContainer}>
              {/* Icono offline si no hay conexión */}
              {!isOnline && (
                <Ionicons name="cloud-offline-outline" size={18} color={COLORES.urgente} style={{ marginRight: 4 }} />
              )}
              {/* Indicador PC / Nube según ambiente */}
              <View style={styles.sourceBadge}>
                <Ionicons name={API_SOURCE_ICON} size={14} color={COLORES.textoSuave} />
                <Text style={styles.sourceBadgeText}>{API_SOURCE_LABEL}</Text>
              </View>
              <Ionicons name="person" size={24} color={COLORES.textoSuave} />
              <Text style={styles.contador}>{vinculos.length}</Text>
            </View>
            <NotificationBell />
          </View>
        </View>
        
        {/* Leyenda mejorada con contadores */}
        {(() => {
          const contadores = vinculos.reduce((acc, contacto) => {
            const degradacion = calcularDegradacion(contacto);
            const color = obtenerColorDegradacion(degradacion.nivel);
            if (color === COLORES.activo) acc.activo++;
            else if (color === COLORES.atencion) acc.atencion++;
            else if (color === COLORES.urgente) acc.urgente++;
            return acc;
          }, { activo: 0, atencion: 0, urgente: 0 });
          
          return (
            <View style={[styles.leyenda, { zIndex: 1 }]}>
              <View style={styles.leyendaItem}>
                <View style={[styles.leyendaCirculo, { backgroundColor: COLORES.activo }]}>
                  <Text style={styles.leyendaNumero}>{contadores.activo}</Text>
                </View>
                <Text style={styles.leyendaTexto}>Activo</Text>
              </View>
              <View style={styles.leyendaItem}>
                <View style={[styles.leyendaCirculo, { backgroundColor: COLORES.atencion }]}>
                  <Text style={styles.leyendaNumero}>{contadores.atencion}</Text>
                </View>
                <Text style={styles.leyendaTexto}>Requiere atención</Text>
              </View>
              <View style={styles.leyendaItem}>
                <View style={[styles.leyendaCirculo, { backgroundColor: COLORES.urgente }]}>
                  <Text style={styles.leyendaNumero}>{contadores.urgente}</Text>
                </View>
                <Text style={styles.leyendaTexto}>Urgente</Text>
              </View>
            </View>
          );
        })()}

        <FlatList
          data={[...vinculos].sort((a, b) => {
            // Ordenar por nivel de degradación ascendente (los más activos arriba, los que necesitan atención abajo)
            const degradacionA = calcularDegradacion(a);
            const degradacionB = calcularDegradacion(b);
            return degradacionA.nivel - degradacionB.nivel;
          })}
          renderItem={renderBurbuja}
          keyExtractor={(item, index) => (item._id || item.telefono || index).toString()}
          numColumns={3}
          contentContainerStyle={styles.grid}
          onRefresh={cargarVinculos}
          refreshing={false}
          showsVerticalScrollIndicator={false}
          style={{ zIndex: 1 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={80} color={COLORES.textoSuave} />
              <Text style={styles.emptyText}>No hay vínculos para mostrar</Text>
              <Text style={styles.emptySubtext}>Toca el botón para descubrir contactos</Text>
            </View>
          }
        />

        {/* Botón flotante - Micrófono (voz → preview → tarea o interacción) */}
        <TouchableOpacity 
          style={[styles.floatingButtonPremium, (voiceRecording || sendingVoice) && { opacity: 0.95 }]}
          onPress={async () => {
            if (sendingVoice) return;
            if (voiceRecording) {
              const { uri, error: stopErr } = await stopRecording(voiceRecording);
              setVoiceRecording(null);
              if (stopErr || !uri) {
                Alert.alert('Grabación', stopErr || 'No se obtuvo el audio.');
                return;
              }
              await new Promise((r) => setTimeout(r, 250));
              setVoicePreviewAudioUri(uri);
              setVoicePreviewData(null);
              setVoicePreviewTempId(null);
              setSendingVoice(true);
              console.log('[VinculosScreen] Llamando uploadVoiceTemp con uri:', uri ? uri.substring(0, 60) + '...' : 'null');
              const upload = await uploadVoiceTemp(uri);
              console.log('[VinculosScreen] uploadVoiceTemp resultado:', upload.success ? { tempId: upload.tempId } : { error: upload.error, status: upload.status });
              setSendingVoice(false);
              if (!upload.success) {
                Alert.alert('Subir nota', upload.error || 'No se pudo subir la nota.');
                return;
              }
              setVoicePreviewTempId(upload.tempId);
              setModalVoicePreviewVisible(true);
              return;
            }
            const { recording, error: startErr } = await startRecording();
            if (startErr) {
              Alert.alert('Micrófono', startErr);
              return;
            }
            setVoiceRecording(recording);
          }}
          activeOpacity={0.8}
          disabled={sendingVoice}
        >
          <View style={styles.floatingButtonPremiumInner}>
            {sendingVoice ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name={voiceRecording ? 'stop' : 'mic'} size={24} color="white" />
                <Ionicons name="star" size={12} color="#FFD700" style={{ position: 'absolute', top: -2, right: -2 }} />
              </>
            )}
          </View>
        </TouchableOpacity>

        {/* Modal Preview nota de voz: elegir guardar como tarea o interacción */}
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
                    <Text style={styles.modalVoicePreviewLabel}>Dijiste:</Text>
                    <Text style={styles.modalVoicePreviewText}>{voicePreviewData.texto || '—'}</Text>
                    <Text style={styles.modalVoicePreviewLabel}>Contacto:</Text>
                    <Text style={styles.modalVoicePreviewText}>{voicePreviewData.contactoNombre || voicePreviewData.vinculo || 'Sin asignar'}</Text>
                    <Text style={styles.modalVoicePreviewLabel}>Tarea extraída:</Text>
                    <Text style={styles.modalVoicePreviewText}>{voicePreviewData.tarea || '—'}</Text>
                    <Text style={styles.modalVoicePreviewLabel}>Fecha:</Text>
                    <Text style={styles.modalVoicePreviewText}>{voicePreviewData.fecha || '—'}</Text>
                  </>
                )}
              </ScrollView>
              <View style={styles.modalVoicePreviewActions}>
                {voicePreviewData && (
                <>
                <TouchableOpacity
                  style={[styles.modalVoicePreviewButton, styles.modalVoicePreviewButtonTask]}
                  onPress={async () => {
                    if (!voicePreviewData || !voicePreviewData.contactoId) {
                      Alert.alert('Aviso', 'No hay contacto asignado. Añade contactos para guardar como tarea.');
                      return;
                    }
                    const contact = vinculos.find(c => c._id === voicePreviewData.contactoId);
                    if (!contact) {
                      Alert.alert('Error', 'Contacto no encontrado. Actualiza la lista.');
                      return;
                    }
                    const fechaEjecucion = new Date(voicePreviewData.fecha);
                    if (isNaN(fechaEjecucion.getTime())) fechaEjecucion.setTime(Date.now());
                    const newTask = {
                      fechaHoraCreacion: new Date(),
                      descripcion: voicePreviewData.tarea,
                      fechaHoraEjecucion: fechaEjecucion,
                      clasificacion: 'Otro',
                      completada: false
                    };
                    const updatedTareas = [...(contact.tareas || []), newTask];
                    await updateContactTareas(voicePreviewData.contactoId, updatedTareas);
                    if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                    cargarVinculos();
                    setModalVoicePreviewVisible(false);
                    setVoicePreviewData(null);
                    setVoicePreviewAudioUri(null);
                    setVoicePreviewTempId(null);
                    setVoicePreviewTranscription(null);
                    setVoiceTranscribing(false);
                    Alert.alert('Listo', 'Tarea guardada.');
                  }}
                >
                  <Ionicons name="checkmark-done-outline" size={22} color="white" />
                  <Text style={styles.modalVoicePreviewButtonText}>Guardar como tarea</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalVoicePreviewButton, styles.modalVoicePreviewButtonInteraction]}
                  onPress={async () => {
                    if (!voicePreviewData || !voicePreviewData.contactoId) {
                      Alert.alert('Aviso', 'No hay contacto asignado. Añade contactos para guardar como interacción.');
                      return;
                    }
                    const contact = vinculos.find(c => c._id === voicePreviewData.contactoId);
                    if (!contact) {
                      Alert.alert('Error', 'Contacto no encontrado. Actualiza la lista.');
                      return;
                    }
                    const newInteraction = {
                      fechaHora: new Date(),
                      descripcion: voicePreviewData.descripcion || voicePreviewData.tarea
                    };
                    const updatedInteracciones = [...(contact.interacciones || []), newInteraction];
                    await updateContactInteracciones(voicePreviewData.contactoId, updatedInteracciones);
                    if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                    cargarVinculos();
                    setModalVoicePreviewVisible(false);
                    setVoicePreviewData(null);
                    setVoicePreviewAudioUri(null);
                    setVoicePreviewTempId(null);
                    setVoicePreviewTranscription(null);
                    setVoiceTranscribing(false);
                    Alert.alert('Listo', 'Interacción guardada.');
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={22} color="white" />
                  <Text style={styles.modalVoicePreviewButtonText}>Guardar como interacción</Text>
                </TouchableOpacity>
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
                  <Text style={styles.modalVoicePreviewCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </>
                )}
                {!voicePreviewData && voicePreviewAudioUri && (
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
                  <Text style={styles.modalVoicePreviewCancelText}>Cerrar</Text>
                </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>

        {/* Botón flotante Regar - Agregar interacción (elegir contacto → formulario) */}
        <TouchableOpacity
          style={styles.floatingButtonRegar}
          onPress={abrirModalRegar}
          activeOpacity={0.8}
          accessibilityLabel="Regar contacto - Agregar interacción"
        >
          <View style={styles.floatingButtonRegarInner}>
            <Ionicons name="water" size={26} color="white" />
          </View>
        </TouchableOpacity>

        {/* Botón flotante para modo swipe */}
        <Animated.View
          style={[
            styles.floatingButton,
            {
              transform: [{ scale: pulseAnimation }],
            }
          ]}
        >
          <TouchableOpacity 
            style={styles.floatingButtonInner}
            onPress={activarModoJuego}
            activeOpacity={0.8}
          >
            <Ionicons name="swap-horizontal" size={24} color="white" />
          </TouchableOpacity>
        </Animated.View>

        {/* Modal de foto a pantalla completa */}
        <Modal
          visible={modalFotoFullscreen}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setModalFotoFullscreen(false)}
        >
          <SafeAreaView style={styles.modalFotoFullscreen}>
            <TouchableOpacity 
              style={styles.modalFotoCloseButton}
              onPress={() => setModalFotoFullscreen(false)}
            >
              <Ionicons name="close" size={32} color="white" />
            </TouchableOpacity>
            {datosEditados.foto && (
              <Image 
                source={{ uri: datosEditados.foto }} 
                style={styles.fotoFullscreen}
                resizeMode="contain"
              />
            )}
          </SafeAreaView>
        </Modal>

        {/* Modal Regar: elegir contacto → agregar interacción */}
        <Modal
          visible={modalRegarVisible}
          animationType="slide"
          transparent
          onRequestClose={cerrarModalRegar}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalRegarContent}>
              <View style={styles.modalRegarHeader}>
                {pasoRegar === 'formulario' ? (
                  <TouchableOpacity onPress={volverASelectorContactoRegar} style={styles.modalRegarBack}>
                    <Ionicons name="arrow-back" size={24} color={COLORES.agua} />
                    <Text style={styles.modalRegarBackText}>Contactos</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.modalRegarTitle}>Regar un contacto</Text>
                )}
                <TouchableOpacity onPress={cerrarModalRegar}>
                  <Ionicons name="close" size={24} color={COLORES.texto} />
                </TouchableOpacity>
              </View>

              {pasoRegar === 'contacto' && (
                <View style={styles.modalRegarBody}>
                  <Text style={styles.modalRegarSubtitle}>¿A quién quieres regar? Elige un contacto para agregar una interacción.</Text>
                  {vinculos.length === 0 ? (
                    <View style={styles.modalRegarEmpty}>
                      <Ionicons name="people-outline" size={48} color={COLORES.textoSuave} />
                      <Text style={styles.modalRegarEmptyText}>No hay contactos</Text>
                      <Text style={styles.modalRegarEmptyHint}>Importa contactos para poder regarlos.</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={vinculos}
                      keyExtractor={(c) => c._id || c.telefono}
                      style={styles.modalRegarList}
                      contentContainerStyle={styles.modalRegarListContent}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.modalRegarContactoRow}
                          onPress={() => seleccionarContactoParaRegar(item)}
                          activeOpacity={0.7}
                        >
                          {item.foto && item.foto.length > 20 ? (
                            <Image source={{ uri: item.foto }} style={styles.modalRegarAvatar} />
                          ) : (
                            <View style={styles.modalRegarAvatarPlaceholder}>
                              <Ionicons name="person" size={24} color={COLORES.textoSecundario} />
                            </View>
                          )}
                          <View style={styles.modalRegarContactoInfo}>
                            <Text style={styles.modalRegarContactoNombre}>{item.nombre}</Text>
                            {item.telefono ? (
                              <Text style={styles.modalRegarContactoTelefono}>{item.telefono}</Text>
                            ) : null}
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={COLORES.textoSuave} />
                        </TouchableOpacity>
                      )}
                    />
                  )}
                </View>
              )}

              {pasoRegar === 'formulario' && contactoSeleccionadoParaRegar && (
                <>
                  <View style={styles.modalRegarParaQuien}>
                    {contactoSeleccionadoParaRegar.foto && contactoSeleccionadoParaRegar.foto.length > 20 ? (
                      <Image source={{ uri: contactoSeleccionadoParaRegar.foto }} style={styles.modalRegarAvatar} />
                    ) : (
                      <View style={styles.modalRegarAvatarPlaceholder}>
                        <Ionicons name="person" size={24} color={COLORES.textoSecundario} />
                      </View>
                    )}
                    <Text style={styles.modalRegarParaQuienNombre}>{contactoSeleccionadoParaRegar.nombre}</Text>
                  </View>
                  <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <View style={styles.modalRegarForm}>
                      <Text style={styles.modalRegarLabel}>Nueva interacción</Text>
                      <TextInput
                        style={styles.inputNuevaInteraccion}
                        value={textoInteraccionRegar}
                        onChangeText={setTextoInteraccionRegar}
                        placeholder="Describe lo más importante de esta interacción..."
                        placeholderTextColor={COLORES.textoSuave}
                        multiline
                      />
                      <View style={styles.interaccionOptionsRow}>
                        <TouchableOpacity
                          style={styles.interaccionFechaButton}
                          onPress={() => { setDateModeRegar('date'); setShowDatePickerRegar(true); }}
                        >
                          <Ionicons name="calendar" size={16} color={COLORES.agua} />
                          <Text style={styles.interaccionFechaButtonText}>
                            {fechaHoraInteraccionRegar ? `${fechaHoraInteraccionRegar.toLocaleDateString('es-ES')} ${fechaHoraInteraccionRegar.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Fecha/Hora'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {showDatePickerRegar && (
                        <DateTimePicker
                          value={fechaHoraInteraccionRegar}
                          mode={dateModeRegar}
                          is24Hour
                          display="default"
                          onChange={(e, d) => {
                            if (e.type === 'dismissed') { setShowDatePickerRegar(false); return; }
                            const curr = d || new Date();
                            if (dateModeRegar === 'date') {
                              setFechaHoraInteraccionRegar(curr);
                              if (Platform.OS === 'android') {
                                setShowDatePickerRegar(false);
                                setTimeout(() => { setDateModeRegar('time'); setShowDatePickerRegar(true); }, 100);
                              } else {
                                setDateModeRegar('time');
                              }
                            } else {
                              setFechaHoraInteraccionRegar(curr);
                              setShowDatePickerRegar(false);
                            }
                          }}
                        />
                      )}
                      <Text style={[styles.modalRegarLabel, { fontSize: 10, color: COLORES.textoSuave, marginTop: 4 }]}>
                        Las interacciones son historial permanente
                      </Text>
                      <TouchableOpacity
                        style={[styles.addInteraccionButton, !textoInteraccionRegar.trim() && styles.addInteraccionButtonDisabled]}
                        onPress={guardarNuevaInteraccionRegar}
                        disabled={!textoInteraccionRegar.trim()}
                      >
                        <Ionicons name="water" size={18} color="white" />
                        <Text style={styles.addInteraccionButtonText}>Regar - Agregar interacción</Text>
                      </TouchableOpacity>
                    </View>
                  </KeyboardAvoidingView>
                </>
              )}
            </View>
          </View>
        </Modal>
        </View>
      </GestureHandlerRootView>
    </SafeAreaView>
  );
}

// Componente de fondo decorativo
const FondoDecorativo = () => {
  const animaciones = useRef([]);
  
  useEffect(() => {
    // Crear animaciones para los círculos decorativos
    animaciones.current = Array.from({ length: 8 }, () => ({
      scale: new Animated.Value(1),
      opacity: new Animated.Value(0.2),
    }));
    
    animaciones.current.forEach((anim, index) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 200),
          Animated.parallel([
            Animated.timing(anim.scale, {
              toValue: 1.15,
              duration: 4000 + Math.random() * 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(anim.opacity, {
              toValue: 0.4,
              duration: 4000 + Math.random() * 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(anim.scale, {
              toValue: 1,
              duration: 4000 + Math.random() * 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(anim.opacity, {
              toValue: 0.2,
              duration: 4000 + Math.random() * 2000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    });
  }, []);
  
  const posiciones = [
    { top: '10%', left: '5%', size: 100, color: COLORES.decoracion },
    { top: '20%', right: '8%', size: 70, color: COLORES.decoracion },
    { top: '50%', left: '3%', size: 85, color: COLORES.decoracion },
    { top: '60%', right: '5%', size: 75, color: COLORES.decoracion },
    { top: '75%', left: '10%', size: 60, color: COLORES.decoracion },
    { top: '85%', right: '12%', size: 90, color: COLORES.decoracion },
    { top: '30%', left: '15%', size: 50, color: COLORES.decoracion },
    { top: '40%', right: '15%', size: 70, color: COLORES.decoracion },
  ];
  
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 0 }]} pointerEvents="none">
      {/* Fondo base */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORES.fondo }]} />
      
      {/* Círculos decorativos animados */}
      {posiciones.map((pos, index) => {
        const anim = animaciones.current[index];
        if (!anim) return null;
        
        return (
          <Animated.View
            key={index}
            style={[
              {
                position: 'absolute',
                width: pos.size,
                height: pos.size,
                borderRadius: pos.size / 2,
                backgroundColor: pos.color,
                top: pos.top,
                left: pos.left,
                right: pos.right,
                transform: [{ scale: anim.scale }],
                opacity: anim.opacity,
              }
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORES.fondo,
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORES.fondo,
  },
  pendingSyncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES.atencionClaro || '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginLeft: 8,
  },
  pendingSyncText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORES.atencion,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificacionesButton: {
    position: 'relative',
    padding: 8,
  },
  notificacionesBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: COLORES.urgente,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificacionesBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalNotificacionesScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  notificacionesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  notificacionesSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
  },
  notificacionesSectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    backgroundColor: COLORES.fondoSecundario,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
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
  notificacionItemVista: {
    opacity: 0.6,
  },
  notificacionLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  notificacionIcono: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  notificacionTituloVista: {
    color: COLORES.textoSecundario,
  },
  notificacionDescripcion: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    marginBottom: 4,
    lineHeight: 20,
  },
  notificacionDescripcionVista: {
    color: COLORES.textoSuave,
  },
  notificacionContacto: {
    fontSize: 12,
    color: COLORES.textoSecundario,
    fontWeight: '500',
  },
  notificacionContactoVista: {
    color: COLORES.textoSuave,
  },
  notificacionDeleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalActionButton: {
    padding: 4,
  },
  header: {
    fontSize: 34,
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
  contadorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contador: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORES.texto,
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
  leyenda: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORES.fondoSecundario,
    marginHorizontal: 20,
    borderRadius: 16,
  },
  leyendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  leyendaCirculo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leyendaNumero: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  leyendaTexto: {
    fontSize: 11,
    color: COLORES.texto,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  grid: {
    paddingHorizontal: 15,
    paddingBottom: 100,
    paddingTop: 8,
  },
  burbujaContainer: {
    width: BUBBLE_SIZE,
    margin: 6,
    alignItems: 'center',
    overflow: 'visible',
  },
  burbujaTouchable: {
    width: '100%',
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  burbujaWrapper: {
    width: BUBBLE_SIZE_INNER,
    height: BUBBLE_SIZE_INNER,
    position: 'relative',
    overflow: 'visible',
  },
  burbuja: {
    width: BUBBLE_SIZE_INNER,
    height: BUBBLE_SIZE_INNER,
    borderRadius: BUBBLE_RADIUS,
    backgroundColor: COLORES.burbujaFondo,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORES.sombra,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  burbujaGradiente: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(212, 165, 116, 0.05)',
  },
  burbujaImagenContainer: {
    width: BUBBLE_SIZE_IMAGE,
    height: BUBBLE_SIZE_IMAGE,
    borderRadius: BUBBLE_RADIUS_IMAGE,
    overflow: 'hidden',
    position: 'relative',
  },
  burbujaImagen: {
    width: '100%',
    height: '100%',
    borderRadius: BUBBLE_RADIUS_IMAGE,
  },
  burbujaInicial: {
    width: BUBBLE_SIZE_IMAGE,
    height: BUBBLE_SIZE_IMAGE,
    borderRadius: BUBBLE_RADIUS_IMAGE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  burbujaInicialTexto: {
    fontSize: BUBBLE_FONT_SIZE,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  burbujaNombre: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: BUBBLE_SIZE,
    letterSpacing: 0.2,
    opacity: 1,
    color: COLORES.texto,
  },
  badgeTarea: {
    position: 'absolute',
    top: -BADGE_OFFSET,
    left: -BADGE_OFFSET,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORES.burbujaFondo,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    shadowColor: COLORES.atencion,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  badgePrioridad: {
    position: 'absolute',
    bottom: -BADGE_OFFSET,
    right: -BADGE_OFFSET,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORES.burbujaFondo,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    shadowColor: COLORES.urgente,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  badgeRegar: {
    position: 'absolute',
    top: -BADGE_OFFSET,
    right: -BADGE_OFFSET,
    backgroundColor: COLORES.burbujaFondo,
    borderRadius: 18,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORES.agua,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2.5,
    borderColor: COLORES.agua,
    zIndex: 10,
  },
  degradacionBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    shadowColor: COLORES.sombra,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  degradacionTexto: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
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
  // Estilos del modo swipe/descubrir
  gameContainer: {
    flex: 1,
    backgroundColor: COLORES.urgente,
    paddingTop: 40,
    alignItems: 'center',
  },
  gameHeader: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 10,
    height: 40,
  },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exitText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: 'white',
    marginLeft: 5,
  },
  gameTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
    textAlign: 'center',
  },
  cardArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  bottomButtonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 20,
    paddingTop: 10,
  },
  card: {
    width: SCREEN_WIDTH * 0.88,
    height: '75%',
    backgroundColor: 'white',
    borderRadius: 30,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
  },
  cardInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardImage: {
    width: 180,
    height: 180,
    borderRadius: 90,
    marginBottom: 40,
  },
  initial: {
    fontSize: 90,
    fontWeight: 'bold',
    color: '#ECF0F1',
    marginBottom: 20,
  },
  name: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: COLORES.texto,
  },
  number: {
    fontSize: 20,
    color: COLORES.textoSuave,
  },
  buttonsOverlay: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    width: '100%',
    marginTop: -40,
    zIndex: 10,
  },
  controlBtn: {
    width: 75,
    height: 75,
    borderRadius: 40,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width:0, height:4},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    borderWidth: 2,
  },
  btnNo: {
    borderColor: COLORES.urgente,
  },
  btnYes: {
    borderColor: COLORES.activo,
  },
  btnUndo: {
    borderColor: COLORES.atencion,
  },
  // Estilos de modales
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORES.burbujaFondo,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    height: '90%',
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORES.texto,
  },
  barraAtencionContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 8,
  },
  barraAtencion: {
    width: 8,
    height: 100,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORES.burbujaBorde || '#E0E0E0',
  },
  barraAtencionFondo: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    flexDirection: 'column-reverse', // Invertir para que rojo esté abajo
  },
  barraAtencionSegmento: {
    width: '100%',
  },
  barraAtencionFill: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    borderRadius: 4,
    opacity: 0.9,
  },
  barraAtencionPorcentaje: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  modalFull: {
    flex: 1,
    backgroundColor: COLORES.fondoSecundario || '#F5F7FA',
  },
  modalInteraccionesContainer: {
    width: '95%',
    maxWidth: SCREEN_WIDTH * 0.95,
    flex: 1,
    backgroundColor: COLORES.fondoSecundario,
  },
  modalHeaderImportar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  modalTitleImportar: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORES.texto,
  },
  modalCloseButton: {
    padding: 4,
  },
  searchBarContainerModal: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInputModal: {
    flex: 1,
    fontSize: 16,
    color: COLORES.texto,
    padding: 0,
  },
  contactItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 70, // Altura mínima para asegurar espacio
  },
  contactItemImported: {
    opacity: 0.6,
    backgroundColor: COLORES.fondoSecundario,
  },
  contactItemAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E1E8ED',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0, // Evita que el avatar se comprima
  },
  contactItemAvatarImported: {
    backgroundColor: COLORES.activoClaro,
  },
  contactItemAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#7F8C8D',
    textAlign: 'center',
  },
  contactItemAvatarTextImported: {
    color: '#4CAF50',
  },
  contactItemInfo: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0, // Permite que el texto se ajuste correctamente
  },
  contactItemNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  contactItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50', // Color explícito para asegurar visibilidad
    flexShrink: 1,
  },
  contactItemNameImported: {
    color: '#95A5A6',
    textDecorationLine: 'line-through',
  },
  contactItemPhone: {
    fontSize: 14,
    color: '#5A6C7D', // Color explícito para asegurar visibilidad
  },
  contactItemPhoneImported: {
    color: '#BDC3C7',
  },
  contactItemAddIcon: {
    marginLeft: 12,
    flexShrink: 0, // Evita que el icono se comprima
  },
  flatListContent: {
    paddingTop: 8,
    paddingBottom: 20,
  },
  emptyModalState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyModalText: {
    fontSize: 16,
    color: '#7F8C8D',
    marginTop: 16,
    textAlign: 'center',
  },
  importedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: COLORES.activoClaro,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  importedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 4,
  },
  photoWithBarContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 15,
    gap: 12,
  },
  photoContainer: {
    alignItems: 'center',
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORES.texto,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  modalFotoFullscreen: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalFotoCloseButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    padding: 8,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fotoFullscreen: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  photoLabel: {
    color: COLORES.agua,
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  inputName: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
    color: COLORES.texto,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5,
  },
  phoneDisplay: {
    fontSize: 16,
    color: COLORES.textoSuave,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORES.texto,
    marginBottom: 8,
  },
  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputDate: {
    backgroundColor: COLORES.fondoSecundario,
    borderRadius: 12,
    padding: 12,
    textAlign: 'center',
    fontSize: 16,
    flex: 1,
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde,
  },
  inputDateRequired: {
    borderColor: COLORES.urgente,
    borderWidth: 2,
    backgroundColor: COLORES.urgenteClaro,
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: COLORES.urgenteClaro,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  warningText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORES.urgente,
    marginLeft: 4,
  },
  warningMessage: {
    fontSize: 12,
    color: COLORES.urgente,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  slash: {
    fontSize: 20,
    color: '#BDC3C7',
    marginHorizontal: 10,
  },
  taskSection: {
    backgroundColor: COLORES.fondoSecundario,
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde,
  },
  inputTask: {
    fontSize: 15,
    color: COLORES.texto,
    minHeight: 40,
    marginTop: 5,
    textAlignVertical: 'top',
  },
  dateBtn: {
    flexDirection:'row',
    backgroundColor: COLORES.agua,
    paddingHorizontal:10,
    paddingVertical:5,
    borderRadius:12,
    alignItems:'center',
  },
  dateBtnText: {
    color:'white',
    fontWeight:'600',
    fontSize:12,
    marginLeft:5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSuave,
    marginBottom: 8,
    marginTop: 10,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: 'white',
  },
  chipText: {
    color: '#7F8C8D',
    fontWeight: '600',
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: COLORES.texto,
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    elevation: 4,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Indicador de grabación y modal preview de voz
  recordingBarWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
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
  // Botón flotante
  floatingButton: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
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
  floatingButtonRegar: {
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
  floatingButtonRegarInner: {
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
  floatingButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORES.urgente, // Rojo urgente
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORES.urgente,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  floatingButtonImport: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES.saludable,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingButtonImportText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  // Estilos para modal de interacciones
  iconosAccionContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  iconoAccion: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORES.agua,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  iconoBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORES.urgente,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'white',
  },
  iconoBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  nuevaInteraccionContainer: {
    backgroundColor: 'white',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  inputNuevaInteraccion: {
    backgroundColor: COLORES.fondoSecundario,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: COLORES.texto,
    minHeight: 56,
    maxHeight: 100,
    marginBottom: 12,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde,
  },
  premiumButton: {
    borderWidth: 1.5,
    borderColor: COLORES.agua,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(135, 206, 250, 0.1)',
  },
  premiumButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumButtonText: {
    color: COLORES.agua,
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 3,
    letterSpacing: 0.3,
  },
  interaccionOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  interaccionFechaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: COLORES.fondoSecundario,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde,
  },
  interaccionFechaButtonTarea: {
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  interaccionFechaButtonIconWrap: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  interaccionFechaButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7F8C8D',
    marginLeft: 0,
    marginTop: 2,
  },
  interaccionFechaButtonHint: {
    fontSize: 11,
    color: COLORES.textoSuave,
    marginTop: 0,
    marginLeft: 0,
  },
  toggleTareaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES.fondoSecundario,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde,
    marginBottom: 12,
  },
  toggleTareaButtonActive: {
    backgroundColor: COLORES.activoClaro,
    borderColor: COLORES.activo,
  },
  toggleTareaText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#7F8C8D',
    marginLeft: 8,
  },
  toggleTareaTextActive: {
    color: COLORES.activo,
    fontWeight: '600',
  },
  addInteraccionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORES.activo,
    padding: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  addInteraccionButtonDisabled: {
    backgroundColor: COLORES.textoSuave,
    opacity: 0.6,
  },
  addInteraccionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  interaccionesListContent: {
    padding: 20,
    paddingBottom: 40,
  },
  interaccionItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  interaccionEditButton: {
    padding: 8,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  interaccionItemCompletada: {
    opacity: 0.6,
    backgroundColor: COLORES.fondoSecundario,
  },
  interaccionCheckbox: {
    marginRight: 12,
  },
  interaccionContent: {
    flex: 1,
  },
  interaccionTexto: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORES.texto,
    marginBottom: 6,
  },
  interaccionTextoCompletada: {
    textDecorationLine: 'line-through',
    color: '#95A5A6',
  },
  interaccionMeta: {
    flexDirection: 'column',
    gap: 4,
  },
  interaccionFecha: {
    fontSize: 12,
    color: '#7F8C8D',
  },
  interaccionClasificacionBadge: {
    backgroundColor: COLORES.activoClaro,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  interaccionClasificacionText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORES.activo,
  },
  interaccionEjecucion: {
    fontSize: 12,
    color: COLORES.atencion,
    fontWeight: '500',
    marginTop: 4,
  },
  interaccionDeleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  emptyInteraccionesState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyInteraccionesText: {
    fontSize: 16,
    color: '#7F8C8D',
    marginTop: 16,
    textAlign: 'center',
  },
  // Modal Editar interacción
  modalEditarInteraccionContent: {
    backgroundColor: COLORES.fondo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    maxHeight: '85%',
    minHeight: 280,
  },
  modalEditarInteraccionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  modalEditarInteraccionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORES.texto,
  },
  modalEditarInteraccionBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: 360,
  },
  modalEditarInteraccionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.texto,
    marginBottom: 8,
    marginTop: 12,
  },
  modalEditarInteraccionFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORES.fondoSecundario,
  },
  modalEditarInteraccionCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalEditarInteraccionCancelText: {
    fontSize: 16,
    color: COLORES.textoSecundario,
  },
  modalEditarInteraccionSaveButton: {
    backgroundColor: COLORES.agua,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  modalEditarInteraccionSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  // Modal Regar: elegir contacto → agregar interacción
  modalRegarContent: {
    backgroundColor: COLORES.fondo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    height: '90%',
    maxHeight: '90%',
    minHeight: 320,
  },
  modalRegarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  modalRegarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORES.texto,
  },
  modalRegarBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalRegarBackText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.agua,
  },
  modalRegarBody: {
    flex: 1,
  },
  modalRegarSubtitle: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  modalRegarList: {
    flex: 1,
  },
  modalRegarListContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  modalRegarContactoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
    gap: 12,
  },
  modalRegarAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  modalRegarAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORES.fondoSecundario,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRegarContactoInfo: {
    flex: 1,
  },
  modalRegarContactoNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
  },
  modalRegarContactoTelefono: {
    fontSize: 13,
    color: COLORES.textoSecundario,
    marginTop: 2,
  },
  modalRegarEmpty: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  modalRegarEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
  },
  modalRegarEmptyHint: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    textAlign: 'center',
  },
  modalRegarParaQuien: {
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
  modalRegarParaQuienNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
  },
  modalRegarForm: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  modalRegarLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.texto,
    marginBottom: 8,
  },
  // Estilos para menú de acciones
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuFloatingContainer: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuConnector: {
    position: 'absolute',
    height: 1.5,
    backgroundColor: COLORES.textoSuave,
    borderRadius: 1,
  },
  menuCenterDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORES.texto,
    opacity: 0.3,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  menuIconsGroup: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 10,
    shadowColor: COLORES.texto,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    minWidth: 76,
    borderWidth: 1,
    borderColor: 'rgba(58, 58, 58, 0.08)',
  },
  menuContactName: {
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  menuContactNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORES.texto,
    textAlign: 'center',
  },
  menuFloatingIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuFloatingButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});
