import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORES } from '../constants/colores';
import AyudaContext from '../context/AyudaContext';
const useAyuda = AyudaContext?.useAyuda ?? (() => ({ visible: false, openAyuda: () => {}, closeAyuda: () => {} }));
import { loadDesahogos, getDesahogoById, getEspejo, deleteDesahogo } from '../services/syncService';
import { playFromBase64 } from '../services/voiceToTaskService';
import { formatTime12h } from '../utils/dateTime';

const ETIQUETAS_EMOCIONALES = ['Calma', 'Estrés', 'Gratitud', 'Tristeza', 'Alegre', 'Depresivo'];
const EMOTION_COLORS = {
  Calma: COLORES.agua,
  Estrés: COLORES.atencion,
  Gratitud: COLORES.activo,
  Tristeza: COLORES.textoSecundario,
  Alegre: COLORES.activo,
  Depresivo: COLORES.urgente,
};

function formatFecha(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, hoy)) return `Hoy ${formatTime12h(d)}`;
  if (sameDay(d, ayer)) return `Ayer ${formatTime12h(d)}`;
  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: d.getFullYear() !== hoy.getFullYear() ? 'numeric' : undefined })} ${formatTime12h(d)}`;
}

export default function MiRefugioScreen() {
  const [desahogos, setDesahogos] = useState([]);
  const [espejoText, setEspejoText] = useState('');
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [filtroEmocion, setFiltroEmocion] = useState('Todas');
  const route = useRoute();
  const navigation = useNavigation();

  const { openAyuda } = useAyuda();
  const desahogosFiltrados = filtroEmocion === 'Todas'
    ? desahogos
    : desahogos.filter((d) => (d.emotion || 'Calma') === filtroEmocion);

  const cargarDesahogos = useCallback(async () => {
    const [list, espejo] = await Promise.all([loadDesahogos(), getEspejo()]);
    setDesahogos(Array.isArray(list) ? list : []);
    setEspejoText(typeof espejo === 'string' ? espejo : '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setCargando(true);
        await cargarDesahogos();
        if (!cancelled) {
          setCargando(false);
          if (route.params?.refreshDesahogos) {
            navigation.setParams({ refreshDesahogos: undefined });
          }
        }
      })();
      return () => { cancelled = true; };
    }, [cargarDesahogos, route.params?.refreshDesahogos, navigation])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await cargarDesahogos();
    setRefreshing(false);
  }, [cargarDesahogos]);

  const onPlayDesahogo = useCallback(async (item) => {
    if (playingId) return;
    setPlayingId(item._id);
    try {
      const full = await getDesahogoById(item._id);
      if (!full?.audioBase64) {
        Alert.alert('Audio', 'Esta entrada no tiene audio para reproducir.');
        return;
      }
      const r = await playFromBase64(full.audioBase64);
      if (r?.error) Alert.alert('Audio', r.error);
    } catch (e) {
      Alert.alert('Audio', e?.message || 'No se pudo reproducir.');
    } finally {
      setPlayingId(null);
    }
  }, [playingId]);

  const onBorrarDesahogo = async (item) => {
    const id = item?._id ?? item?.id;
    if (!id) {
      Alert.alert('Error', 'No se pudo identificar la entrada.');
      return;
    }
    try {
      await deleteDesahogo(id);
      const idStr = String(id);
      setDesahogos(prev => prev.filter(d => String(d?._id ?? d?.id) !== idStr));
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo borrar.');
    }
  };

  const renderItem = ({ item }) => {
    const colorEmotion = EMOTION_COLORS[item.emotion] || COLORES.textoSecundario;
    const texto = (item.transcription || '').trim();
    const isPlaying = playingId === item._id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.badgeEmotion, { backgroundColor: colorEmotion + '22' }]}>
            <Text style={[styles.badgeEmotionText, { color: colorEmotion }]}>{item.emotion || 'Calma'}</Text>
          </View>
          <View style={styles.cardHeaderRight}>
            <TouchableOpacity
              style={styles.playButton}
              onPress={() => onPlayDesahogo(item)}
              disabled={isPlaying}
            >
              {isPlaying ? (
                <ActivityIndicator size="small" color={COLORES.agua} />
              ) : (
                <Ionicons name="play-circle-outline" size={28} color={COLORES.agua} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Borrar desahogo',
                  '¿Eliminar esta entrada? No se puede deshacer.',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Borrar', style: 'destructive', onPress: () => onBorrarDesahogo(item) },
                  ]
                );
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4 }}
              accessibilityLabel="Borrar este desahogo"
            >
              <Ionicons name="trash-outline" size={22} color={COLORES.urgente} />
            </TouchableOpacity>
            <Text style={styles.cardDate}>{formatFecha(item.createdAt)}</Text>
          </View>
        </View>
        {texto ? <Text style={styles.cardText}>{texto}</Text> : null}
      </View>
    );
  };

  const ListEmpty = () => (
    <View style={styles.placeholder}>
      {desahogos.length > 0 && filtroEmocion !== 'Todas' ? (
        <>
          <Ionicons name="funnel-outline" size={48} color={COLORES.textoSuave} />
          <Text style={styles.placeholderText}>
            No hay desahogos con emoción "{filtroEmocion}". Prueba con "Todas".
          </Text>
        </>
      ) : (
        <>
          <Ionicons name="mic-outline" size={48} color={COLORES.textoSuave} />
          <Text style={styles.placeholderText}>
            Usa el micrófono y elige "Guardar como Desahogo" para añadir una entrada aquí.
          </Text>
        </>
      )}
    </View>
  );

  const ListHeader = () => (
    <>
      <Text style={styles.intro}>
        Aquí puedes desahogarte con notas de voz. Solo para tus ojos y oídos.
        La IA te ayudará a reflexionar sin juzgar.
      </Text>
      {espejoText ? (
        <View style={styles.espejoCard}>
          <Text style={styles.espejoLabel}>El Espejo — esta semana</Text>
          <Text style={styles.espejoText}>{espejoText}</Text>
        </View>
      ) : null}
      {desahogos.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Tus desahogos</Text>
          <View style={styles.filtroRow}>
            {['Todas', ...ETIQUETAS_EMOCIONALES].map((em) => (
              <TouchableOpacity
                key={em}
                style={[
                  styles.filtroChip,
                  filtroEmocion === em && styles.filtroChipActive,
                ]}
                onPress={() => setFiltroEmocion(em)}
              >
                <Text
                  style={[
                    styles.filtroChipText,
                    filtroEmocion === em && styles.filtroChipTextActive,
                  ]}
                >
                  {em}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={{ width: 42 }} />
          <TouchableOpacity onPress={openAyuda} style={styles.helpButton} accessibilityLabel="Ayuda">
            <Ionicons name="help-circle-outline" size={26} color={COLORES.textoSuave} />
          </TouchableOpacity>
        </View>
        <View style={styles.iconWrap}>
          <Ionicons name="archive" size={40} color={COLORES.agua} />
        </View>
        <Text style={styles.title}>Mi Refugio</Text>
        <Text style={styles.subtitle}>
          El lugar más seguro para lo que más importa: tú.
        </Text>
      </View>
      <View style={styles.content}>
        <FlatList
          data={desahogosFiltrados}
          keyExtractor={(item) => item._id || String(item.createdAt)}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={desahogosFiltrados.length === 0 ? styles.listEmpty : styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORES.agua]} />
          }
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORES.fondo,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  headerSpacer: { flex: 1 },
  helpButton: { padding: 8 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORES.aguaClaro,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORES.texto,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: COLORES.textoSecundario,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  intro: {
    fontSize: 15,
    color: COLORES.textoSecundario,
    lineHeight: 22,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
    marginBottom: 12,
  },
  filtroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filtroChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORES.fondoSecundario,
  },
  filtroChipActive: {
    backgroundColor: COLORES.aguaClaro,
  },
  filtroChipText: {
    fontSize: 13,
    color: COLORES.textoSecundario,
    fontWeight: '500',
  },
  filtroChipTextActive: {
    color: COLORES.aguaOscuro,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 32,
  },
  listEmpty: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: COLORES.burbujaFondo,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playButton: {
    padding: 4,
  },
  espejoCard: {
    backgroundColor: COLORES.aguaClaro,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORES.agua,
  },
  espejoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORES.aguaOscuro,
    marginBottom: 4,
  },
  espejoText: {
    fontSize: 15,
    color: COLORES.texto,
    lineHeight: 22,
  },
  badgeEmotion: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeEmotionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardDate: {
    fontSize: 12,
    color: COLORES.textoSuave,
  },
  cardText: {
    fontSize: 14,
    color: COLORES.texto,
    lineHeight: 20,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    minHeight: 200,
  },
  placeholderText: {
    fontSize: 14,
    color: COLORES.textoSuave,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 24,
  },
});
