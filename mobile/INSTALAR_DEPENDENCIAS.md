# Instalación de Dependencias

## Nueva Dependencia: NetInfo

Para que la funcionalidad offline funcione correctamente, necesitas instalar `@react-native-community/netinfo`:

```bash
cd mobile
npm install @react-native-community/netinfo
```

O si usas yarn:

```bash
cd mobile
yarn add @react-native-community/netinfo
```

## Verificar Instalación

Después de instalar, reinicia el servidor de Expo:

```bash
npm start
```

La app ahora detectará automáticamente cuando no hay conexión a internet y guardará los cambios localmente para sincronizarlos cuando vuelva la conexión.
