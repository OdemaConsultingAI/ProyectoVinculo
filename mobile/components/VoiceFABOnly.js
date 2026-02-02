import React from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceGlobal } from '../context/VoiceGlobalContext';
import { COLORES } from '../constants/colores';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_OFFSET = 56;
const OPCIONES_TIPO = [
  { id: 'gesto', icon: 'footsteps-outline', label: 'Huella' },
  { id: 'momento', icon: 'sparkles', label: 'Atención' },
  { id: 'desahogo', icon: 'document-text-outline', label: 'Desahogo' },
];

/**
 * FAB del micrófono + menú semicircular para usar DENTRO de modales (Atenciones, Huellas).
 * Al cargar el modal se invoca este componente para que el botón global aparezca encima del modal.
 * La lógica (handleMicPress, selectTipo) la registra GlobalVoiceOverlay en voiceOverlayApiRef.
 */
export default function VoiceFABOnly() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8) + TAB_BAR_OFFSET;
  const {
    semicircleMenuVisible,
    setSemicircleMenuVisible,
    voiceOverlayApiRef,
    voiceRecording,
    sendingVoice,
  } = useVoiceGlobal();

  const onFabPress = () => {
    voiceOverlayApiRef.current?.handleMicPress?.();
  };

  const closeMenu = () => {
    setSemicircleMenuVisible(false);
  };

  const onSelectTipo = (tipoId) => {
    voiceOverlayApiRef.current?.selectTipo?.(tipoId);
  };

  return (
    <>
      {/* Solo FAB cuando el menú está cerrado */}
      {!semicircleMenuVisible && (
        <View style={[styles.fabContainer, { bottom: bottomInset }]} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.floatingMainFab, (voiceRecording || sendingVoice) && { opacity: 0.95 }]}
            onPress={onFabPress}
            activeOpacity={0.8}
            disabled={sendingVoice}
          >
            <View style={styles.floatingMainFabInner}>
              {sendingVoice ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name={voiceRecording ? 'stop' : 'mic'} size={28} color="white" />
                  <Ionicons name="star" size={12} color="#FFD700" style={{ position: 'absolute', top: -2, right: -2 }} />
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Menú semicircular + FAB cuando está abierto (tap fuera cierra) */}
      {semicircleMenuVisible && (
        <Pressable style={StyleSheet.absoluteFillObject} onPress={closeMenu}>
          <View
            style={[styles.semicircleMenu, { bottom: bottomInset }]}
            pointerEvents="box-none"
          >
            {OPCIONES_TIPO.map((op) => (
              <TouchableOpacity
                key={op.id}
                style={styles.semicircleMenuItem}
                onPress={() => onSelectTipo(op.id)}
                activeOpacity={0.8}
              >
                <View style={styles.semicircleMenuIconWrap}>
                  <Ionicons name={op.icon} size={20} color="white" />
                </View>
                <Text style={styles.semicircleMenuLabel} numberOfLines={1}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.fabContainer, { bottom: bottomInset }]} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.floatingMainFab}
              onPress={onFabPress}
              activeOpacity={0.8}
              disabled={sendingVoice}
            >
              <View style={[styles.floatingMainFabInner, { backgroundColor: COLORES.atencion }]}>
                <Ionicons name="mic" size={28} color="white" />
                <Ionicons name="star" size={12} color="#FFD700" style={{ position: 'absolute', top: -2, right: -2 }} />
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    right: 0,
    width: 100,
    height: 90,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  floatingMainFab: {
    position: 'absolute',
    bottom: 0,
    right: 20,
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 10,
  },
  floatingMainFabInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORES.agua,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  semicircleMenu: {
    position: 'absolute',
    right: 92,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 6,
  },
  semicircleMenuItem: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORES.agua,
    borderWidth: 1,
    borderColor: COLORES.aguaOscuro,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  semicircleMenuIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  semicircleMenuLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: 'white',
  },
});
