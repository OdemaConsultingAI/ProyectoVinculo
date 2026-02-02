import React, { useEffect, useRef, useState } from 'react';
import { Easing } from 'react-native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceGlobal } from '../context/VoiceGlobalContext';
import { COLORES } from '../constants/colores';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { startRecording, stopRecording, playPreviewUri, uploadVoiceTemp, deleteVoiceTemp, transcribeVoiceTemp } from '../services/voiceToTaskService';
import { loadContacts, saveInteractionFromVoice, saveTaskFromVoice, saveDesahogoFromVoice, saveDesahogoFromText, saveInteractionFromText, saveTaskFromText } from '../services/syncService';
import { normalizeForMatch } from '../utils/validations';
import { formatTime12h } from '../utils/dateTime';

import { TIPOS_DE_GESTO_DISPLAY, GESTO_ICON_CONFIG } from '../constants/tiposDeGesto';

const getGestoConfig = (clasificacion) => GESTO_ICON_CONFIG[clasificacion] || GESTO_ICON_CONFIG['Otro'];
const TAB_BAR_OFFSET = 56;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function GlobalVoiceOverlay({ navigationRef, currentRouteName = 'Vínculos' }) {
  const {
    voiceRecording,
    setVoiceRecording,
    sendingVoice,
    setSendingVoice,
    voicePreviewTempId,
    setVoicePreviewTempId,
    voicePreviewAudioUri,
    setVoicePreviewAudioUri,
    voicePreviewData,
    setVoicePreviewData,
    voicePreviewTranscription,
    setVoicePreviewTranscription,
    voiceTranscribing,
    setVoiceTranscribing,
    voicePreviewContactoFromModal,
    setVoicePreviewContactoFromModal,
    modalVoicePreviewVisible,
    setModalVoicePreviewVisible,
    currentContactForVoice,
    voiceSelectedTipo,
    setVoiceSelectedTipo,
    voiceWriteModalVisible,
    setVoiceWriteModalVisible,
    semicircleMenuVisible,
    setSemicircleMenuVisible,
    modalWithVoiceOpen,
    voiceOverlayApiRef,
  } = useVoiceGlobal();
  /** Modal "¿Cómo agregar?": Nota de voz | Escribir (tras elegir tipo). */
  const [modalModoVisible, setModalModoVisible] = useState(false);
  /** Modal de grabación (mic grande, indicador, botón parar). */
  const [modalGrabacionVisible, setModalGrabacionVisible] = useState(false);

  const OPCIONES_TIPO = [
    { id: 'gesto', icon: 'footsteps-outline', label: 'Huella' },
    { id: 'momento', icon: 'sparkles', label: 'Atención' },
    { id: 'desahogo', icon: 'document-text-outline', label: 'Desahogo' },
  ];

  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const recordingPulseAnim = useRef(new Animated.Value(1)).current;
  const recordingActiveRef = useRef(false);
  const transcribeGenRef = useRef(0);
  const grabacionStartedRef = useRef(false);
  const [vinculos, setVinculos] = useState([]);
  const [voicePreviewFechaEjecucion, setVoicePreviewFechaEjecucion] = useState(() => new Date());
  const [showDatePickerVoice, setShowDatePickerVoice] = useState(false);
  const [datePickerModeVoice, setDatePickerModeVoice] = useState('date');
  /** Texto editable en preview (solo Gesto/Momento); inicializado desde transcripción. */
  const [voicePreviewEditedText, setVoicePreviewEditedText] = useState('');
  /** Contacto elegido por el usuario en el preview (cuando la nota no menciona a nadie). */
  const [voicePreviewSelectedContactId, setVoicePreviewSelectedContactId] = useState(null);
  /** Modal escribir (lápiz): texto, contacto y fecha/hora (para Gesto/Momento). */
  const [voiceWriteText, setVoiceWriteText] = useState('');
  const [voiceWriteContactoId, setVoiceWriteContactoId] = useState(null);
  const [voiceWriteFecha, setVoiceWriteFecha] = useState(() => new Date());
  const [showDatePickerWrite, setShowDatePickerWrite] = useState(false);
  const [datePickerModeWrite, setDatePickerModeWrite] = useState('date');
  const [voiceWriteSaving, setVoiceWriteSaving] = useState(false);
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8) + TAB_BAR_OFFSET;
  const topInset = Math.max(insets.top, 0);

  // Timer de grabación
  useEffect(() => {
    if (!voiceRecording) {
      setRecordingElapsed(0);
      return;
    }
    setRecordingElapsed(0);
    const interval = setInterval(() => setRecordingElapsed(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [voiceRecording]);

  // Animación pulso grabando
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
      ]).start(loop);
    };
    loop();
    return () => {
      recordingActiveRef.current = false;
      recordingPulseAnim.stopAnimation();
    };
  }, [voiceRecording]);

  // Desahogo por voz: guardar directamente (backend transcribe + guarda) y mostrar texto en solo lectura
  useEffect(() => {
    if (!modalVoicePreviewVisible || !voicePreviewTempId || voiceSelectedTipo !== 'desahogo') return;
    const gen = ++transcribeGenRef.current;
    setVoiceTranscribing(true);
    setVoicePreviewTranscription(null);
    saveDesahogoFromVoice(voicePreviewTempId)
      .then((res) => {
        setVoiceTranscribing(false);
        if (gen !== transcribeGenRef.current) return;
        setVoicePreviewTranscription(res?.desahogo?.transcription ?? 'Guardado.');
        setVoicePreviewData({ tipo: 'desahogo', soloLectura: true });
      })
      .catch((e) => {
        setVoiceTranscribing(false);
        if (gen === transcribeGenRef.current) {
          setVoicePreviewTranscription(e?.message ?? 'Error al guardar.');
        }
      });
  }, [modalVoicePreviewVisible, voicePreviewTempId, voiceSelectedTipo]);

  // Transcribir cuando se abre el modal (solo Gesto o Momento; Desahogo se maneja arriba)
  useEffect(() => {
    if (!modalVoicePreviewVisible || !voicePreviewTempId || voiceSelectedTipo === 'desahogo') return;
    const gen = ++transcribeGenRef.current;
    setVoiceTranscribing(true);
    setVoicePreviewTranscription(null);
    transcribeVoiceTemp(voicePreviewTempId, voiceSelectedTipo).then((result) => {
      setVoiceTranscribing(false);
      if (gen !== transcribeGenRef.current) return;
      if (result.success) {
        const texto = result.texto || '';
        setVoicePreviewTranscription(texto);
        setVoicePreviewEditedText(texto);
        const contactoId = voicePreviewContactoFromModal?.id ?? result.contactoId ?? null;
        const contactoNombre = voicePreviewContactoFromModal?.nombre ?? result.contactoNombre ?? result.vinculo ?? 'Sin asignar';
        const hoyStr = new Date().toISOString().slice(0, 10);
        const fechaStr = result.fecha || hoyStr;
        const fechaClamped = (result.tipo === 'tarea' && fechaStr < hoyStr) ? hoyStr : fechaStr;
        setVoicePreviewData({
          texto: result.texto || '',
          tipo: result.tipo || 'tarea',
          vinculo: contactoNombre,
          tarea: result.tarea || '',
          descripcion: result.descripcion || result.tarea || '',
          fecha: fechaClamped,
          clasificacion: TIPOS_DE_GESTO_DISPLAY.includes(result.clasificacion) ? result.clasificacion : 'Otro',
          contactoId,
          contactoNombre,
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
    }).catch(() => {
      setVoiceTranscribing(false);
      if (gen === transcribeGenRef.current) {
        setVoicePreviewTranscription('Error al transcribir');
      }
    });
  }, [modalVoicePreviewVisible, voicePreviewTempId, voiceSelectedTipo]);

  // Iniciar grabación al abrir el modal de grabación (Nota de voz); solo una vez por apertura
  useEffect(() => {
    if (!modalGrabacionVisible || !voiceSelectedTipo || voiceRecording || sendingVoice) return;
    if (grabacionStartedRef.current) return;
    grabacionStartedRef.current = true;
    startRecordingFlow();
  }, [modalGrabacionVisible, voiceSelectedTipo]);
  useEffect(() => {
    if (!modalGrabacionVisible) grabacionStartedRef.current = false;
  }, [modalGrabacionVisible]);

  // Cargar contactos cuando el modal de preview o el de escribir está visible
  useEffect(() => {
    if (!modalVoicePreviewVisible && !voiceWriteModalVisible) return;
    loadContacts()
      .then((res) => setVinculos(Array.isArray(res?.contactos) ? res.contactos : []))
      .catch(() => setVinculos([]));
  }, [modalVoicePreviewVisible, voiceWriteModalVisible]);

  // Al abrir el modal de escribir (gesto/momento), inicializar fecha/hora a ahora
  useEffect(() => {
    if (voiceWriteModalVisible && (voiceSelectedTipo === 'gesto' || voiceSelectedTipo === 'momento')) {
      setVoiceWriteFecha(new Date());
    }
  }, [voiceWriteModalVisible, voiceSelectedTipo]);

  const formatRecordingTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  /** Inicia la grabación (tras elegir tipo desde el menú). */
  const startRecordingFlow = async () => {
    const { requestRecordingPermission } = await import('../services/voiceToTaskService');
    const perm = await requestRecordingPermission();
    if (!perm.granted) {
      Alert.alert('Micrófono', perm.error || 'Se necesita permiso de micrófono.');
      return;
    }
    const { startRecording: startRec } = await import('../services/voiceToTaskService');
    const { recording, error: startErr } = await startRec();
    if (startErr || !recording) {
      Alert.alert('Grabación', startErr || 'No se pudo iniciar la grabación.');
      return;
    }
    setVoiceRecording(recording);
  };

  /** Al elegir Huella/Atención/Desahogo: abrir modal "Nota de voz" | "Escribir...". */
  const onSelectTipoFromMenu = (tipo) => {
    setVoiceSelectedTipo(tipo);
    setSemicircleMenuVisible(false);
    setModalModoVisible(true);
  };

  /** Cerrar modal modo y abrir escritura. */
  const onElegirEscribir = () => {
    setModalModoVisible(false);
    setVoiceWriteText('');
    setVoiceWriteContactoId(null);
    setVoiceWriteModalVisible(true);
  };

  /** Cerrar modal modo y abrir modal de grabación; la grabación se inicia en useEffect. */
  const onElegirNotaDeVoz = () => {
    setModalModoVisible(false);
    setModalGrabacionVisible(true);
  };

  const handleMicPress = async () => {
    if (sendingVoice) return;
    if (semicircleMenuVisible) {
      setSemicircleMenuVisible(false);
      return;
    }
    if (voiceRecording) {
      const { uri, error: stopErr } = await stopRecording(voiceRecording);
      setVoiceRecording(null);
      if (stopErr || !uri) {
        Alert.alert('Grabación', stopErr || 'No se obtuvo el audio.');
        return;
      }
      await new Promise(r => setTimeout(r, 250));
      setVoicePreviewAudioUri(uri);
      setVoicePreviewData(null);
      setVoicePreviewTempId(null);
      setSendingVoice(true);
      const upload = await uploadVoiceTemp(uri);
      setSendingVoice(false);
      if (!upload.success) {
        Alert.alert('Subir nota', upload.error || 'No se pudo subir la nota.');
        return;
      }
      setVoicePreviewTempId(upload.tempId);
      setVoicePreviewContactoFromModal(currentContactForVoice ?? null);
      setModalVoicePreviewVisible(true);
      setModalGrabacionVisible(false);
      return;
    }
    setSemicircleMenuVisible(true);
  };

  const closeFabMenu = () => {
    setSemicircleMenuVisible(false);
  };

  const showFloatingButtons = currentRouteName !== 'Configuración';

  const closeVoicePreview = async () => {
    if (voicePreviewTempId && voiceSelectedTipo !== 'desahogo') await deleteVoiceTemp(voicePreviewTempId);
    setModalVoicePreviewVisible(false);
    setVoicePreviewData(null);
    setVoicePreviewAudioUri(null);
    setVoicePreviewTempId(null);
    setVoicePreviewTranscription(null);
    setVoicePreviewEditedText('');
    setVoicePreviewSelectedContactId(null);
    setVoiceTranscribing(false);
    setVoicePreviewContactoFromModal(null);
    setVoiceSelectedTipo(null);
  };

  /** Contacto efectivo en preview: AI, selección manual o desde modal. */
  const getVoicePreviewContactoId = () => {
    let id = voicePreviewData?.contactoId ?? voicePreviewSelectedContactId ?? voicePreviewContactoFromModal?.id;
    if (!id && voicePreviewData?.contactoNombre && Array.isArray(vinculos)) {
      const c = vinculos.find(x => normalizeForMatch(x.nombre) === normalizeForMatch(voicePreviewData.contactoNombre));
      if (c?._id) id = c._id;
    }
    return id || null;
  };
  const getVoicePreviewContactoNombre = () => {
    const id = getVoicePreviewContactoId();
    if (id) {
      const c = vinculos.find(x => x._id === id);
      return c?.nombre ?? voicePreviewData?.contactoNombre ?? voicePreviewData?.vinculo ?? 'Sin asignar';
    }
    return voicePreviewData?.contactoNombre ?? voicePreviewData?.vinculo ?? null;
  };

  /** API para VoiceFABOnly (dentro de modales): invocar al cargar cada modal */
  voiceOverlayApiRef.current.handleMicPress = handleMicPress;
  voiceOverlayApiRef.current.selectTipo = (tipo) => {
    setVoiceSelectedTipo(tipo);
    setSemicircleMenuVisible(false);
    setModalModoVisible(true);
  };
  voiceOverlayApiRef.current.closeMenu = () => setSemicircleMenuVisible(false);

  return (
    <>
      {/* Sin overlay a pantalla completa: solo regiones concretas para que los toques fuera del micrófono lleguen al contenido */}
      {/* Franja roja grabando - solo ocupa la parte superior */}
      {voiceRecording && !modalGrabacionVisible && (
        <View style={[styles.recordingBarWrapper, { paddingTop: topInset }]} pointerEvents="auto">
          <View style={styles.recordingBar}>
            <Animated.View style={[styles.recordingDot, { transform: [{ scale: recordingPulseAnim }] }]} />
            <Text style={styles.recordingText}>Grabando...</Text>
            <Text style={styles.recordingTime}>{formatRecordingTime(recordingElapsed)}</Text>
            <Text style={styles.recordingHint}>Toca el micrófono para enviar</Text>
          </View>
        </View>
      )}

      {/* Contenedor solo para el FAB (esquina inferior derecha); oculto si un modal con su propio FAB está abierto */}
      {showFloatingButtons && !modalWithVoiceOpen && !modalGrabacionVisible && !semicircleMenuVisible && (
        <View style={[styles.fabContainer, { bottom: bottomInset }]} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.floatingMainFab, (voiceRecording || sendingVoice) && { opacity: 0.95 }]}
            onPress={handleMicPress}
            activeOpacity={0.8}
            disabled={sendingVoice}
          >
            <View style={styles.floatingMainFabInner}>
              {sendingVoice ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name={voiceRecording ? 'stop' : 'mic'} size={28} color="white" />
                  <Ionicons name="star" size={12} color="#FFD700" style={{ position: 'absolute', top: -2, right: -2 }} />
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Menú semicircular abierto: overlay a pantalla completa solo aquí para capturar "tap fuera" y cerrar */}
      {semicircleMenuVisible && showFloatingButtons && !modalWithVoiceOpen && (
        <Pressable
          style={styles.fullScreenOverlay}
          onPress={closeFabMenu}
        >
          <View
            style={[
              styles.semicircleMenu,
              { bottom: bottomInset + 8 },
            ]}
            pointerEvents="box-none"
          >
            {OPCIONES_TIPO.map((op) => (
              <TouchableOpacity
                key={op.id}
                style={styles.semicircleMenuItem}
                onPress={() => onSelectTipoFromMenu(op.id)}
                activeOpacity={0.8}
              >
                <View style={styles.semicircleMenuIconWrap}>
                  <Ionicons name={op.icon} size={20} color="white" />
                </View>
                <Text style={styles.semicircleMenuLabel} numberOfLines={1}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* FAB visible también cuando el menú está abierto (misma posición, amarillo) */}
          <View style={[styles.fabContainer, { bottom: bottomInset }]} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.floatingMainFab}
              onPress={handleMicPress}
              activeOpacity={0.8}
              disabled={sendingVoice}
            >
              <View style={[styles.floatingMainFabInner, { backgroundColor: COLORES.atencion }]}>
                <Ionicons name="mic" size={28} color="white" />
                <Ionicons name="star" size={12} color="#FFD700" style={{ position: 'absolute', top: -2, right: -2 }} />
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}

      {/* Modal "¿Cómo agregar?": Nota de voz | Escribir (tras elegir Huella/Atención/Desahogo) */}
      <Modal
        visible={modalModoVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalModoVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalModoVisible(false)}>
          <View style={[styles.modalVoicePreviewContent, { maxHeight: 320 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalVoicePreviewHeader}>
              <Text style={styles.modalVoicePreviewTitle}>
                {voiceSelectedTipo === 'gesto' ? 'Huella' : voiceSelectedTipo === 'momento' ? 'Atención' : 'Desahogo'}
              </Text>
              <TouchableOpacity onPress={() => setModalModoVisible(false)}>
                <Ionicons name="close" size={24} color={COLORES.texto} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalVoicePreviewText, { marginHorizontal: 20, marginBottom: 16 }]}>
              ¿Cómo quieres agregarlo?
            </Text>
            <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 20 }}>
              <TouchableOpacity
                style={[styles.modalVoicePreviewPlayButton, { paddingVertical: 16 }]}
                onPress={onElegirNotaDeVoz}
                activeOpacity={0.8}
              >
                <Ionicons name="mic" size={24} color="white" />
                <Text style={styles.modalVoicePreviewPlayButtonText}>Nota de voz</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalVoicePreviewPlayButton, { paddingVertical: 16, backgroundColor: COLORES.textoSecundario }]}
                onPress={onElegirEscribir}
                activeOpacity={0.8}
              >
                <Ionicons name="create-outline" size={24} color="white" />
                <Text style={styles.modalVoicePreviewPlayButtonText}>Escribir...</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Modal de grabación: micrófono grande, indicador de grabación, botón parar (en vez de barra roja) */}
      <Modal
        visible={modalGrabacionVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {}}
      >
        <View style={[styles.modalOverlay, { justifyContent: 'center' }]}>
          <View style={styles.modalGrabacionContent}>
            <Text style={styles.modalGrabacionTitle}>
              {voiceSelectedTipo === 'gesto' ? 'Huella' : voiceSelectedTipo === 'momento' ? 'Atención' : 'Desahogo'}
            </Text>
            <View style={styles.modalGrabacionMicWrap}>
              <Animated.View style={[styles.modalGrabacionMicCircle, { transform: [{ scale: recordingPulseAnim }] }]}>
                <Ionicons name="mic" size={72} color="white" />
              </Animated.View>
            </View>
            {voiceRecording && (
              <>
                <View style={styles.modalGrabacionIndicador}>
                  <Animated.View style={[styles.modalGrabacionDot, { transform: [{ scale: recordingPulseAnim }] }]} />
                  <Text style={styles.modalGrabacionGrabando}>Grabando</Text>
                  <Text style={styles.modalGrabacionTiempo}>{formatRecordingTime(recordingElapsed)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.modalGrabacionStop}
                  onPress={handleMicPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="stop" size={36} color="white" />
                  <Text style={styles.modalVoicePreviewPlayButtonText}>Parar de grabar</Text>
                </TouchableOpacity>
              </>
            )}
            {!voiceRecording && !sendingVoice && modalGrabacionVisible && (
              <Text style={[styles.modalVoicePreviewText, { marginTop: 12 }]}>Iniciando grabación...</Text>
            )}
            {!voiceRecording && sendingVoice && (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <ActivityIndicator size="large" color={COLORES.agua} />
                <Text style={[styles.modalVoicePreviewText, { marginTop: 12 }]}>Subiendo nota...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal preview nota de voz global */}
      <Modal
        visible={modalVoicePreviewVisible}
        animationType="slide"
        transparent
        onRequestClose={closeVoicePreview}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalVoicePreviewContent}>
            <View style={styles.modalVoicePreviewHeader}>
              <Text style={styles.modalVoicePreviewTitle}>{voicePreviewData ? 'Preview de la nota' : 'Nota grabada'}</Text>
              <TouchableOpacity onPress={closeVoicePreview}>
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
                      {voiceSelectedTipo === 'desahogo' ? (
                        <Text style={styles.modalVoicePreviewText}>{voicePreviewTranscription || '—'}</Text>
                      ) : (
                        <TextInput
                          style={styles.modalVoicePreviewTextInput}
                          value={voicePreviewEditedText}
                          onChangeText={setVoicePreviewEditedText}
                          placeholder="Edita el texto antes de guardar"
                          multiline
                          numberOfLines={4}
                        />
                      )}
                    </>
                  )}
                </>
              )}
              {voicePreviewData && voiceSelectedTipo !== 'desahogo' && (
                <>
                  <Text style={[styles.modalVoicePreviewLabel, { marginTop: 8 }]}>¿Con quién?</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 12 }}>
                    {vinculos.map((c) => (
                      <TouchableOpacity
                        key={c._id}
                        onPress={() => setVoicePreviewSelectedContactId(getVoicePreviewContactoId() === c._id ? null : c._id)}
                        style={[
                          { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 2 },
                          getVoicePreviewContactoId() === c._id ? { borderColor: COLORES.agua, backgroundColor: COLORES.aguaClaro } : { borderColor: COLORES.burbujaBorde, backgroundColor: COLORES.fondo },
                        ]}
                      >
                        <Text style={{ fontSize: 14, color: COLORES.texto }} numberOfLines={1}>{c.nombre || 'Sin nombre'}</Text>
                      </TouchableOpacity>
                    ))}
                    {vinculos.length === 0 && (
                      <Text style={[styles.modalVoicePreviewText, { fontStyle: 'italic' }]}>Cargando contactos...</Text>
                    )}
                  </View>
                  <Text style={[styles.modalVoicePreviewLabel, { marginTop: 4, fontWeight: '700' }]}>Así se verá tu {voiceSelectedTipo === 'gesto' ? 'huella' : 'momento'}</Text>
                  <View style={styles.previewGestoCard}>
                    <View style={styles.previewGestoHeader}>
                      <Text style={styles.previewGestoTipo} numberOfLines={1}>
                        {getGestoConfig(voicePreviewData.clasificacion).emoji} {getGestoConfig(voicePreviewData.clasificacion).actionLabel ?? voicePreviewData.clasificacion}
                      </Text>
                      <Text style={styles.previewGestoContacto} numberOfLines={1}>
                        {getVoicePreviewContactoNombre() || 'Elige un contacto'}
                      </Text>
                    </View>
                    <Text style={styles.previewGestoDescripcion} numberOfLines={3}>
                      {voicePreviewEditedText || voicePreviewData.descripcion || voicePreviewData.texto || voicePreviewTranscription || '—'}
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
                      is24Hour={false}
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
              {voiceSelectedTipo === 'desahogo' && voicePreviewTranscription != null && (
                <>
                  <TouchableOpacity
                    style={[styles.modalVoicePreviewButton, styles.modalVoicePreviewButtonRefugio]}
                    onPress={() => {
                      closeVoicePreview();
                      navigationRef?.current?.navigate('Mi Refugio', { refreshDesahogos: true });
                    }}
                  >
                    <Ionicons name="document-text-outline" size={22} color="white" />
                    <Text style={styles.modalVoicePreviewButtonText}>Ver Mi Refugio</Text>
                  </TouchableOpacity>
                </>
              )}
              {voiceSelectedTipo === 'gesto' && voicePreviewData && (
                <TouchableOpacity
                  style={[styles.modalVoicePreviewButton, styles.modalVoicePreviewButtonTask, !getVoicePreviewContactoId() && { opacity: 0.6 }]}
                  disabled={!getVoicePreviewContactoId()}
                  onPress={async () => {
                    if (!voicePreviewTempId) {
                      Alert.alert('Error', 'Error de conexión. No se pudo subir la nota.');
                      return;
                    }
                    const contactoId = getVoicePreviewContactoId();
                    if (!contactoId) {
                      Alert.alert('Elige un contacto', 'Selecciona con quién es esta huella en la lista de arriba.');
                      return;
                    }
                    const textoTranscripcion = (voicePreviewEditedText || voicePreviewTranscription || '').trim();
                    if (!textoTranscripcion) {
                      Alert.alert('Aviso', 'No hay texto para guardar.');
                      return;
                    }
                    try {
                      const clasificacion = TIPOS_DE_GESTO_DISPLAY.includes(voicePreviewData?.clasificacion) ? voicePreviewData.clasificacion : 'Otro';
                      let fechaEjecucion = voicePreviewFechaEjecucion && !isNaN(voicePreviewFechaEjecucion.getTime()) ? voicePreviewFechaEjecucion : new Date();
                      if (fechaEjecucion.getTime() < Date.now()) fechaEjecucion = new Date();
                      await saveTaskFromVoice(contactoId, voicePreviewTempId, fechaEjecucion, clasificacion, textoTranscripcion);
                      if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                      closeVoicePreview();
                      navigationRef?.current?.navigate('Atenciones', { refreshGestos: true });
                      Alert.alert('Atención guardada', 'Tu atención se guardó correctamente.', [
                        { text: 'Ver atenciones', onPress: () => navigationRef?.current?.navigate('Atenciones', { refreshGestos: true }) },
                        { text: 'Cerrar', style: 'cancel' },
                      ]);
                    } catch (e) {
                      Alert.alert('Error', e.message || 'No se pudo guardar.');
                    }
                  }}
                >
                  <Ionicons name="footsteps-outline" size={22} color="white" />
                  <Text style={styles.modalVoicePreviewButtonText}>Guardar como huella</Text>
                </TouchableOpacity>
              )}
              {voiceSelectedTipo === 'momento' && voicePreviewData && (
                <TouchableOpacity
                  style={[styles.modalVoicePreviewButton, styles.modalVoicePreviewButtonInteraction, !getVoicePreviewContactoId() && { opacity: 0.6 }]}
                  disabled={!getVoicePreviewContactoId()}
                  onPress={async () => {
                    if (!voicePreviewTempId) {
                      Alert.alert('Error', 'Error de conexión. No se pudo subir la nota.');
                      return;
                    }
                    const contactoId = getVoicePreviewContactoId();
                    if (!contactoId) {
                      Alert.alert('Elige un contacto', 'Selecciona con quién es este momento en la lista de arriba.');
                      return;
                    }
                    const textoTranscripcion = (voicePreviewEditedText || voicePreviewTranscription || '').trim();
                    if (!textoTranscripcion) {
                      Alert.alert('Aviso', 'No hay texto para guardar.');
                      return;
                    }
                    try {
                      const { contacto } = await saveInteractionFromVoice(contactoId, voicePreviewTempId, textoTranscripcion);
                      if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                      closeVoicePreview();
                      Alert.alert('Momento guardado', 'Se guardó como huella (momento).', [
                        { text: 'Ver Huellas', onPress: () => navigationRef?.current?.navigate('Huellas') },
                        { text: 'Ver en Vínculos', onPress: () => navigationRef?.current?.navigate('Vínculos', { openContactId: contactoId, openContact: contacto }) },
                        { text: 'Cerrar', style: 'cancel' },
                      ]);
                    } catch (e) {
                      Alert.alert('Error', e.message || 'No se pudo guardar.');
                    }
                  }}
                >
                  <Ionicons name="sparkles" size={22} color="white" />
                  <Text style={styles.modalVoicePreviewButtonText}>Guardar como momento</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.modalVoicePreviewCancel} onPress={closeVoicePreview}>
                <Text style={styles.modalVoicePreviewCancelText}>{voicePreviewData || voicePreviewTranscription ? 'Cancelar' : 'Cerrar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal escribir (lápiz): Gesto, Momento o Desahogo desde texto */}
      <Modal
        visible={voiceWriteModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setVoiceWriteModalVisible(false);
          setVoiceSelectedTipo(null);
          setVoiceWriteText('');
          setVoiceWriteContactoId(null);
          setVoiceWriteFecha(new Date());
          setShowDatePickerWrite(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalVoicePreviewContent}>
            <View style={styles.modalVoicePreviewHeader}>
              <Text style={styles.modalVoicePreviewTitle}>
                Escribir {voiceSelectedTipo === 'gesto' ? 'huella' : voiceSelectedTipo === 'momento' ? 'momento' : 'desahogo'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setVoiceWriteModalVisible(false);
                  setVoiceSelectedTipo(null);
                  setVoiceWriteText('');
                  setVoiceWriteContactoId(null);
                  setVoiceWriteFecha(new Date());
                  setShowDatePickerWrite(false);
                }}
              >
                <Ionicons name="close" size={24} color={COLORES.texto} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
                <Text style={styles.modalVoicePreviewLabel}>Texto</Text>
                <TextInput
                  style={[styles.modalVoicePreviewTextInput, { minHeight: 100 }]}
                  value={voiceWriteText}
                  onChangeText={setVoiceWriteText}
                  placeholder={
                    voiceSelectedTipo === 'desahogo'
                      ? 'Escribe tu desahogo...'
                      : voiceSelectedTipo === 'gesto'
                        ? 'Qué quieres hacer (ej.: Llamar a María mañana)'
                        : 'Qué pasó (ej.: Almorzamos con Juan ayer)'
                  }
                  multiline
                  numberOfLines={4}
                  editable={true}
                />
                {(voiceSelectedTipo === 'gesto' || voiceSelectedTipo === 'momento') && (
                  <>
                    <Text style={[styles.modalVoicePreviewLabel, { marginTop: 16 }]}>¿Con quién?</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                      {vinculos.map((c) => (
                        <TouchableOpacity
                          key={c._id}
                          onPress={() => setVoiceWriteContactoId(voiceWriteContactoId === c._id ? null : c._id)}
                          style={[
                            { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 2 },
                            voiceWriteContactoId === c._id ? { borderColor: COLORES.agua, backgroundColor: COLORES.aguaClaro } : { borderColor: COLORES.burbujaBorde, backgroundColor: COLORES.fondo },
                          ]}
                        >
                          <Text style={{ fontSize: 14, color: COLORES.texto }} numberOfLines={1}>{c.nombre || 'Sin nombre'}</Text>
                        </TouchableOpacity>
                      ))}
                      {vinculos.length === 0 && (
                        <Text style={[styles.modalVoicePreviewText, { fontStyle: 'italic' }]}>Cargando contactos...</Text>
                      )}
                    </View>
                    <Text style={[styles.modalVoicePreviewLabel, { marginTop: 16 }]}>
                      {voiceSelectedTipo === 'gesto' ? 'Fecha y hora de ejecución' : 'Fecha y hora'}
                    </Text>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORES.burbujaBorde, backgroundColor: COLORES.fondo }}
                      onPress={() => {
                        setDatePickerModeWrite('date');
                        setShowDatePickerWrite(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="calendar-outline" size={20} color={COLORES.agua} style={{ marginRight: 8 }} />
                      <Text style={{ fontSize: 14, color: COLORES.texto }}>
                        {voiceWriteFecha.toLocaleDateString('es-ES')} · {formatTime12h(voiceWriteFecha)}
                      </Text>
                    </TouchableOpacity>
                    {showDatePickerWrite && (
                      <DateTimePicker
                        value={voiceWriteFecha}
                        mode={datePickerModeWrite}
                        minimumDate={voiceSelectedTipo === 'gesto' ? new Date() : undefined}
                        is24Hour={false}
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(e, d) => {
                          if (e.type === 'dismissed') {
                            setShowDatePickerWrite(false);
                            return;
                          }
                          const next = d || voiceWriteFecha;
                          if (datePickerModeWrite === 'date') {
                            setVoiceWriteFecha(next);
                            if (Platform.OS === 'android') {
                              setShowDatePickerWrite(false);
                              setTimeout(() => { setDatePickerModeWrite('time'); setShowDatePickerWrite(true); }, 100);
                            } else {
                              setDatePickerModeWrite('time');
                            }
                          } else {
                            setVoiceWriteFecha(next);
                            setShowDatePickerWrite(false);
                          }
                        }}
                      />
                    )}
                  </>
                )}
              </View>
            </ScrollView>
            <View style={[styles.modalVoicePreviewActions, { paddingTop: 8 }]}>
              <TouchableOpacity
                style={[
                  styles.modalVoicePreviewButton,
                  styles.modalVoicePreviewButtonTask,
                  (!voiceWriteText.trim() || ((voiceSelectedTipo === 'gesto' || voiceSelectedTipo === 'momento') && !voiceWriteContactoId)) && { opacity: 0.6 },
                ]}
                disabled={voiceWriteSaving || !voiceWriteText.trim() || ((voiceSelectedTipo === 'gesto' || voiceSelectedTipo === 'momento') && !voiceWriteContactoId)}
                onPress={async () => {
                  const texto = voiceWriteText.trim();
                  if (!texto) return;
                  if ((voiceSelectedTipo === 'gesto' || voiceSelectedTipo === 'momento') && !voiceWriteContactoId) {
                    Alert.alert('Elige un contacto', 'Selecciona con quién es esta huella o momento.');
                    return;
                  }
                  setVoiceWriteSaving(true);
                  try {
                    if (voiceSelectedTipo === 'desahogo') {
                      await saveDesahogoFromText(texto);
                      setVoiceWriteModalVisible(false);
                      setVoiceSelectedTipo(null);
                      setVoiceWriteText('');
                      setVoiceWriteContactoId(null);
                      navigationRef?.current?.navigate('Mi Refugio', { refreshDesahogos: true });
                      Alert.alert('Guardado en Mi Refugio', 'Tu desahogo se guardó. Solo tú puedes verlo.', [
                        { text: 'Ver Mi Refugio', onPress: () => navigationRef?.current?.navigate('Mi Refugio', { refreshDesahogos: true }) },
                        { text: 'Cerrar', style: 'cancel' },
                      ]);
                    } else if (voiceSelectedTipo === 'gesto') {
                      await saveTaskFromText(voiceWriteContactoId, texto, voiceWriteFecha, 'Otro');
                      setVoiceWriteModalVisible(false);
                      setVoiceSelectedTipo(null);
                      setVoiceWriteText('');
                      setVoiceWriteContactoId(null);
                      setVoiceWriteFecha(new Date());
                      navigationRef?.current?.navigate('Atenciones', { refreshGestos: true });
                      Alert.alert('Atención guardada', 'Tu atención se guardó correctamente.', [
                        { text: 'Ver atenciones', onPress: () => navigationRef?.current?.navigate('Atenciones', { refreshGestos: true }) },
                        { text: 'Cerrar', style: 'cancel' },
                      ]);
                    } else if (voiceSelectedTipo === 'momento') {
                      await saveInteractionFromText(voiceWriteContactoId, texto, voiceWriteFecha);
                      setVoiceWriteModalVisible(false);
                      setVoiceSelectedTipo(null);
                      setVoiceWriteText('');
                      setVoiceWriteContactoId(null);
                      setVoiceWriteFecha(new Date());
                      Alert.alert('Momento guardado', 'Se guardó como huella (momento).', [
                        { text: 'Ver Huellas', onPress: () => navigationRef?.current?.navigate('Huellas') },
                        { text: 'Ver en Vínculos', onPress: () => navigationRef?.current?.navigate('Vínculos', { openContactId: voiceWriteContactoId }) },
                        { text: 'Cerrar', style: 'cancel' },
                      ]);
                    }
                  } catch (e) {
                    Alert.alert('Error', e.message || 'No se pudo guardar.');
                  } finally {
                    setVoiceWriteSaving(false);
                  }
                }}
              >
                {voiceWriteSaving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalVoicePreviewButtonText}>Guardar</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalVoicePreviewCancel}
                onPress={() => {
                  setVoiceWriteModalVisible(false);
                  setVoiceSelectedTipo(null);
                  setVoiceWriteText('');
                  setVoiceWriteContactoId(null);
                  setVoiceWriteFecha(new Date());
                  setShowDatePickerWrite(false);
                }}
              >
                <Text style={styles.modalVoicePreviewCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  /** Contenedor pequeño solo para el FAB (esquina inferior derecha); no cubre toda la pantalla para que los toques pasen */
  fabContainer: {
    position: 'absolute',
    right: 0,
    width: 100,
    height: 90,
    zIndex: 2147483647,
    elevation: 999999,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  /** Overlay a pantalla completa solo cuando el menú semicircular está abierto (tap fuera = cerrar) */
  fullScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2147483647,
    elevation: 999999,
  },
  recordingBarWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2147483647,
    elevation: 999999,
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
  floatingMic: {
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
  },
  floatingPlus: {
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
  },
  floatingHistorial: {
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
    elevation: 10,
  },
  floatingSwipe: {
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
    elevation: 10,
  },
  floatingButtonSwipeInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORES.agua,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORES.agua,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
  },
  floatingMainFab: {
    position: 'absolute',
    bottom: 8,
    right: 20,
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 2147483647,
    elevation: 999999,
  },
  floatingMainFabInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORES.agua,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  floatingButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORES.agua,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
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
  semicircleMenu: {
    position: 'absolute',
    right: 92,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 6,
  },
  semicircleMenuItem: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORES.agua,
    borderWidth: 1,
    borderColor: COLORES.aguaOscuro,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  semicircleMenuIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  semicircleMenuLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: 'white',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
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
    borderBottomColor: '#E1E8ED',
  },
  modalVoicePreviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORES.texto,
  },
  modalVoicePreviewBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 320,
  },
  modalVoicePreviewText: {
    fontSize: 14,
    color: COLORES.texto,
    marginBottom: 8,
  },
  modalVoicePreviewTextInput: {
    fontSize: 14,
    color: COLORES.texto,
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 8,
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
  modalVoicePreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    marginTop: 12,
    marginBottom: 4,
  },
  modalVoicePreviewDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: COLORES.fondoSecundario || '#f0f2f5',
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  modalVoicePreviewDateText: {
    fontSize: 15,
    color: COLORES.texto,
  },
  modalVoicePreviewPlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORES.agua,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  modalVoicePreviewPlayButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalVoicePreviewActions: {
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E1E8ED',
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
  modalGrabacionContent: {
    backgroundColor: COLORES.fondo,
    marginHorizontal: 24,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    minHeight: 280,
  },
  modalGrabacionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORES.texto,
    marginBottom: 20,
  },
  modalGrabacionMicWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORES.agua,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: COLORES.agua,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  modalGrabacionMicCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORES.agua,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGrabacionIndicador: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  modalGrabacionGrabando: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORES.texto,
  },
  modalGrabacionTiempo: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    color: COLORES.textoSecundario,
  },
  modalGrabacionStop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#C62828',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
    minWidth: 220,
  },
  modalGrabacionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#C62828',
  },
});
