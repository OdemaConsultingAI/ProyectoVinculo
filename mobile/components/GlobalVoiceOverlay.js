import React, { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceGlobal } from '../context/VoiceGlobalContext';
import { COLORES } from '../constants/colores';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { startRecording, stopRecording, playPreviewUri, uploadVoiceTemp, deleteVoiceTemp, transcribeVoiceTemp } from '../services/voiceToTaskService';
import { loadContacts, saveInteractionFromVoice, saveTaskFromVoice, saveDesahogoFromVoice } from '../services/syncService';
import { normalizeForMatch } from '../utils/validations';

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
  } = useVoiceGlobal();

  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const recordingPulseAnim = useRef(new Animated.Value(1)).current;
  const recordingActiveRef = useRef(false);
  const transcribeGenRef = useRef(0);
  const [vinculos, setVinculos] = useState([]);
  const [voicePreviewFechaEjecucion, setVoicePreviewFechaEjecucion] = useState(() => new Date());
  const [showDatePickerVoice, setShowDatePickerVoice] = useState(false);
  const [datePickerModeVoice, setDatePickerModeVoice] = useState('date');
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

  // Transcribir cuando se abre el modal (ignorar respuestas obsoletas si el efecto se disparó dos veces)
  useEffect(() => {
    if (!modalVoicePreviewVisible || !voicePreviewTempId) return;
    const gen = ++transcribeGenRef.current;
    setVoiceTranscribing(true);
    setVoicePreviewTranscription(null);
    transcribeVoiceTemp(voicePreviewTempId).then((result) => {
      setVoiceTranscribing(false);
      if (gen !== transcribeGenRef.current) return;
      if (result.success) {
        setVoicePreviewTranscription(result.texto || '');
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
  }, [modalVoicePreviewVisible, voicePreviewTempId]);

  // Cargar contactos cuando el modal está visible (loadContacts devuelve { contactos }, no el array)
  useEffect(() => {
    if (!modalVoicePreviewVisible) return;
    loadContacts()
      .then((res) => setVinculos(Array.isArray(res?.contactos) ? res.contactos : []))
      .catch(() => setVinculos([]));
  }, [modalVoicePreviewVisible]);

  const formatRecordingTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleMicPress = async () => {
    if (sendingVoice) return;
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
      return;
    }
    const { recording, error: startErr } = await startRecording();
    if (startErr) {
      Alert.alert('Micrófono', startErr);
      return;
    }
    setVoiceRecording(recording);
  };

  const handlePlusPress = () => {
    if (currentRouteName === 'Vínculos') {
      navigationRef?.current?.navigate('Vínculos', { openRegar: true });
    } else if (currentRouteName === 'Gestos') {
      navigationRef?.current?.navigate('Gestos', { openCrearGesto: true });
    }
  };

  const handleHistorialPress = () => {
    navigationRef?.current?.navigate('Gestos', { openHistorialGestos: true });
  };

  const handleSwipePress = () => {
    navigationRef?.current?.navigate('Vínculos', { openSwipeMode: true });
  };

  const showFloatingButtons = currentRouteName !== 'Configuración';
  const showHistorialButton = currentRouteName === 'Gestos';
  const showSwipeButton = currentRouteName === 'Vínculos';

  const closeVoicePreview = async () => {
    if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
    setModalVoicePreviewVisible(false);
    setVoicePreviewData(null);
    setVoicePreviewAudioUri(null);
    setVoicePreviewTempId(null);
    setVoicePreviewTranscription(null);
    setVoiceTranscribing(false);
    setVoicePreviewContactoFromModal(null);
  };

  return (
    <>
      {/* Overlay sin Modal: botones + y micrófono y franja roja encima; pointerEvents="box-none" para que el resto de la pantalla sea tocable */}
      <View style={styles.overlay} pointerEvents="box-none" collapsable={false}>
        {/* Franja roja grabando - siempre encima de todo */}
        {voiceRecording && (
          <View style={[styles.recordingBarWrapper, { paddingTop: topInset }]} pointerEvents="auto">
            <View style={styles.recordingBar}>
              <Animated.View style={[styles.recordingDot, { transform: [{ scale: recordingPulseAnim }] }]} />
              <Text style={styles.recordingText}>Grabando...</Text>
              <Text style={styles.recordingTime}>{formatRecordingTime(recordingElapsed)}</Text>
              <Text style={styles.recordingHint}>Toca el micrófono para enviar</Text>
            </View>
          </View>
        )}

        {/* Botones + y micrófono: ocultos en Configuración; + abre interacción (Vínculos) o gesto (Gestos) */}
        {showFloatingButtons && (
          <>
            <TouchableOpacity
              style={[styles.floatingMic, { bottom: bottomInset + 168 }, (voiceRecording || sendingVoice) && { opacity: 0.95 }]}
              onPress={handleMicPress}
              activeOpacity={0.8}
              disabled={sendingVoice}
            >
              <View style={styles.floatingButtonInner}>
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
            <TouchableOpacity style={[styles.floatingPlus, { bottom: bottomInset + 96 }]} onPress={handlePlusPress} activeOpacity={0.8}>
              <View style={styles.floatingButtonRegarInner}>
                <Ionicons name="add-circle" size={26} color="white" />
              </View>
            </TouchableOpacity>
            {showSwipeButton && (
              <TouchableOpacity style={[styles.floatingSwipe, { bottom: bottomInset + 24 }]} onPress={handleSwipePress} activeOpacity={0.8}>
                <View style={styles.floatingButtonSwipeInner}>
                  <Ionicons name="swap-horizontal" size={24} color="white" />
                </View>
              </TouchableOpacity>
            )}
            {showHistorialButton && (
              <TouchableOpacity style={[styles.floatingHistorial, { bottom: bottomInset + 24 }]} onPress={handleHistorialPress} activeOpacity={0.8}>
                <View style={styles.floatingButtonRegarInner}>
                  <Ionicons name="time-outline" size={24} color="white" />
                </View>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

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
                      <Text style={styles.modalVoicePreviewText}>{voicePreviewTranscription || '—'}</Text>
                    </>
                  )}
                </>
              )}
              {voicePreviewData && (
                <>
                  <Text style={[styles.modalVoicePreviewLabel, { marginTop: 8, fontWeight: '700' }]}>Así se verá tu gesto</Text>
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
                          {voicePreviewFechaEjecucion.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {voicePreviewFechaEjecucion.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
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
                      voicePreviewData.tipo === 'tarea' && styles.modalVoicePreviewButtonSuggested,
                    ]}
                    onPress={async () => {
                      if (!voicePreviewTempId) {
                        Alert.alert('Error', 'Error de conexión. No se pudo subir la nota. Comprueba tu internet e intenta de nuevo.');
                        return;
                      }
                      let contactoId = voicePreviewData?.contactoId ?? voicePreviewContactoFromModal?.id;
                      let lista = vinculos;
                      if (!contactoId && voicePreviewData?.contactoNombre && Array.isArray(lista)) {
                        const porNombre = lista.find(c => normalizeForMatch(c.nombre) === normalizeForMatch(voicePreviewData.contactoNombre));
                        if (porNombre?._id) contactoId = porNombre._id;
                      }
                      if (!contactoId && voicePreviewData?.contactoNombre) {
                        try {
                          const res = await loadContacts();
                          lista = Array.isArray(res?.contactos) ? res.contactos : [];
                          setVinculos(lista);
                          const porNombre = lista.find(c => normalizeForMatch(c.nombre) === normalizeForMatch(voicePreviewData.contactoNombre));
                          if (porNombre?._id) contactoId = porNombre._id;
                        } catch (_) {}
                      }
                      if (!contactoId) {
                        const nombre = voicePreviewData?.contactoNombre || voicePreviewData?.vinculo || '';
                        Alert.alert('Aviso', nombre
                          ? `No se pudo asignar el contacto. Comprueba que "${nombre}" está en tu lista de vínculos con ese nombre.`
                          : 'No hay contacto asignado. La transcripción no identificó a nadie; abre un contacto antes de grabar o menciona el nombre en la nota.');
                        return;
                      }
                      const contact = lista.find(c => c._id === contactoId) || vinculos.find(c => c._id === contactoId);
                      if (!contact) {
                        Alert.alert('Error', 'Contacto no encontrado. Actualiza la lista de vínculos (arrastra para actualizar).');
                        return;
                      }
                      try {
                        const textoTranscripcion = (voicePreviewData.texto || voicePreviewTranscription || '').trim();
                        if (!textoTranscripcion) {
                          Alert.alert('Aviso', 'No hay texto para guardar. Asegúrate de que la transcripción se completó.');
                          return;
                        }
                        const clasificacion = TIPOS_DE_GESTO_DISPLAY.includes(voicePreviewData?.clasificacion) ? voicePreviewData.clasificacion : 'Otro';
                        let fechaEjecucion = voicePreviewFechaEjecucion && !isNaN(voicePreviewFechaEjecucion.getTime()) ? voicePreviewFechaEjecucion : new Date();
                        if (fechaEjecucion.getTime() < Date.now()) fechaEjecucion = new Date();
                        await saveTaskFromVoice(contactoId, voicePreviewTempId, fechaEjecucion, clasificacion, textoTranscripcion);
                        if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                        closeVoicePreview();
                        navigationRef?.current?.navigate('Gestos', { refreshGestos: true });
                        Alert.alert(
                          'Gesto guardado',
                          'Tu gesto se guardó correctamente. Ya está en la lista.',
                          [
                            { text: 'Ver gestos', onPress: () => navigationRef?.current?.navigate('Gestos', { refreshGestos: true }) },
                            { text: 'Cerrar', style: 'cancel' },
                          ]
                        );
                      } catch (e) {
                        const isNetwork = !e.message || /red|conexión|network|timeout|fetch/i.test(String(e.message));
                        Alert.alert('Error', isNetwork ? 'Error de conexión. Comprueba internet e intenta de nuevo.' : (e.message || 'No se pudo guardar.'));
                      }
                    }}
                  >
                    <Ionicons name="checkmark-done-outline" size={22} color="white" />
                    <Text style={styles.modalVoicePreviewButtonText}>Guardar como gesto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalVoicePreviewButton, styles.modalVoicePreviewButtonInteraction]}
                    onPress={async () => {
                      if (!voicePreviewTempId) {
                        Alert.alert('Error', 'Error de conexión. No se pudo subir la nota. Comprueba tu internet e intenta de nuevo.');
                        return;
                      }
                      let contactoId = voicePreviewData?.contactoId ?? voicePreviewContactoFromModal?.id;
                      let lista = vinculos;
                      if (!contactoId && voicePreviewData?.contactoNombre && Array.isArray(lista)) {
                        const porNombre = lista.find(c => normalizeForMatch(c.nombre) === normalizeForMatch(voicePreviewData.contactoNombre));
                        if (porNombre?._id) contactoId = porNombre._id;
                      }
                      if (!contactoId && voicePreviewData?.contactoNombre) {
                        try {
                          const res = await loadContacts();
                          lista = Array.isArray(res?.contactos) ? res.contactos : [];
                          setVinculos(lista);
                          const porNombre = lista.find(c => normalizeForMatch(c.nombre) === normalizeForMatch(voicePreviewData.contactoNombre));
                          if (porNombre?._id) contactoId = porNombre._id;
                        } catch (_) {}
                      }
                      if (!contactoId) {
                        const nombre = voicePreviewData?.contactoNombre || voicePreviewData?.vinculo || '';
                        Alert.alert('Aviso', nombre
                          ? `No se pudo asignar el contacto. Comprueba que "${nombre}" está en tu lista de vínculos con ese nombre.`
                          : 'No hay contacto asignado. La transcripción no identificó a nadie; abre un contacto antes de grabar o menciona el nombre en la nota.');
                        return;
                      }
                      const contact = lista.find(c => c._id === contactoId) || vinculos.find(c => c._id === contactoId);
                      if (!contact) {
                        Alert.alert('Error', 'Contacto no encontrado. Actualiza la lista de vínculos (arrastra para actualizar).');
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
                        closeVoicePreview();
                        Alert.alert(
                          'Momento guardado',
                          'Se guardó como texto. Toca "Ver momentos" para verlo.',
                          [
                            { text: 'Ver momentos', onPress: () => navigationRef?.current?.navigate('Vínculos', { openContactId: contactoId, openContact: contacto }) },
                            { text: 'Cerrar', style: 'cancel' }
                          ]
                        );
                      } catch (e) {
                        const isNetwork = !e.message || /red|conexión|network|timeout|fetch/i.test(String(e.message));
                        Alert.alert('Error', isNetwork ? 'Error de conexión. Comprueba internet e intenta de nuevo.' : (e.message || 'No se pudo guardar.'));
                      }
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={22} color="white" />
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
                        closeVoicePreview();
                        navigationRef?.current?.navigate('Mi Refugio', { refreshDesahogos: true });
                        Alert.alert(
                          'Guardado en Mi Refugio',
                          'Tu desahogo se guardó. Solo tú puedes verlo.',
                          [
                            { text: 'Ver Mi Refugio', onPress: () => navigationRef?.current?.navigate('Mi Refugio', { refreshDesahogos: true }) },
                            { text: 'Cerrar', style: 'cancel' },
                          ]
                        );
                      } catch (e) {
                        const isNetwork = !e.message || /red|conexión|network|timeout|fetch/i.test(String(e.message));
                        Alert.alert('Error', isNetwork ? 'Error de conexión. Comprueba internet e intenta de nuevo.' : (e.message || 'No se pudo guardar en Mi Refugio.'));
                      }
                    }}
                  >
                    <Ionicons name="archive-outline" size={22} color="white" />
                    <Text style={styles.modalVoicePreviewButtonText}>Guardar como Desahogo</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={styles.modalVoicePreviewCancel} onPress={closeVoicePreview}>
                <Text style={styles.modalVoicePreviewCancelText}>{voicePreviewData ? 'Cancelar' : 'Cerrar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 99999,
    elevation: 99999,
  },
  recordingBarWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100000,
    elevation: 100000,
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
    backgroundColor: COLORES.urgente,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORES.urgente,
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
});
