import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
import { Ionicons } from '@expo/vector-icons';
import { COLORES } from '../constants/colores';
import { useBienvenida } from '../context/BienvenidaContext';

const BIENVENIDA_KEY = '@vinculo_bienvenida_no_mostrar';

export function getBienvenidaNoMostrarKey() {
  return BIENVENIDA_KEY;
}

export default function BienvenidaModal() {
  const { visible, closeBienvenida, onCloseBienvenida } = useBienvenida();
  const [noMostrarMas, setNoMostrarMas] = useState(false);

  const handleCerrar = () => {
    if (typeof onCloseBienvenida === 'function') {
      onCloseBienvenida(noMostrarMas);
    }
    closeBienvenida();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleCerrar}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Ionicons name="leaf" size={48} color={COLORES.agua} />
              <Text style={styles.titulo}>¡Bienvenido a Vínculo!</Text>
              <Text style={styles.subtitulo}>
                Una app para cultivar tus relaciones con cariño y constancia.
              </Text>
            </View>

            <View style={styles.bloque}>
              <Text style={styles.bloqueTitulo}>¿De qué va la app?</Text>
              <Text style={styles.bloqueTexto}>
                Vínculo te ayuda a no perder de vista a las personas que te importan: familia, amigos, trabajo. 
                Puedes registrar momentos compartidos, atenciones pendientes (llamar, escribir, felicitar) 
                y recibir recordatorios suaves. Todo desde un solo lugar, con notas de voz y un espacio 
                personal para desahogos.
              </Text>
            </View>

            <View style={styles.bloque}>
              <Text style={styles.bloqueTitulo}>Primeros pasos: cargar contactos</Text>
              <Text style={styles.bloqueTexto}>
                • Entra en la pestaña <Text style={styles.bold}>Vínculos</Text>.{'\n'}
                • Toca el icono de intercambio (↔) en la parte superior para abrir el modo «Cultivar relación».{'\n'}
                • Desliza las tarjetas: a la derecha para añadir el contacto a tus vínculos, a la izquierda para pasar.{'\n'}
                • También puedes usar el botón «Importar contactos» dentro de ese modo o añadir contactos desde el símbolo + cuando ya tengas vínculos.
              </Text>
            </View>

            <View style={styles.bloque}>
              <Text style={styles.bloqueTitulo}>Funciones principales</Text>
              <View style={styles.filaFuncion}>
                <Ionicons name="leaf" size={20} color={COLORES.agua} style={styles.funcionIcono} />
                <Text style={styles.bloqueTexto}><Text style={styles.bold}>Vínculos:</Text> lista de personas que cultivas; toca una para ver su ficha, momentos y atenciones.</Text>
              </View>
              <View style={styles.filaFuncion}>
                <Ionicons name="sparkles" size={20} color={COLORES.agua} style={styles.funcionIcono} />
                <Text style={styles.bloqueTexto}><Text style={styles.bold}>Atenciones:</Text> tareas por persona (llamar, regar, felicitar); puedes completarlas y filtrar por contacto.</Text>
              </View>
              <View style={styles.filaFuncion}>
                <Ionicons name="footsteps-outline" size={20} color={COLORES.agua} style={styles.funcionIcono} />
                <Text style={styles.bloqueTexto}><Text style={styles.bold}>Huellas:</Text> momentos que compartes con alguien; se ordenan por fecha.</Text>
              </View>
              <View style={styles.filaFuncion}>
                <Ionicons name="mic" size={20} color={COLORES.agua} style={styles.funcionIcono} />
                <Text style={styles.bloqueTexto}><Text style={styles.bold}>Micrófono flotante:</Text> graba una nota de voz y la app sugiere si es momento o atención y con qué contacto.</Text>
              </View>
              <View style={styles.filaFuncion}>
                <Ionicons name="archive" size={20} color={COLORES.agua} style={styles.funcionIcono} />
                <Text style={styles.bloqueTexto}><Text style={styles.bold}>Mi Refugio:</Text> desahogos en voz; la app transcribe y etiqueta sin vincular a contactos.</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setNoMostrarMas(!noMostrarMas)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, noMostrarMas && styles.checkboxChecked]}>
                {noMostrarMas && <Ionicons name="checkmark" size={16} color="white" />}
              </View>
              <Text style={styles.checkLabel}>No volver a mostrar esta bienvenida</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.botonEntendido} onPress={handleCerrar} activeOpacity={0.8}>
              <Text style={styles.botonEntendidoTexto}>Entendido</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: COLORES.fondo,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    height: Math.min(SCREEN_HEIGHT * 0.88, 640),
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  titulo: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORES.texto,
    marginTop: 12,
    textAlign: 'center',
  },
  subtitulo: {
    fontSize: 15,
    color: COLORES.textoSecundario,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  bloque: {
    marginBottom: 20,
  },
  bloqueTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
    marginBottom: 8,
  },
  bloqueTexto: {
    fontSize: 14,
    color: COLORES.textoSecundario,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '600',
    color: COLORES.texto,
  },
  filaFuncion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  funcionIcono: {
    marginRight: 10,
    marginTop: 2,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: COLORES.textoSuave,
    borderRadius: 6,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORES.agua,
    borderColor: COLORES.agua,
  },
  checkLabel: {
    fontSize: 14,
    color: COLORES.texto,
    flex: 1,
  },
  botonEntendido: {
    backgroundColor: COLORES.agua,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  botonEntendidoTexto: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
