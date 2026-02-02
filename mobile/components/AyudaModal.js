import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORES } from '../constants/colores';
import { useAyuda } from '../context/AyudaContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SECCIONES = [
  {
    id: 'vinculos',
    icono: 'leaf',
    titulo: 'Vínculos',
    texto: 'Esta pestaña es tu lista de personas importantes. Cada burbuja es un contacto: toca la burbuja para ver su ficha (momentos compartidos, atenciones pendientes, llamar o WhatsApp). Puedes agregar momentos y atenciones desde el icono del contacto o desde la pestaña Atenciones.',
  },
  {
    id: 'atenciones',
    icono: 'footsteps-outline',
    titulo: 'Atenciones',
    texto: 'Las atenciones son acciones que quieres hacer por alguien (regar, llamar, quedar…). Aquí ves las atenciones pendientes y las completadas. Puedes filtrar por contacto y agregar atenciones eligiendo a la persona; también puedes guardar una nota de voz como atención. Las notificaciones te avisan de atenciones pendientes.',
  },
  {
    id: 'huellas',
    icono: 'footsteps-outline',
    titulo: 'Huellas',
    texto: 'Las huellas son los momentos que compartes con alguien (almorzar, llamar, quedar…). Aquí ves todas tus huellas ordenadas por fecha. Puedes filtrar por tiempo y por contacto, y agregar nuevas desde el botón +. Toca una huella para editarla.',
  },
  {
    id: 'refugio',
    icono: 'archive',
    titulo: 'Mi Refugio',
    texto: 'Espacio solo tuyo para desahogos en voz. Graba una nota de voz y guárdala como Desahogo: la app la transcribe y sugiere una etiqueta emocional (calma, estrés, gratitud, etc.), sin crear tareas ni atenciones. Escucha Retrospectiva: vuelve a escuchar un desahogo guardado. El Espejo: resumen semanal de tu estado de ánimo con IA.',
  },
  {
    id: 'voz',
    icono: 'mic',
    titulo: 'Notas de voz',
    texto: 'El micrófono flotante sirve para grabar una nota de voz en cualquier momento. La app transcribe el audio y sugiere si es un momento (interacción) o una atención (tarea), y con qué contacto. Puedes guardar como Atención (pestaña Atenciones), como Momento (para el contacto en Vínculos) o como Desahogo (Mi Refugio, sin vincular a nadie).',
  },
  {
    id: 'config',
    icono: 'settings',
    titulo: 'Configuración',
    texto: 'Cuenta: ver datos de sesión o cambiar contraseña. Notificaciones: activar o desactivar recordatorios de atenciones y avisos. Prueba de notificación: enviar un push de prueba. Cerrar sesión: salir de la app de forma segura.',
  },
];

export default function AyudaModal() {
  const { visible, closeAyuda } = useAyuda();
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (visible) setIndice(0);
  }, [visible]);

  const seccion = SECCIONES[indice];
  const esPrimera = indice === 0;
  const esUltima = indice === SECCIONES.length - 1;

  const irAnterior = () => {
    if (!esPrimera) setIndice((i) => i - 1);
  };

  const irSiguiente = () => {
    if (esUltima) closeAyuda();
    else setIndice((i) => i + 1);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={closeAyuda}
    >
      <Pressable style={styles.overlay} onPress={closeAyuda}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Ayuda</Text>
              <TouchableOpacity
                onPress={closeAyuda}
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Cerrar ayuda"
              >
                <Ionicons name="close" size={28} color={COLORES.texto} />
              </TouchableOpacity>
            </View>

            <View style={styles.body}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconWrap}>
                  <Ionicons name={seccion.icono} size={32} color={COLORES.agua} />
                </View>
                <Text style={styles.sectionTitle}>{seccion.titulo}</Text>
              </View>
              <Text style={styles.sectionText}>{seccion.texto}</Text>
            </View>

            <View style={styles.pagination}>
              <Text style={styles.paginationText}>
                {indice + 1} / {SECCIONES.length}
              </Text>
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                onPress={irAnterior}
                style={[styles.footerButton, styles.footerButtonLeft, esPrimera && styles.footerButtonDisabled]}
                disabled={esPrimera}
                accessibilityLabel="Anterior"
              >
                <Ionicons name="chevron-back" size={22} color={esPrimera ? COLORES.textoSuave : COLORES.texto} />
                <Text style={[styles.footerButtonText, esPrimera && styles.footerButtonTextDisabled]}>Anterior</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={irSiguiente}
                style={[styles.footerButton, styles.footerButtonRight]}
                accessibilityLabel={esUltima ? 'Cerrar' : 'Siguiente'}
              >
                <Text style={styles.footerButtonText}>{esUltima ? 'Cerrar' : 'Siguiente'}</Text>
                {!esUltima && <Ionicons name="chevron-forward" size={22} color={COLORES.agua} />}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    height: Math.min(SCREEN_HEIGHT * 0.85, 560),
    maxHeight: '90%',
    backgroundColor: COLORES.fondo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORES.burbujaBorde,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORES.texto,
  },
  closeButton: {
    padding: 4,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    justifyContent: 'flex-start',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORES.aguaClaro,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORES.texto,
    flex: 1,
  },
  sectionText: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORES.textoSecundario,
  },
  pagination: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  paginationText: {
    fontSize: 14,
    color: COLORES.textoSuave,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORES.burbujaBorde,
    gap: 12,
  },
  footerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  footerButtonLeft: {
    backgroundColor: COLORES.fondoSecundario,
  },
  footerButtonRight: {
    backgroundColor: COLORES.aguaClaro,
  },
  footerButtonDisabled: {
    opacity: 0.5,
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
  },
  footerButtonTextDisabled: {
    color: COLORES.textoSuave,
  },
});
