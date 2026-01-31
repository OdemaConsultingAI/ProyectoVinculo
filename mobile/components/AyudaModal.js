import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORES } from '../constants/colores';
import { useAyuda } from '../context/AyudaContext';

const SECCIONES = [
  {
    id: 'vinculos',
    icono: 'leaf',
    titulo: 'Vínculos',
    texto: 'Esta pestaña es tu lista de personas importantes. Cada burbuja es un contacto: toca la burbuja para ver su ficha (momentos compartidos, gestos pendientes, llamar o WhatsApp). El anillo rojo en una burbuja indica alta importancia. Puedes agregar momentos y gestos desde el icono del contacto o desde la pestaña Gestos.',
  },
  {
    id: 'gestos',
    icono: 'heart',
    titulo: 'Gestos',
    texto: 'Los gestos son acciones que quieres hacer por alguien (regar, llamar, quedar…). Aquí ves los gestos pendientes y los completados. Puedes filtrar por contacto y agregar gestos eligiendo a la persona; también puedes guardar una nota de voz como gesto. Las notificaciones te avisan de gestos pendientes.',
  },
  {
    id: 'refugio',
    icono: 'archive',
    titulo: 'Mi Refugio',
    texto: 'Espacio solo tuyo para desahogos en voz. Graba una nota de voz y guárdala como Desahogo: la app la transcribe y sugiere una etiqueta emocional (calma, estrés, gratitud, etc.), sin crear tareas ni gestos. Escucha Retrospectiva: vuelve a escuchar un desahogo guardado. El Espejo: resumen semanal de tu estado de ánimo con IA.',
  },
  {
    id: 'voz',
    icono: 'mic',
    titulo: 'Notas de voz',
    texto: 'El micrófono flotante sirve para grabar una nota de voz en cualquier momento. La app transcribe el audio y sugiere si es un momento (interacción) o una tarea/gesto, y con qué contacto. Puedes guardar como Gesto (pestaña Gestos), como Momento (para el contacto en Vínculos) o como Desahogo (Mi Refugio, sin vincular a nadie).',
  },
  {
    id: 'config',
    icono: 'settings',
    titulo: 'Configuración',
    texto: 'Cuenta: ver datos de sesión o cambiar contraseña. Notificaciones: activar o desactivar recordatorios de gestos y avisos. Prueba de notificación: enviar un push de prueba. Cerrar sesión: salir de la app de forma segura.',
  },
];

export default function AyudaModal() {
  const { visible, closeAyuda } = useAyuda();

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
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {SECCIONES.map((s) => (
                <View key={s.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.iconWrap}>
                      <Ionicons name={s.icono} size={22} color={COLORES.agua} />
                    </View>
                    <Text style={styles.sectionTitle}>{s.titulo}</Text>
                  </View>
                  <Text style={styles.sectionText}>{s.texto}</Text>
                </View>
              ))}
            </ScrollView>
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
    maxHeight: '90%',
    minHeight: 320,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORES.aguaClaro,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORES.texto,
  },
  sectionText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORES.textoSecundario,
    paddingLeft: 52,
  },
});
