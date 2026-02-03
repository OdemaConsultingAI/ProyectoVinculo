import React, { useEffect, useState, useRef, useMemo, useCallback, useContext } from 'react';
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
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { COLORES } from '../constants/colores';
import { API_URL, fetchWithAuth } from '../constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  loadContacts, 
  loadContactsFromCache,
  createContact, 
  updateContact, 
  deleteContact,
  getConnectionStatus,
  getPendingSyncCount,
  syncPendingChanges,
  saveContactsToCache,
  updateContactInteracciones,
  updateContactTareas,
  saveInteractionFromVoice,
  saveTaskFromVoice
} from '../services/syncService';
import NetInfo from '@react-native-community/netinfo';
import { validatePhone, validateBirthday, validateName, sanitizeText } from '../utils/validations';
import { formatTime12h } from '../utils/dateTime';
import { playFromBase64, startRecording } from '../services/voiceToTaskService';
import HuellasModalContacto from '../components/HuellasModalContacto';
import AtencionesModalContacto from '../components/AtencionesModalContacto';
import { useVoiceGlobal } from '../context/VoiceGlobalContext';
import { AyudaContext } from '../context/AyudaContext';
import NotificationBell from '../components/NotificationBell';
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
// Padding horizontal del grid (más aire a izquierda y derecha para que no se vean pegadas las burbujas)
const GRID_PADDING_H = 56;
const GRID_ROW_PADDING_H = 6;
const BUBBLE_MARGIN_H = 6;
// Tamaño de burbuja para que quepan 3 por fila: (ancho - padding grid - padding row - márgenes entre burbujas) / 3
const BUBBLE_SIZE = Math.max(100, (SCREEN_WIDTH - 2 * GRID_PADDING_H - 2 * GRID_ROW_PADDING_H - 6 * BUBBLE_MARGIN_H) / 3);
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

