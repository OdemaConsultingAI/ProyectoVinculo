import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import VinculosScreen from './screens/VinculosScreen';
import GestosScreen from './screens/GestosScreen';
import MiRefugioScreen from './screens/MiRefugioScreen';
import ConfiguracionScreen from './screens/ConfiguracionScreen';
import LoginScreen from './screens/LoginScreen';
import SplashScreen from './screens/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { VoiceGlobalProvider } from './context/VoiceGlobalContext';
import { AyudaProvider } from './context/AyudaContext';
import GlobalVoiceOverlay from './components/GlobalVoiceOverlay';
import AyudaModal from './components/AyudaModal';
import { isAuthenticated } from './services/authService';
import { registerAndSendPushToken, addNotificationResponseListener } from './services/pushNotificationService';

const Tab = createBottomTabNavigator();

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [splashComplete, setSplashComplete] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  // Etapa 1+2 push: registrar token y enviarlo al backend cuando el usuario está autenticado
  useEffect(() => {
    if (!authenticated || showSplash) return;
    registerAndSendPushToken().catch(() => {});
  }, [authenticated, showSplash]);

  // Etapa 4 push: al tocar una notificación, navegar a la pantalla según data.tipo
  useEffect(() => {
    if (!authenticated || showSplash) return;
    const remove = addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      const tipo = data.tipo || data.type;
      const nav = navigationRef.current;
      if (!nav) return;
      if (tipo === 'gesto') {
        nav.navigate('Gestos', { contactoId: data.contactoId, refreshGestos: true });
      } else if (tipo === 'riego' || tipo === 'cumpleaños' || tipo === 'contacto') {
        nav.navigate('Vínculos', { contactoId: data.contactoId });
      } else if (tipo === 'test') {
        nav.navigate('Configuración');
      } else {
        nav.navigate('Vínculos');
      }
    });
    return remove;
  }, [authenticated, showSplash]);

  const checkAuth = async () => {
    try {
      const auth = await isAuthenticated();
      setAuthenticated(auth);
    } catch (error) {
      console.error('Error verificando autenticación:', error);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSplashComplete = () => {
    setSplashComplete(true);
    // Esperar un poco más si aún está cargando la autenticación
    if (!loading) {
      setShowSplash(false);
    }
  };

  useEffect(() => {
    // Ocultar splash cuando tanto el splash como la carga hayan terminado
    if (splashComplete && !loading) {
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [splashComplete, loading]);

  const navigationRef = useRef(null);
  const [currentRouteName, setCurrentRouteName] = useState('Vínculos');

  const handleLoginSuccess = () => {
    setAuthenticated(true);
  };

  const handleLogout = () => {
    setAuthenticated(false);
  };

  if (showSplash) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <ErrorBoundary>
          <SplashScreen onLoadingComplete={handleSplashComplete} />
        </ErrorBoundary>
      </GestureHandlerRootView>
    );
  }

  if (!authenticated) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <ErrorBoundary>
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
        </ErrorBoundary>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <VoiceGlobalProvider>
            <View style={styles.root}>
              <NavigationContainer
                ref={navigationRef}
                onStateChange={(state) => {
                  const route = state?.routes?.[state.index];
                  if (route?.name) setCurrentRouteName(route.name);
                }}
              >
                <Tab.Navigator screenOptions={{ headerShown: false }}>
                  <Tab.Screen 
                    name="Vínculos" 
                    component={VinculosScreen} 
                    options={{ 
                      tabBarIcon: ({color}) => <Ionicons name="leaf" size={24} color={color} /> 
                    }} 
                  />
                  <Tab.Screen 
                    name="Gestos" 
                    component={GestosScreen} 
                    options={{ 
                      tabBarIcon: ({color}) => <Ionicons name="heart" size={24} color={color} /> 
                    }} 
                  />
                  <Tab.Screen 
                    name="Mi Refugio" 
                    component={MiRefugioScreen} 
                    options={{ 
                      tabBarIcon: ({color}) => <Ionicons name="archive" size={24} color={color} /> 
                    }} 
                  />
                  <Tab.Screen 
                    name="Configuración"
                    options={{ 
                      tabBarIcon: ({color}) => <Ionicons name="settings" size={24} color={color} /> 
                    }}
                  >
                    {() => <ConfiguracionScreen onLogout={handleLogout} />}
                  </Tab.Screen>
                </Tab.Navigator>
              </NavigationContainer>
                <GlobalVoiceOverlay navigationRef={navigationRef} currentRouteName={currentRouteName} />
                <AyudaModal />
              </View>
            </AyudaProvider>
        </VoiceGlobalProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});