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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceGlobal } from '../context/VoiceGlobalContext';
import { COLORES } from '../constants/colores';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { startRecording, stopRecording, playPreviewUri, uploadVoiceTemp, deleteVoiceTemp, transcribeVoiceTemp } from '../services/voiceToTaskService';
import { loadContacts, saveInteractionFromVoice, saveTaskFromVoice } from '../services/syncService';

import { TIPOS_DE_GESTO_DISPLAY } from '../constants/tiposDeGesto';
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
        setVoicePreviewData({
          texto: result.texto || '',
          tipo: result.tipo || 'tarea',
          vinculo: contactoNombre,
          tarea: result.tarea || '',
          descripcion: result.descripcion || result.tarea || '',
          fecha: result.fecha || new Date().toISOString().slice(0, 10),
          clasificacion: CLASIFICACIONES_TAREAS.includes(result.clasificacion) ? result.clasificacion : 'Otro',
          contactoId,
          contactoNombre,
        });
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

  // Cargar contactos cuando el modal está visible
  useEffect(() => {
    if (!modalVoicePreviewVisible) return;
    loadContacts().then(setVinculos).catch(() => setVinculos([]));
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
                  <Text style={styles.modalVoicePreviewLabel}>Dijiste:</Text>
                  <Text style={styles.modalVoicePreviewText}>{voicePreviewData.texto || '—'}</Text>
                  <Text style={styles.modalVoicePreviewLabel}>Contacto:</Text>
                  <Text style={styles.modalVoicePreviewText}>{voicePreviewData.contactoNombre || voicePreviewData.vinculo || 'Sin asignar'}</Text>
                  <Text style={styles.modalVoicePreviewLabel}>Clasificación:</Text>
                  <Text style={styles.modalVoicePreviewText}>{voicePreviewData.clasificacion || 'Otro'}</Text>
                  <Text style={styles.modalVoicePreviewLabel}>Gesto extraído:</Text>
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
                    style={[
                      styles.modalVoicePreviewButton,
                      styles.modalVoicePreviewButtonTask,
                      voicePreviewData.tipo === 'tarea' && styles.modalVoicePreviewButtonSuggested,
                    ]}
                    onPress={async () => {
                      if (!voicePreviewData?.contactoId || !voicePreviewTempId) {
                        Alert.alert('Aviso', 'No hay contacto asignado o nota temporal. Añade contactos y graba de nuevo.');
                        return;
                      }
                      const contact = vinculos.find(c => c._id === voicePreviewData.contactoId);
                      if (!contact) {
                        Alert.alert('Error', 'Contacto no encontrado. Actualiza la lista.');
                        return;
                      }
                      try {
                        const textoTranscripcion = (voicePreviewData.texto || voicePreviewTranscription || '').trim();
                        if (!textoTranscripcion) {
                          Alert.alert('Aviso', 'No hay texto para guardar. Asegúrate de que la transcripción se completó.');
                          return;
                        }
                        const fechaEjecucion = new Date(voicePreviewData.fecha);
                        const clasificacion = TIPOS_DE_GESTO_DISPLAY.includes(voicePreviewData.clasificacion) ? voicePreviewData.clasificacion : 'Otro';
                        await saveTaskFromVoice(voicePreviewData.contactoId, voicePreviewTempId, isNaN(fechaEjecucion.getTime()) ? new Date() : fechaEjecucion, clasificacion, textoTranscripcion);
                        if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                        closeVoicePreview();
                        Alert.alert('Listo', 'Gesto guardado (nota de voz).');
                      } catch (e) {
                        Alert.alert('Error', e.message || 'No se pudo guardar.');
                      }
                    }}
                  >
                    <Ionicons name="checkmark-done-outline" size={22} color="white" />
                    <Text style={styles.modalVoicePreviewButtonText}>Guardar como gesto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalVoicePreviewButton, styles.modalVoicePreviewButtonInteraction]}
                    onPress={async () => {
                      if (!voicePreviewData?.contactoId || !voicePreviewTempId) {
                        Alert.alert('Aviso', 'No hay contacto asignado o nota temporal. Añade contactos y graba de nuevo.');
                        return;
                      }
                      const contact = vinculos.find(c => c._id === voicePreviewData.contactoId);
                      if (!contact) {
                        Alert.alert('Error', 'Contacto no encontrado. Actualiza la lista.');
                        return;
                      }
                      try {
                        const textoTranscripcion = (voicePreviewData.texto || voicePreviewTranscription || '').trim();
                        if (!textoTranscripcion) {
                          Alert.alert('Aviso', 'No hay texto para guardar. Asegúrate de que la transcripción se completó.');
                          return;
                        }
                        const { contacto } = await saveInteractionFromVoice(voicePreviewData.contactoId, voicePreviewTempId, textoTranscripcion);
                        if (voicePreviewTempId) await deleteVoiceTemp(voicePreviewTempId);
                        closeVoicePreview();
                        Alert.alert(
                          'Interacción guardada',
                          'Se guardó como texto. Toca "Ver interacciones" para verla.',
                          [
                            { text: 'Ver interacciones', onPress: () => navigationRef?.current?.navigate('Vínculos', { openContactId: voicePreviewData.contactoId, openContact: contacto }) },
                            { text: 'Cerrar', style: 'cancel' }
                          ]
                        );
                      } catch (e) {
                        Alert.alert('Error', e.message || 'No se pudo guardar.');
                      }
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={22} color="white" />
                    <Text style={styles.modalVoicePreviewButtonText}>Guardar como interacción</Text>
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
  modalVoicePreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    marginTop: 12,
    marginBottom: 4,
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
