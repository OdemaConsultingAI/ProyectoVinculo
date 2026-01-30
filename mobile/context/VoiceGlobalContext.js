import React, { createContext, useContext, useState } from 'react';

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
