const path = require('path');

const appJson = require('./app.json');
const { expo } = appJson;

// Forzar nombre e icono para que no se use package.json ni caché
const config = {
  ...appJson,
  expo: {
    ...expo,
    name: 'Vinculo',
    icon: path.resolve(__dirname, 'assets/icon.png'),
    android: {
      ...expo.android,
      label: 'Vinculo',
      icon: path.resolve(__dirname, 'assets/icon.png'),
      adaptiveIcon: {
        ...expo.android?.adaptiveIcon,
        foregroundImage: path.resolve(__dirname, 'assets/adaptive-icon.png'),
      },
    },
    splash: {
      ...expo.splash,
      image: path.resolve(__dirname, 'assets/splash-icon.png'),
    },
  },
};

module.exports = config;
