/**
 * Configuración de Expo/EAS. Exporta explícitamente nombre e icono
 * para que el APK muestre "Vinculo" y el icono correcto (no "mobile").
 * Usar rutas relativas para que EAS las resuelva desde la raíz del proyecto (mobile/).
 */
const appJson = require('./app.json');
const { expo } = appJson;

module.exports = {
  expo: {
    name: 'Vinculo',
    slug: expo.slug || 'vinculos-app',
    version: expo.version || '1.0.0',
    orientation: expo.orientation || 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: expo.userInterfaceStyle || 'light',
    newArchEnabled: expo.newArchEnabled !== false,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: expo.splash?.resizeMode || 'contain',
      backgroundColor: expo.splash?.backgroundColor || '#ffffff',
    },
    ios: expo.ios || { supportsTablet: true },
    android: {
      ...expo.android,
      package: expo.android?.package || 'com.vinculos.app',
      label: 'Vinculo',
      icon: './assets/icon.png',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: expo.android?.adaptiveIcon?.backgroundColor || '#ffffff',
      },
      edgeToEdgeEnabled: expo.android?.edgeToEdgeEnabled !== false,
      usesCleartextTraffic: expo.android?.usesCleartextTraffic !== false,
      networkSecurityConfig: expo.android?.networkSecurityConfig,
    },
    web: expo.web || { favicon: './assets/favicon.png' },
    plugins: expo.plugins || [],
    extra: expo.extra || {},
  },
};
