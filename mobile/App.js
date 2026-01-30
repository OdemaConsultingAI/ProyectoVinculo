import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import VinculosScreen from './screens/VinculosScreen';
import TareasScreen from './screens/TareasScreen';
import ConfiguracionScreen from './screens/ConfiguracionScreen';
import LoginScreen from './screens/LoginScreen';
import SplashScreen from './screens/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { isAuthenticated } from './services/authService';

const Tab = createBottomTabNavigator();

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [splashComplete, setSplashComplete] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

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
        <NavigationContainer>
        <Tab.Navigator screenOptions={{ headerShown: false }}>
          <Tab.Screen 
            name="Vínculos" 
            component={VinculosScreen} 
            options={{ 
              tabBarIcon: ({color}) => <Ionicons name="leaf" size={24} color={color} /> 
            }} 
          />
          <Tab.Screen 
            name="Tareas" 
            component={TareasScreen} 
            options={{ 
              tabBarIcon: ({color}) => <Ionicons name="checkmark-circle" size={24} color={color} /> 
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
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});