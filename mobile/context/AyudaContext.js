import React, { createContext, useContext, useState } from 'react';

const AyudaContext = createContext(null);

function AyudaProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const openAyuda = () => setVisible(true);
  const closeAyuda = () => setVisible(false);
  return (
    <AyudaContext.Provider value={{ visible, openAyuda, closeAyuda }}>
      {children}
    </AyudaContext.Provider>
  );
}

function useAyuda() {
  const ctx = useContext(AyudaContext);
  if (!ctx) {
    return { visible: false, openAyuda: () => {}, closeAyuda: () => {} };
  }
  return ctx;
}

export { AyudaProvider, useAyuda, AyudaContext };
export default { AyudaProvider, useAyuda, AyudaContext };
