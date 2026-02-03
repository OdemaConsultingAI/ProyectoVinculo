import React, { createContext, useContext, useState, useEffect } from 'react';

const BienvenidaContext = createContext(null);

function BienvenidaProvider({ children, initialShow = false, onCloseBienvenida }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (initialShow) setVisible(true);
  }, [initialShow]);

  const openBienvenida = () => setVisible(true);
  const closeBienvenida = () => setVisible(false);

  return (
    <BienvenidaContext.Provider value={{ visible, openBienvenida, closeBienvenida, onCloseBienvenida }}>
      {children}
    </BienvenidaContext.Provider>
  );
}

function useBienvenida() {
  const ctx = useContext(BienvenidaContext);
  if (!ctx) {
    return { visible: false, openBienvenida: () => {}, closeBienvenida: () => {} };
  }
  return ctx;
}

export { BienvenidaProvider, useBienvenida, BienvenidaContext };
export default { BienvenidaProvider, useBienvenida, BienvenidaContext };
