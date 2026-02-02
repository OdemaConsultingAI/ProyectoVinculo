import React, { createContext, useContext, useRef, useState } from 'react';

const VoiceGlobalContext = createContext(null);

export function VoiceGlobalProvider({ children }) {
  const [voiceRecording, setVoiceRecording] = useState(null);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [voicePreviewTempId, setVoicePreviewTempId] = useState(null);
  const [voicePreviewAudioUri, setVoicePreviewAudioUri] = useState(null);
  const [voicePreviewData, setVoicePreviewData] = useState(null);
  const [voicePreviewTranscription, setVoicePreviewTranscription] = useState(null);
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  const [voicePreviewContactoFromModal, setVoicePreviewContactoFromModal] = useState(null);
  const [modalVoicePreviewVisible, setModalVoicePreviewVisible] = useState(false);
  const [currentContactForVoice, setCurrentContactForVoice] = useState(null);
  /** Tipo elegido antes de grabar/escribir: 'gesto' | 'momento' | 'desahogo'. Null si aún no eligió. */
  const [voiceSelectedTipo, setVoiceSelectedTipo] = useState(null);
  /** Modal de escritura (lápiz): visible cuando el usuario eligió Gesto/Momento/Desahogo desde lápiz. */
  const [voiceWriteModalVisible, setVoiceWriteModalVisible] = useState(false);
  /** Menú semicircular (Huella/Atención/Desahogo) visible; compartido para FAB global y FAB dentro de modales. */
  const [semicircleMenuVisible, setSemicircleMenuVisible] = useState(false);
  /** True cuando un modal que muestra su propio FAB está abierto (AtencionesModalContacto, HuellasModalContacto). */
  const [modalWithVoiceOpen, setModalWithVoiceOpen] = useState(false);
  /** API que GlobalVoiceOverlay registra para que VoiceFABOnly (dentro de modales) pueda abrir menú, selectTipo, etc. */
  const voiceOverlayApiRef = useRef({});

  const value = {
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
    setCurrentContactForVoice,
    voiceSelectedTipo,
    setVoiceSelectedTipo,
    voiceWriteModalVisible,
    setVoiceWriteModalVisible,
    semicircleMenuVisible,
    setSemicircleMenuVisible,
    modalWithVoiceOpen,
    setModalWithVoiceOpen,
    voiceOverlayApiRef,
  };

  return (
    <VoiceGlobalContext.Provider value={value}>
      {children}
    </VoiceGlobalContext.Provider>
  );
}

export function useVoiceGlobal() {
  const ctx = useContext(VoiceGlobalContext);
  if (!ctx) {
    throw new Error('useVoiceGlobal must be used within VoiceGlobalProvider');
  }
  return ctx;
}
