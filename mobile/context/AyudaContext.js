import React, { createContext, useContext, useState } from 'react';

const AyudaContext = createContext(null);

/** Contextos válidos: 'vinculos' | 'atenciones' | 'huellas' | 'refugio' | 'voz' | 'config' */
function AyudaProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [seccionId, setSeccionId] = useState(null);
  const openAyuda = (contexto) => {
    setSeccionId(contexto ?? null);
    setVisible(true);
  };
  const closeAyuda = () => {
    setVisible(false);
    setSeccionId(null);
  };
  return (
    <AyudaContext.Provider value={{ visible, seccionId, openAyuda, closeAyuda }}>
      {children}
    </AyudaContext.Provider>
  );
}

function useAyuda() {
  const ctx = useContext(AyudaContext);
  if (!ctx) {
    return { visible: false, seccionId: null, openAyuda: () => {}, closeAyuda: () => {} };
  }
  return ctx;
}

export { AyudaProvider, useAyuda, AyudaContext };
export default { AyudaProvider, useAyuda, AyudaContext };