// Convierte URI file:// (expo-contacts) a data URI base64 para que las fotos persistan en APK/release
async function fileUriToBase64DataUri(uri) {
  if (!uri || typeof uri !== 'string' || !uri.startsWith('file://')) return uri;
  try {
    const FileSystem = require('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    console.warn('No se pudo convertir foto a base64:', e);
    return uri;
  }
}

export default function VinculosScreen() {
  const route = useRoute();
  const navigation = useNavigation();
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
  
  const { setVoicePreviewContactoFromModal, setCurrentContactForVoice, setVoiceRecording } = useVoiceGlobal();
  const ayudaCtx = useContext(AyudaContext);
  const openAyuda = ayudaCtx?.openAyuda ?? (() => {});
  const inputNuevaInteraccionRef = useRef(null);
  // Estados para modal de interacciones (historial, se pueden editar)
  const [modalInteraccionesVisible, setModalInteraccionesVisible] = useState(false);
  const [modalHuellasContactoVisible, setModalHuellasContactoVisible] = useState(false);
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
  const [modalAgregarInteraccionVisible, setModalAgregarInteraccionVisible] = useState(false); // Modal "Agregar interacción" (manual, como + en gestos)
  const [modalInteraccionFiltroTiempo, setModalInteraccionFiltroTiempo] = useState('Todas'); // Filtro tiempo en modal Interacciones
  const [modalInteraccionDropdownFiltroVisible, setModalInteraccionDropdownFiltroVisible] = useState(false);
  
  // Modal de atenciones del contacto (componente reutilizable AtencionesModalContacto)
  const [modalAtencionesContactoVisible, setModalAtencionesContactoVisible] = useState(false);
  // Estados para botón Regar: agregar interacción desde pantalla (elegir contacto → formulario)
  const [modalRegarVisible, setModalRegarVisible] = useState(false);
  const [pasoRegar, setPasoRegar] = useState('contacto'); // 'contacto' | 'formulario'
  const [contactoSeleccionadoParaRegar, setContactoSeleccionadoParaRegar] = useState(null);
  const [textoInteraccionRegar, setTextoInteraccionRegar] = useState('');
  const [fechaHoraInteraccionRegar, setFechaHoraInteraccionRegar] = useState(new Date());
  const [showDatePickerRegar, setShowDatePickerRegar] = useState(false);
  const [dateModeRegar, setDateModeRegar] = useState('date');
  
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

  // Abrir modal de interacciones, modo swipe o contacto cuando se navega desde overlay/otra pestaña
  useFocusEffect(
    useCallback(() => {
      const contact = route.params?.openContact;
      const id = route.params?.openContactId;
      const openRegar = route.params?.openRegar;
      const openSwipeMode = route.params?.openSwipeMode;
      if (openRegar) {
        navigation.setParams({ openRegar: undefined });
        abrirModalRegar();
        return;
      }
      if (openSwipeMode) {
        navigation.setParams({ openSwipeMode: undefined });
        activarModoJuego();
        return;
      }
      if (contact) {
        setDatosEditados(contact);
        setVoicePreviewContactoFromModal({ id: contact._id, nombre: contact.nombre });
        setModalInteraccionesVisible(true);
        navigation.setParams({ openContactId: undefined, openContact: undefined });
        return;
      }
      if (!id || !vinculos.length) return;
      const found = vinculos.find(c => c._id === id);
      if (found) {
        setDatosEditados(found);
        setVoicePreviewContactoFromModal({ id: found._id, nombre: found.nombre });
        setModalInteraccionesVisible(true);
        navigation.setParams({ openContactId: undefined });
      }
    }, [route.params?.openContactId, route.params?.openContact, route.params?.openRegar, route.params?.openSwipeMode, vinculos, navigation])
  );

  // Sincronizar contacto actual para voz: cuando el modal de interacciones está abierto, el overlay usará este contacto al grabar
  useEffect(() => {
    if (modalInteraccionesVisible && datosEditados?._id) {
      setCurrentContactForVoice({ id: datosEditados._id, nombre: datosEditados.nombre || 'Contacto' });
    } else {
      setCurrentContactForVoice(null);
    }
  }, [modalInteraccionesVisible, datosEditados?._id, datosEditados?.nombre]);

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

  /** Colores muted para anillos (minimalismo empático: informativos, no invasivos). */
  const obtenerColorDegradacionMuted = (nivel) => {
    if (nivel < 0.25) return COLORES.mutedActivo || COLORES.activo;
    if (nivel < 0.55) return COLORES.mutedAtencion || COLORES.atencion;
    return COLORES.mutedUrgente || COLORES.urgente;
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
                  titulo: `📋 ${tarea.clasificacion || 'Huella'}`,
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

  const onSwipeComplete = (direction, capturedIndex, capturedItem) => {
    const idx = capturedIndex ?? activeIndex.current;
    const item = capturedItem ?? contactsRef.current[idx];
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
    const contactoMostrado = misContactos[currentIndex];
    if (!contactoMostrado) return;

    isSwiping.current = true;
    const x = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
    const idx = currentIndex;
    const item = contactoMostrado;
    Animated.timing(position, { toValue: { x, y: 0 }, duration: 250, useNativeDriver: false }).start(() => {
      onSwipeComplete(direction, idx, item);
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
      // En APK/release las URIs file:// de contactos no son accesibles; convertir a base64 para persistir (no bloquear guardado si falla)
      let fotoParaGuardar = datos.foto;
      if (fotoParaGuardar && typeof fotoParaGuardar === 'string' && fotoParaGuardar.startsWith('file://')) {
        try {
          fotoParaGuardar = await fileUriToBase64DataUri(fotoParaGuardar);
        } catch (_) {
          fotoParaGuardar = '';
        }
      }
      const datosLimpios = { ...datos, telefono: limpiarTelefonoVisual(datos.telefono), foto: fotoParaGuardar };
      
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
              const idAEliminar = datosEditados._id;
              const telefonoAEliminar = datosEditados.telefonoOriginal || limpiarTelefonoVisual(datosEditados.telefono);
              const eliminado = await borrarDelServidor(telefonoAEliminar);
              if (eliminado) {
                setModalVisible(false);
                setVinculos(prev => prev.filter(c => c._id !== idAEliminar));
                const pendingCount = await getPendingSyncCount();
                setPendingSyncCount(pendingCount);
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
      Alert.alert("Atención", "Describe el momento.");
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
        setModalAgregarInteraccionVisible(false);
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
      Alert.alert('Error', 'No se encontró el momento.');
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
        Alert.alert('Error', 'No se pudo guardar el momento.');
      }
    } catch (e) {
      console.error('Error guardando momento:', e);
      Alert.alert('Error', 'No se pudo guardar el momento.');
    }
  };

  // Funciones para gestionar tareas (separadas, se pueden borrar y completar)
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

  // Abrir modal de gestos desde el icono de la burbuja (sin menú flotante)
  const abrirModalGestosDesdeBurbuja = (contacto) => {
    const telfBuscado = normalizarTelefono(contacto.telefono);
    const contactoCompleto = vinculos.find(c => normalizarTelefono(c.telefono) === telfBuscado) || contacto;
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
      tareas: contactoCompleto.tareas || [],
      interacciones: contactoCompleto.interacciones || [],
    });
    setCurrentContactForVoice({ id: contactoCompleto._id, nombre: contactoCompleto.nombre || 'Contacto' });
    setModalAtencionesContactoVisible(true);
  };

  const regarContacto = (contacto) => {
    // Cargar datos del contacto para el modal de interacciones/momentos
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
        Alert.alert('Error', 'No se pudo guardar el momento.');
      }
    } catch (e) {
      console.error('Error guardando momento:', e);
      Alert.alert('Error', 'No se pudo guardar el momento.');
    }
  };

  const renderBurbuja = ({ item, index }) => {
    if (!item) return null;
    
    const degradacion = calcularDegradacion(item);
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
          onPress={() => abrirModalVip(item)}
          activeOpacity={0.8}
          style={styles.burbujaTouchable}
        >
          {/* Un solo círculo azul (color app), sin anillos exteriores; solo indicador "requiere atención" */}
          <View style={styles.burbujaWrapper}>
            <View style={styles.burbujaAzul}>
              {item.foto && item.foto.length > 20 && !item.foto.startsWith('file://') ? (
                <View style={styles.burbujaImagenContainer}>
                  <Image 
                    source={{ uri: item.foto }} 
                    style={styles.burbujaImagen}
                  />
                </View>
              ) : (
                <View style={styles.burbujaInicialAzul}>
                  <Ionicons 
                    name="person" 
                    size={BUBBLE_SIZE_IMAGE * 0.5} 
                    color={COLORES.textoSuave}
                  />
                </View>
              )}
            </View>
            
            {/* Indicador "requiere atención" (sparkles) arriba a la derecha */}
            {degradacion.nivel > 0.4 && (() => {
              const regarAnim = regarAnimaciones.current[bubbleKey];
              if (!regarAnim) return null;
              return (
                <View style={styles.badgeChispaContainer}>
                  <TouchableOpacity
                    onPress={() => regarContacto(item)}
                    activeOpacity={0.8}
                    style={styles.badgeIconoMutedTouchable}
                  >
                    <Animated.View
                      style={[
                        styles.badgeIconoMuted,
                        { backgroundColor: '#F5B800', borderWidth: 0, borderColor: 'transparent', shadowOpacity: 0, elevation: 0 },
                        { transform: [{ translateY: regarAnim.translateY }] }
                      ]}
                    >
                      <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                    </Animated.View>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </View>
          
          <Text style={[styles.burbujaNombre, { color: COLORES.texto }]} numberOfLines={1}>
            {item.nombre}
          </Text>
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
              <Ionicons name="close-circle" size={32} color={COLORES.textoSuave} />
              <Text style={styles.exitText}>Salir</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openAyuda} style={styles.headerIconButton} accessibilityLabel="Ayuda">
              <Ionicons name="help-circle-outline" size={26} color={COLORES.texto} />
            </TouchableOpacity>
          </View>
          <Text style={styles.gameTitle}>¡Terminaste!</Text>
          <Text style={{color: COLORES.textoSecundario, fontSize: 18, textAlign: 'center', marginTop: 20}}>
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
                <Ionicons name="close-circle" size={32} color={COLORES.textoSuave} />
                <Text style={styles.exitText}>Salir</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openAyuda} style={styles.headerIconButton} accessibilityLabel="Ayuda">
                <Ionicons name="help-circle-outline" size={26} color={COLORES.texto} />
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
              <Ionicons name="close-circle" size={32} color={COLORES.textoSuave} />
              <Text style={styles.exitText}>Salir</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openAyuda} style={styles.headerIconButton} accessibilityLabel="Ayuda">
              <Ionicons name="help-circle-outline" size={26} color={COLORES.texto} />
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
              <Ionicons name="person-add" size={18} color="white" />
              <Text style={styles.floatingButtonImportText}>Importar contactos</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
  }

  if (cargando) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.container}>
          <View style={styles.headerContainer}>
            <Text style={styles.header}>Vínculos</Text>
          </View>
          <View style={styles.skeletonGrid}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <View key={i} style={styles.skeletonBurbuja}>
                <View style={styles.skeletonCircle} />
                <View style={styles.skeletonNombre} />
              </View>
            ))}
          </View>
          <View style={styles.skeletonLoaderFooter}>
            <ActivityIndicator size="small" color={COLORES.agua} />
            <Text style={styles.skeletonLoaderText}>Cargando vínculos...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const listaAgendaFiltrada = agendaTelefonica.filter(c => c.name.toLowerCase().includes(filtroAgenda.toLowerCase()));

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
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
                
                {/* Foto con un corazón que se llena según el porcentaje de atención */}
                {(() => {
                  try {
                    const porcentajeAtencion = calcularPorcentajeAtencion(datosEditados, vinculos);
                    const colorMarca = COLORES.agua;
                    const colorGris = COLORES.textoSuave || '#8B95A5';
                    const opacidadRelleno = Math.min(100, Math.max(0, porcentajeAtencion)) / 100;
                    return (
                      <View style={styles.photoWithBarContainer}>
                        <View style={styles.photoContainerCentered} pointerEvents="box-none">
                          <View style={styles.photoContainer}>
                            {datosEditados.foto && !datosEditados.foto.startsWith('file://') ? (
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
                        </View>
                        <View style={styles.photoWithBarRight} pointerEvents="box-none">
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                              Alert.alert(
                                'Nivel de conexión',
                                'Este indicador refleja qué tan presente estás en la vida de este contacto. Se nutre con las atenciones que cumples (llamar, escribir, felicitar) y los momentos que registras.\n\nCada pequeña atención y cada momento que anotas hace crecer tu vínculo. ¡Cultiva tus relaciones con constancia y cariño! 🌱',
                                [{ text: 'Entendido' }]
                              );
                            }}
                            style={styles.signalAtencionTouchable}
                          >
                            <View style={styles.signalAtencionContainer}>
                              <View style={styles.signalAtencionHeartWrap}>
                                <Ionicons name="heart-outline" size={28} color={colorGris} style={styles.signalAtencionHeartOutline} />
                                <View style={[styles.signalAtencionHeartFilledWrap, { opacity: opacidadRelleno }]}>
                                  <Ionicons name="heart" size={28} color={colorMarca} style={styles.signalAtencionHeartFilled} />
                                </View>
                              </View>
                              <Text style={[styles.signalAtencionPorcentaje, { color: colorGris }]}>
                                {Math.round(porcentajeAtencion)}%
                              </Text>
                              <Text style={styles.signalAtencionLabel}>Nivel de conexión</Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  } catch (error) {
                    console.error('Error calculando porcentaje de atención:', error);
                    return (
                      <View style={styles.photoContainer}>
                        {datosEditados.foto && !datosEditados.foto.startsWith('file://') ? (
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
                    style={[styles.iconoAccion, { backgroundColor: COLORES.atencion }]}
                    onPress={() => setModalAtencionesContactoVisible(true)}
                  >
                    <Ionicons name="sparkles" size={20} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.iconoAccion, { backgroundColor: COLORES.agua }]}
                    onPress={() => setModalHuellasContactoVisible(true)}
                  >
                    <Ionicons name="footsteps-outline" size={20} color="white" />
                    {datosEditados.interacciones && datosEditados.interacciones.length > 0 && (
                      <View style={styles.iconoBadge}>
                        <Text style={styles.iconoBadgeText}>{datosEditados.interacciones.length}</Text>
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

        {/* Modal Huellas del contacto (mismo contenido que pestaña Huellas, filtrado a este contacto) */}
        <HuellasModalContacto
          visible={modalHuellasContactoVisible}
          onClose={() => setModalHuellasContactoVisible(false)}
          contact={datosEditados}
          onContactUpdate={(c) => {
            setDatosEditados(c);
            setVinculos(prev => (Array.isArray(prev) ? prev.map(x => (x._id === c._id ? c : x)) : prev));
          }}
        />

        <AtencionesModalContacto
          visible={modalAtencionesContactoVisible}
          onClose={() => { setModalAtencionesContactoVisible(false); setCurrentContactForVoice(null); }}
          contact={datosEditados}
          onContactUpdate={(c) => {
            setDatosEditados(c);
            setVinculos(prev => (Array.isArray(prev) ? prev.map(x => (x._id === c._id ? c : x)) : prev));
            cargarVinculos();
          }}
          onRequestVoice={(contacto) => {
            setVoicePreviewContactoFromModal({ id: contacto._id, nombre: contacto.nombre || 'Contacto' });
            setCurrentContactForVoice(contacto);
            setModalAtencionesContactoVisible(false);
            setTimeout(async () => {
              try {
                const { recording, error } = await startRecording();
                if (error) Alert.alert('Grabación', error);
                else setVoiceRecording(recording);
              } catch (e) {
                Alert.alert('Grabación', e.message || 'Error al grabar');
              }
            }, 350);
          }}
        />

        {/* Modal de interacciones - misma distribución que modal de gestos: header, fila filtros, FABs, lista */}
        <Modal animationType="slide" visible={modalInteraccionesVisible} onRequestClose={() => { setModalInteraccionesVisible(false); setVoicePreviewContactoFromModal(null); }}>
          <SafeAreaView style={styles.modalFull}>
            {/* Header: título + subtítulo con contador (igual que modal de gestos) */}
            {(() => {
              const interacciones = datosEditados.interacciones || [];
              const hoy = new Date();
              hoy.setHours(0, 0, 0, 0);
              const filtrarPorTiempo = (list) => {
                if (modalInteraccionFiltroTiempo === 'Todas') return list;
                return list.filter(item => {
                  const fe = item.fechaHora ? new Date(item.fechaHora) : null;
                  if (!fe) return false;
                  const feNorm = new Date(fe);
                  feNorm.setHours(0, 0, 0, 0);
                  switch (modalInteraccionFiltroTiempo) {
                    case 'Hoy': return feNorm.getTime() === hoy.getTime();
                    case 'Semana': { const fin = new Date(hoy); fin.setDate(fin.getDate() + 7); return feNorm >= hoy && feNorm < fin; }
                    case 'Mes': { const finMes = new Date(hoy); finMes.setMonth(finMes.getMonth() + 1); return feNorm >= hoy && feNorm < finMes; }
                    default: return true;
                  }
                });
              };
              const listaFiltrada = filtrarPorTiempo(interacciones);
              return (
                <View style={styles.modalGestoHeader}>
                  <View style={styles.modalGestoHeaderRow}>
                    <Text style={styles.modalGestoHeaderTitle}>Momentos con {datosEditados.nombre || 'Contacto'}</Text>
                    <TouchableOpacity onPress={() => { setModalInteraccionesVisible(false); setVoicePreviewContactoFromModal(null); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="close" size={24} color={COLORES.agua} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.modalGestoHeaderSubtitle}>
                    {listaFiltrada.length} {listaFiltrada.length === 1 ? 'momento' : 'momentos'}
                  </Text>
                </View>
              );
            })()}

            {/* Fila de filtro tiempo (misma fila que en modal de gestos: Filtro + espacio) */}
            <View style={styles.modalGestoDesplegablesRow}>
              <View style={styles.modalGestoDesplegableWrap}>
                <View style={styles.modalGestoDesplegableLabelRow}>
                  <Ionicons name="filter-outline" size={14} color={COLORES.textoSecundario} />
                  <Text style={styles.modalGestoDesplegableLabel}>Filtro</Text>
                </View>
                <TouchableOpacity style={styles.modalGestoDesplegableButton} onPress={() => setModalInteraccionDropdownFiltroVisible(true)} activeOpacity={0.7}>
                  <Text style={styles.modalGestoDesplegableButtonText} numberOfLines={1}>{modalInteraccionFiltroTiempo}</Text>
                  <Ionicons name="chevron-down" size={20} color={COLORES.textoSecundario} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalGestoDesplegableWrap} />
            </View>

            {/* Modal desplegable Filtro tiempo (interacciones) */}
            <Modal visible={modalInteraccionDropdownFiltroVisible} transparent animationType="fade" onRequestClose={() => setModalInteraccionDropdownFiltroVisible(false)}>
              <View style={styles.modalGestoDropdownOverlay}>
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setModalInteraccionDropdownFiltroVisible(false)} />
                <View style={styles.modalGestoDropdownContent}>
                  <Text style={styles.modalGestoDropdownTitle}>Filtro</Text>
                  <ScrollView style={styles.modalGestoDropdownList} showsVerticalScrollIndicator={false}>
                    {['Hoy', 'Semana', 'Mes', 'Todas'].map((op) => (
                      <TouchableOpacity
                        key={op}
                        style={[styles.modalGestoDropdownItem, modalInteraccionFiltroTiempo === op && styles.modalGestoDropdownItemActive]}
                        onPress={() => { setModalInteraccionFiltroTiempo(op); setModalInteraccionDropdownFiltroVisible(false); }}
                      >
                        <Text style={[styles.modalGestoDropdownItemText, modalInteraccionFiltroTiempo === op && styles.modalGestoDropdownItemTextActive]}>{op}</Text>
                        {modalInteraccionFiltroTiempo === op && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </Modal>

            {/* Lista de interacciones con tarjetas al estilo del modal de gestos (filtrada por tiempo) */}
            <ScrollView
              style={styles.modalGestosScroll}
              contentContainerStyle={styles.modalGestosScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {(() => {
                const interacciones = datosEditados.interacciones || [];
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                const filtrarPorTiempo = (list) => {
                  if (modalInteraccionFiltroTiempo === 'Todas') return list;
                  return list.filter(item => {
                    const fe = item.fechaHora ? new Date(item.fechaHora) : null;
                    if (!fe) return false;
                    const feNorm = new Date(fe);
                    feNorm.setHours(0, 0, 0, 0);
                    switch (modalInteraccionFiltroTiempo) {
                      case 'Hoy': return feNorm.getTime() === hoy.getTime();
                      case 'Semana': { const fin = new Date(hoy); fin.setDate(fin.getDate() + 7); return feNorm >= hoy && feNorm < fin; }
                      case 'Mes': { const finMes = new Date(hoy); finMes.setMonth(finMes.getMonth() + 1); return feNorm >= hoy && feNorm < finMes; }
                      default: return true;
                    }
                  });
                };
                const lista = filtrarPorTiempo(interacciones).slice().sort((a, b) => {
                  if (!a.fechaHora || !b.fechaHora) return 0;
                  return new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime();
                });
                if (lista.length === 0) {
                  const hayInteracciones = interacciones.length > 0;
                  return (
                    <View style={styles.emptyInteraccionesState}>
                      <Ionicons name="sparkles-outline" size={48} color={COLORES.textoSuave} />
                      <Text style={styles.emptyInteraccionesText}>
                        {hayInteracciones ? 'No hay momentos en este periodo' : 'No hay momentos registrados'}
                      </Text>
                      <Text style={[styles.emptyInteraccionesText, { fontSize: 14, marginTop: 4 }]}>
                        {hayInteracciones ? 'Prueba otro filtro' : 'Usa el botón flotante del micrófono para agregar un momento'}
                      </Text>
                    </View>
                  );
                }
                return lista.map((item, index) => {
                  const fechaInteraccion = item.fechaHora ? new Date(item.fechaHora) : null;
                  return (
                    <View key={`${item.fechaHora}-${index}`} style={styles.modalGestoTareaItem}>
                      <View style={styles.modalGestoTareaLeft}>
                        {!item.audioBase64 && (
                          <TouchableOpacity style={styles.modalGestoEditButton} onPress={() => abrirEditarInteraccion(item)}>
                            <Ionicons name="brush-outline" size={22} color={COLORES.agua} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.modalGestoTareaInfo}>
                        <View style={styles.modalGestoTareaHeader}>
                          <Text style={styles.modalGestoTareaTitulo} numberOfLines={1}>✨ Momento</Text>
                          <Text style={styles.modalGestoTareaContactoDerecha} numberOfLines={1}>{datosEditados.nombre || '—'}</Text>
                        </View>
                        {item.audioBase64 ? (
                          <>
                            <Text style={styles.modalGestoTareaDescripcion}>[Nota de voz]</Text>
                            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }} onPress={async () => { const r = await playFromBase64(item.audioBase64); if (r.error) Alert.alert('Audio', r.error); }}>
                              <Ionicons name="play-circle" size={24} color={COLORES.agua} />
                              <Text style={{ fontSize: 14, color: COLORES.agua }}>Reproducir</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <Text style={styles.modalGestoTareaDescripcion} numberOfLines={2}>{item.descripcion}</Text>
                        )}
                        {fechaInteraccion && (
                          <View style={styles.modalGestoTareaMeta}>
                            <View style={[styles.modalGestoPrioridadBadge, { backgroundColor: COLORES.agua }]}>
                              <Text style={styles.modalGestoPrioridadText}>{fechaInteraccion.toLocaleDateString('es-ES')}</Text>
                            </View>
                            <View style={styles.modalGestoHoraContainer}>
                              <Ionicons name="time-outline" size={14} color={COLORES.textoSecundario} />
                              <Text style={styles.modalGestoHoraText}>{formatTime12h(fechaInteraccion)}</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                });
              })()}
            </ScrollView>
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
                <Text style={styles.modalEditarInteraccionTitle}>Editar momento</Text>
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
                  placeholder="Describe el momento..."
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
                    {editInteraccionFecha ? `${editInteraccionFecha.toLocaleDateString('es-ES')} ${formatTime12h(editInteraccionFecha)}` : 'Seleccionar'}
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

        {/* Modal Agregar momento (manual) - se abre al pulsar + en Momentos del contacto */}
        <Modal animationType="slide" visible={modalAgregarInteraccionVisible} onRequestClose={() => setModalAgregarInteraccionVisible(false)}>
          <SafeAreaView style={styles.modalFull}>
            <View style={styles.modalHeaderImportar}>
              <Text style={styles.modalTitleImportar}>Agregar momento</Text>
              <TouchableOpacity onPress={() => setModalAgregarInteraccionVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color={COLORES.agua} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalGestosDeNombre}>Para {datosEditados.nombre || 'Contacto'}</Text>
            <ScrollView style={styles.modalGestosScroll} contentContainerStyle={styles.modalGestosScrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.nuevaInteraccionContainer}>
                <Text style={styles.label}>Descripción</Text>
                <TextInput
                  style={styles.inputNuevaInteraccion}
                  value={textoInteraccion}
                  onChangeText={setTextoInteraccion}
                  placeholder="Qué hiciste o comentaste (ej: Llamada para felicitar)..."
                  multiline={true}
                />
                <TouchableOpacity
                  style={[styles.addInteraccionButton, !textoInteraccion.trim() && styles.addInteraccionButtonDisabled]}
                  onPress={agregarInteraccion}
                  disabled={!textoInteraccion.trim()}
                >
                  <Ionicons name="create-outline" size={20} color="white" />
                  <Text style={styles.addInteraccionButtonText}>Agregar momento</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
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
          <View style={styles.headerTopRow}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="leaf" size={28} color={COLORES.agua} style={styles.headerIcon} />
              <Text style={styles.header} numberOfLines={1}>Vínculos</Text>
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
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={activarModoJuego} style={[styles.headerIconButton, styles.headerIconButtonSwipe]} accessibilityLabel="Cultivar relación">
                <Ionicons name="swap-horizontal-outline" size={24} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={openAyuda} style={styles.headerIconButton} accessibilityLabel="Ayuda">
                <Ionicons name="help-circle-outline" size={26} color={COLORES.texto} />
              </TouchableOpacity>
              <NotificationBell />
            </View>
          </View>
          <Text style={styles.subheader} numberOfLines={1}>Gestiona tus relaciones personales</Text>
        </View>

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
          columnWrapperStyle={styles.gridRow}
          onRefresh={cargarVinculos}
          refreshing={false}
          showsVerticalScrollIndicator={false}
          style={{ zIndex: 1 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIconWrap}>
                <Ionicons name="people-outline" size={72} color={COLORES.textoSuave} />
              </View>
              <Text style={styles.emptyText}>No hay vínculos aún</Text>
              <Text style={styles.emptyStateHint}>Toca este icono en la esquina superior derecha:</Text>
              <View style={styles.emptyStateSwipeIconReplica}>
                <Ionicons name="swap-horizontal-outline" size={28} color="white" />
              </View>
              <Text style={styles.emptySubtext}>Ahí empiezas a cargar tus contactos importantes desde tu agenda. Desliza las tarjetas a la derecha para añadirlos a tus vínculos.</Text>
            </View>
          }
        />

        {/* Preview de nota de voz: siempre en GlobalVoiceOverlay (App.js) */}

        {/* Botones + y Regar: ver GlobalVoiceOverlay (siempre encima en toda la app) */}

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
            {datosEditados.foto && !datosEditados.foto.startsWith('file://') && (
              <Image 
                source={{ uri: datosEditados.foto }} 
                style={styles.fotoFullscreen}
                resizeMode="contain"
              />
            )}
          </SafeAreaView>
        </Modal>

        {/* Modal Agregar un Momento: elegir contacto → agregar momento */}
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
                  <Text style={styles.modalRegarTitle}>¿Quieres agregar un Momento?</Text>
                )}
                <TouchableOpacity onPress={cerrarModalRegar}>
                  <Ionicons name="close" size={24} color={COLORES.texto} />
                </TouchableOpacity>
              </View>

              {pasoRegar === 'contacto' && (
                <View style={styles.modalRegarBody}>
                  <Text style={styles.modalRegarSubtitle}>Elige con quién compartiste un momento especial.</Text>
                  {vinculos.length === 0 ? (
                    <View style={styles.modalRegarEmpty}>
                      <Ionicons name="people-outline" size={48} color={COLORES.textoSuave} />
                      <Text style={styles.modalRegarEmptyText}>No hay contactos</Text>
                      <Text style={styles.modalRegarEmptyHint}>Añade contactos para compartir momentos con ellos.</Text>
                    </View>
                  ) : (
                    <ScrollView
                      style={styles.modalRegarList}
                      contentContainerStyle={styles.modalRegarBurbujasContent}
                      showsVerticalScrollIndicator={false}
                    >
                      <View style={styles.modalRegarBurbujasGrid}>
                        {vinculos.map((item) => (
                          <TouchableOpacity
                            key={item._id || item.telefono}
                            style={styles.modalRegarBurbujaWrap}
                            onPress={() => seleccionarContactoParaRegar(item)}
                            activeOpacity={0.8}
                          >
                            <View style={styles.modalRegarBurbujaCircle}>
                              {item.foto && item.foto.length > 20 && !item.foto.startsWith('file://') ? (
                                <Image source={{ uri: item.foto }} style={styles.modalRegarBurbujaImagen} />
                              ) : (
                                <View style={styles.modalRegarBurbujaInicial}>
                                  <Ionicons name="person" size={28} color={COLORES.textoSecundario} />
                                </View>
                              )}
                            </View>
                            <Text style={styles.modalRegarBurbujaNombre} numberOfLines={1}>{item.nombre}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </View>
              )}

              {pasoRegar === 'formulario' && contactoSeleccionadoParaRegar && (
                <>
                  <View style={styles.modalRegarParaQuien}>
                    {contactoSeleccionadoParaRegar.foto && contactoSeleccionadoParaRegar.foto.length > 20 && !contactoSeleccionadoParaRegar.foto.startsWith('file://') ? (
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
                      <Text style={styles.modalRegarLabel}>Nuevo momento</Text>
                      <TextInput
                        style={styles.inputNuevaInteraccion}
                        value={textoInteraccionRegar}
                        onChangeText={setTextoInteraccionRegar}
                        placeholder="Describe lo más importante de este momento..."
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
                            {fechaHoraInteraccionRegar ? `${fechaHoraInteraccionRegar.toLocaleDateString('es-ES')} ${formatTime12h(fechaHoraInteraccionRegar)}` : 'Fecha/Hora'}
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
                        Los momentos son historial permanente
                      </Text>
                      <TouchableOpacity
                        style={[styles.addInteraccionButton, !textoInteraccionRegar.trim() && styles.addInteraccionButtonDisabled]}
                        onPress={guardarNuevaInteraccionRegar}
                        disabled={!textoInteraccionRegar.trim()}
                      >
                        <Ionicons name="sparkles" size={18} color="white" />
                        <Text style={styles.addInteraccionButtonText}>Regar - Agregar momento</Text>
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
    flexDirection: 'column',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  headerIcon: {
    marginRight: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    minWidth: 100,
  },
  headerIconButton: {
    padding: 8,
    minWidth: 40,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconButtonSwipe: {
    backgroundColor: COLORES.atencion,
    borderRadius: 999,
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
    fontSize: 28,
    fontWeight: '700',
    color: COLORES.texto,
    letterSpacing: -0.5,
  },
  subheader: {
    fontSize: 14,
    color: COLORES.textoSuave,
    fontWeight: '400',
    flexShrink: 1,
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
    paddingHorizontal: GRID_PADDING_H,
    paddingTop: 16,
    paddingBottom: 140,
  },
  gridRow: {
    justifyContent: 'center',
    marginBottom: 24,
    paddingHorizontal: GRID_ROW_PADDING_H,
  },
  burbujaContainer: {
    width: BUBBLE_SIZE,
    marginHorizontal: BUBBLE_MARGIN_H,
    marginVertical: 6,
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
  /** Círculo azul único (color app), sin anillos exteriores */
  burbujaAzul: {
    width: BUBBLE_SIZE_INNER,
    height: BUBBLE_SIZE_INNER,
    borderRadius: BUBBLE_RADIUS,
    backgroundColor: COLORES.burbujaFondo,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORES.agua,
    shadowColor: COLORES.sombra,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  burbujaInicialAzul: {
    width: BUBBLE_SIZE_IMAGE,
    height: BUBBLE_SIZE_IMAGE,
    borderRadius: BUBBLE_RADIUS_IMAGE,
    backgroundColor: COLORES.aguaClaro,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginTop: 12,
    fontSize: 15,
    fontWeight: '700',
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
    zIndex: 10,
  },
  // Anillo exterior suave para alta importancia (muted, no invasivo)
  burbujaAnilloPrioridad: {
    position: 'absolute',
    left: -4,
    top: -4,
    width: BUBBLE_SIZE_INNER + 8,
    height: BUBBLE_SIZE_INNER + 8,
    borderRadius: (BUBBLE_SIZE_INNER + 8) / 2,
    borderWidth: 1.2,
    backgroundColor: 'transparent',
    zIndex: 0,
  },
  // Contenedor para chispa "requiere atención" (arriba a la derecha del círculo)
  badgeChispaContainer: {
    position: 'absolute',
    top: 2,
    right: 2,
    zIndex: 10,
  },
  badgeGrupoContainer: {
    position: 'absolute',
    top: 2,
    right: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    zIndex: 10,
  },
  badgeIconoMuted: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORES.burbujaFondo,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1.5,
    elevation: 1,
  },
  badgeIconoMutedTouchable: {
    zIndex: 11,
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
    borderWidth: 2.5,
    zIndex: 10,
  },
  badgeRegarTouchable: {
    position: 'absolute',
    top: -BADGE_OFFSET,
    right: -BADGE_OFFSET,
    width: 36,
    height: 36,
    borderRadius: 18,
    zIndex: 11,
  },
  // Badge de tiempo minimalista en la parte inferior del círculo (neutro, sin estrés)
  degradacionBadgeMinimal: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -24,
    width: 48,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: COLORES.badgeTiempoFondo || COLORES.fondoSecundario,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  degradacionTextoMinimal: {
    color: COLORES.badgeTiempoTexto || COLORES.textoSecundario,
    fontSize: 10,
    fontWeight: '300',
    letterSpacing: 0.3,
  },
  degradacionBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
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
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 32,
  },
  emptyStateIconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: COLORES.fondoSecundario,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    opacity: 0.85,
  },
  emptyText: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORES.texto,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyStateHint: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
    marginTop: 28,
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyStateSwipeIconReplica: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORES.atencion,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptySubtext: {
    fontSize: 15,
    color: COLORES.textoSecundario,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 0,
    alignSelf: 'stretch',
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 20,
  },
  skeletonBurbuja: {
    width: (SCREEN_WIDTH - 56 - 36) / 3,
    alignItems: 'center',
    marginBottom: 28,
  },
  skeletonCircle: {
    width: BUBBLE_SIZE_INNER,
    height: BUBBLE_SIZE_INNER,
    borderRadius: BUBBLE_RADIUS,
    backgroundColor: COLORES.fondoSecundario,
    opacity: 0.6,
  },
  skeletonNombre: {
    width: '75%',
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORES.fondoTerciario,
    marginTop: 12,
    opacity: 0.8,
  },
  skeletonLoaderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  skeletonLoaderText: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    fontWeight: '400',
  },
  // Estilos del modo swipe/descubrir (fondo secundario del app: armónico, poco ruido, FAB micrófono visible)
  gameContainer: {
    flex: 1,
    backgroundColor: COLORES.fondoSecundario,
    paddingTop: 40,
    alignItems: 'center',
  },
  gameHeader: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 10,
    height: 40,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exitText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: COLORES.texto,
    marginLeft: 5,
  },
  gameTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORES.texto,
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
    flexDirection: 'column-reverse',
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
  // Indicador de 4 corazones de atención: outline gris, relleno verde según porcentaje
  signalAtencionTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalAtencionContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 8,
  },
  signalAtencionHeartWrap: {
    width: 28,
    height: 28,
    position: 'relative',
  },
  signalAtencionHeartOutline: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  signalAtencionHeartFilledWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  signalAtencionHeartFilled: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  signalAtencionPorcentaje: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  signalAtencionLabel: {
    fontSize: 10,
    color: COLORES.textoSuave,
    marginTop: 2,
    letterSpacing: 0.2,
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
  modalInteraccionesFloatingWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 999,
    elevation: 999,
  },
  modalInteraccionesFloatingAdd: {
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
    elevation: 10,
    zIndex: 1000,
  },
  modalInteraccionesFloatingMic: {
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
    elevation: 10,
    zIndex: 1000,
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
    position: 'relative',
    width: '100%',
    minHeight: 130,
    marginBottom: 15,
  },
  // Foto centrada con posición absoluta (50% - mitad del ancho de la foto)
  photoContainerCentered: {
    position: 'absolute',
    left: '50%',
    marginLeft: -50,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  photoWithBarRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
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
    backgroundColor: COLORES.agua,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingButtonSwipeInner: {
    backgroundColor: COLORES.atencion,
    shadowColor: COLORES.agua,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  floatingButtonImport: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES.saludable,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  floatingButtonImportText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
    letterSpacing: 0.2,
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
    width: 52,
    height: 52,
    borderRadius: 26,
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
  gestoCardListContent: {
    padding: 16,
    paddingBottom: 40,
  },
  gestoCardItem: {
    flexDirection: 'row',
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
  gestoCardItemCompletada: {
    opacity: 0.7,
    backgroundColor: COLORES.fondoSecundario,
  },
  gestoCardLeft: {
    flexDirection: 'column',
    alignItems: 'center',
    marginRight: 12,
    gap: 8,
  },
  gestoCardCheckbox: {
    padding: 4,
  },
  gestoCardCopyDelete: {
    padding: 4,
  },
  gestoCardInfo: {
    flex: 1,
  },
  gestoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
    flexWrap: 'wrap',
  },
  gestoCardTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
    flex: 1,
  },
  gestoCardRecurrenteBadge: {
    backgroundColor: COLORES.agua,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  gestoCardRecurrenteText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'white',
  },
  gestoCardDescripcion: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    marginBottom: 12,
    lineHeight: 20,
  },
  gestoCardDescripcionCompletada: {
    textDecorationLine: 'line-through',
    color: '#95A5A6',
  },
  gestoCardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gestoCardPrioridadBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  gestoCardPrioridadText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  gestoCardHoraContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gestoCardHoraText: {
    fontSize: 13,
    color: COLORES.textoSecundario,
  },
  gestoCardCompletadaText: {
    fontSize: 12,
    color: COLORES.activo,
    marginBottom: 8,
  },
  gestoCardAccionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
    gap: 8,
  },
  gestoCardAccionText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
  gestoCardAccionInactivo: {
    backgroundColor: COLORES.fondoSecundario,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gestoCardAccionEmoji: {
    fontSize: 18,
  },
  gestoCardAccionTextInactivo: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORES.textoSecundario,
  },
  // Modal gestos del contacto - mismo aspecto que pestaña Gestos (imagen 2)
  modalGestoHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: COLORES.fondo,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  modalGestoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalGestoHeaderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORES.texto,
    flex: 1,
  },
  modalGestoHeaderSubtitle: {
    fontSize: 15,
    color: COLORES.textoSecundario,
    marginTop: 4,
  },
  modalGestosScroll: {
    flex: 1,
  },
  modalGestosScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  modalGestoDesplegablesRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  modalGestoDesplegableWrap: {
    flex: 1,
  },
  modalGestoDesplegableLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  modalGestoDesplegableLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORES.textoSecundario,
  },
  modalGestoDesplegableButton: {
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
  modalGestoDesplegableButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORES.texto,
    flex: 1,
  },
  modalGestoDropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalGestoDropdownContent: {
    backgroundColor: COLORES.fondo,
    borderRadius: 16,
    paddingVertical: 8,
    maxHeight: 320,
  },
  modalGestoDropdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  modalGestoDropdownList: {
    maxHeight: 260,
  },
  modalGestoDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  modalGestoDropdownItemActive: {
    backgroundColor: COLORES.fondoSecundario,
  },
  modalGestoDropdownItemText: {
    fontSize: 16,
    color: COLORES.texto,
    fontWeight: '500',
  },
  modalGestoDropdownItemTextActive: {
    color: COLORES.agua,
    fontWeight: '600',
  },
  modalGestoFiltrosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  modalGestoFiltroLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    marginRight: 4,
  },
  modalGestoChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORES.fondoSecundario,
  },
  modalGestoChipActive: {
    backgroundColor: COLORES.agua,
  },
  modalGestoChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
  },
  modalGestoChipTextActive: {
    color: 'white',
  },
  modalGestoAccionesBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  modalGestoMicHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  modalGestoMicHintText: {
    fontSize: 12,
    color: COLORES.textoSecundario,
    flex: 1,
  },
  modalGestoMicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORES.urgente || '#C62828',
  },
  modalGestoMicButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  modalGestoAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORES.agua,
  },
  modalGestoAddButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  modalGestoHistorialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORES.textoSecundario,
  },
  modalGestoHistorialButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'white',
  },
  modalGestoHistorialTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORES.texto,
    marginTop: 20,
    marginBottom: 12,
    marginHorizontal: 20,
  },
  modalGestoTareaItem: {
    flexDirection: 'row',
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
  modalGestoTareaItemCompletada: {
    opacity: 0.7,
    backgroundColor: COLORES.fondoSecundario,
  },
  modalGestoTareaLeft: {
    flexDirection: 'column',
    alignItems: 'center',
    marginRight: 12,
    gap: 8,
  },
  modalGestoEditButton: {
    padding: 4,
  },
  modalGestoTareaInfo: {
    flex: 1,
  },
  modalGestoTareaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalGestoTareaTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
    flex: 1,
    marginRight: 8,
  },
  modalGestoTareaContactoDerecha: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    maxWidth: '45%',
    textAlign: 'right',
  },
  modalGestoRecurrenteBadge: {
    backgroundColor: COLORES.agua,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  modalGestoRecurrenteText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'white',
  },
  modalGestoTareaDescripcion: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    marginBottom: 12,
    lineHeight: 20,
  },
  modalGestoTareaDescripcionCompletada: {
    textDecorationLine: 'line-through',
    color: '#95A5A6',
  },
  modalGestoTareaMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalGestoPrioridadBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modalGestoPrioridadText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  modalGestoHoraContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalGestoHoraText: {
    fontSize: 12,
    color: COLORES.textoSecundario,
  },
  modalGestoCompletadaText: {
    fontSize: 12,
    color: COLORES.activo,
    marginBottom: 8,
  },
  modalGestoAccionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  modalGestoAccionText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
  modalGestoAccionInactivo: {
    backgroundColor: COLORES.fondoSecundario,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalGestoAccionEmoji: {
    fontSize: 18,
  },
  modalGestoAccionTextInactivo: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORES.textoSecundario,
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
    color: COLORES.textoSuave,
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
  modalRegarBurbujasContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  modalRegarBurbujasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 20,
  },
  modalRegarBurbujaWrap: {
    width: 88,
    alignItems: 'center',
  },
  modalRegarBurbujaCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORES.burbujaFondo || '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORES.agua,
    shadowColor: COLORES.sombra,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  modalRegarBurbujaImagen: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
  },
  modalRegarBurbujaInicial: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    backgroundColor: COLORES.fondoSecundario,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRegarBurbujaNombre: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORES.texto,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 88,
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
});
