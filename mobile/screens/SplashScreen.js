import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORES } from '../constants/colores';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SplashScreen({ onLoadingComplete }) {
  const [progress, setProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animación de crecimiento del icono (como una planta) - más lenta y suave
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 2000, // 2 segundos para que se aprecie mejor el crecimiento
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // Animación de fade in inicial
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // Simular progreso de carga - ajustado para que el icono termine antes
    const loadingSteps = [
      { progress: 5, delay: 250 },   // Más lento al inicio
      { progress: 15, delay: 300 },
      { progress: 30, delay: 350 },
      { progress: 45, delay: 300 },
      { progress: 60, delay: 350 },
      { progress: 75, delay: 300 },
      { progress: 88, delay: 300 },   // El icono ya terminó de crecer aquí
      { progress: 95, delay: 300 },
      { progress: 100, delay: 400 },
    ];

    let currentStep = 0;
    const updateProgress = () => {
      if (currentStep < loadingSteps.length) {
        const step = loadingSteps[currentStep];
        setTimeout(() => {
          setProgress(step.progress);
          
          // Animar la barra de progreso
          Animated.timing(progressAnim, {
            toValue: step.progress,
            duration: step.delay,
            useNativeDriver: false,
          }).start();

          currentStep++;
          if (currentStep < loadingSteps.length) {
            updateProgress();
          } else {
            // Cuando llegue al 100%, esperar un poco y llamar a onLoadingComplete
            setTimeout(() => {
              Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }).start(() => {
                if (onLoadingComplete) {
                  onLoadingComplete();
                }
              });
            }, 200);
          }
        }, step.delay);
      }
    };

    updateProgress();
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Icono principal */}
        <View style={styles.iconContainer}>
          <Animated.View 
            style={[
              styles.iconCircle,
              {
                transform: [{ scale: scaleAnim }],
              }
            ]}
          >
            <Ionicons name="leaf" size={110} color="white" />
          </Animated.View>
        </View>

        {/* Título */}
        <Text style={styles.title}>Vínculos</Text>
        <Text style={styles.subtitle}>Gestiona tus relaciones importantes</Text>

        {/* Barra de progreso */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <Animated.View 
              style={[
                styles.progressBarFill,
                { width: progressWidth }
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORES.agua,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 40,
  },
  iconContainer: {
    marginBottom: 30,
  },
  iconCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 50,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    maxWidth: SCREEN_WIDTH * 0.7,
    alignItems: 'center',
  },
  progressBarBackground: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
});
