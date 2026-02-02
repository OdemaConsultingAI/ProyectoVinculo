/**
 * Modal reutilizable: mismas huellas (momentos/interacciones) que la pestaña Huellas
 * pero filtrado a un solo contacto. Unifica código entre HuellasScreen y modal de contacto.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Platform,
  Alert,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORES } from '../constants/colores';
import { useVoiceGlobal } from '../context/VoiceGlobalContext';
import VoiceFABOnly from './VoiceFABOnly';
import { updateContactInteracciones, saveInteractionFromText } from '../services/syncService';
import { formatTime12h } from '../utils/dateTime';

const FILTROS = ['Hoy', 'Esta semana', 'La semana pasada', 'El mes pasado', 'Todas'];

export default function HuellasModalContacto({ visible, onClose, contact, onContactUpdate }) {
  const { setModalWithVoiceOpen } = useVoiceGlobal();
  useEffect(() => {
    if (visible) setModalWithVoiceOpen(true);
    return () => setModalWithVoiceOpen(false);
  }, [visible, setModalWithVoiceOpen]);

  const [filtroActivo, setFiltroActivo] = useState('Todas');
  const [dropdownTiempoVisible, setDropdownTiempoVisible] = useState(false);

  const [modalCrearVisible, setModalCrearVisible] = useState(false);
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [nuevaFechaHora, setNuevaFechaHora] = useState(new Date());
  const [showDatePickerCrear, setShowDatePickerCrear] = useState(false);
  const [datePickerModeCrear, setDatePickerModeCrear] = useState('date');
  const [guardando, setGuardando] = useState(false);

  const [modalEditarVisible, setModalEditarVisible] = useState(false);
  const [huellaEditando, setHuellaEditando] = useState(null);
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editFechaHora, setEditFechaHora] = useState(new Date());
  const [showDatePickerEdit, setShowDatePickerEdit] = useState(false);
  const [datePickerModeEdit, setDatePickerModeEdit] = useState('date');

  const interacciones = contact?.interacciones || [];
  const todasLasHuellas = useMemo(() => {
    return interacciones
      .map((interaccion, index) => {
        const fechaHora = interaccion.fechaHora ? new Date(interaccion.fechaHora) : null;
        if (!fechaHora) return null;
        return {
          ...interaccion,
          fechaHora,
          contactoId: contact._id,
          contactoNombre: contact.nombre,
          contactoFoto: contact.foto,
          interaccionIndex: index,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime());
  }, [interacciones, contact?._id, contact?.nombre, contact?.foto]);

  const huellasFiltradas = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (filtroActivo === 'Todas') return todasLasHuellas;
    return todasLasHuellas.filter((item) => {
      const f = new Date(item.fechaHora);
      f.setHours(0, 0, 0, 0);
      switch (filtroActivo) {
        case 'Hoy':
          return f.getTime() === hoy.getTime();
        case 'Esta semana': {
          const dia = hoy.getDay();
          const inicioSemana = new Date(hoy);
          inicioSemana.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1));
          inicioSemana.setHours(0, 0, 0, 0);
          const finSemana = new Date(inicioSemana);
          finSemana.setDate(finSemana.getDate() + 6);
          finSemana.setHours(23, 59, 59, 999);
          return item.fechaHora >= inicioSemana && item.fechaHora <= finSemana;
        }
        case 'La semana pasada': {
          const dia = hoy.getDay();
          const inicioEstaSemana = new Date(hoy);
          inicioEstaSemana.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1));
          inicioEstaSemana.setHours(0, 0, 0, 0);
          const inicioSemanaPasada = new Date(inicioEstaSemana);
          inicioSemanaPasada.setDate(inicioSemanaPasada.getDate() - 7);
          const finSemanaPasada = new Date(inicioSemanaPasada);
          finSemanaPasada.setDate(finSemanaPasada.getDate() + 6);
          finSemanaPasada.setHours(23, 59, 59, 999);
          return item.fechaHora >= inicioSemanaPasada && item.fechaHora <= finSemanaPasada;
        }
        case 'El mes pasado': {
          const inicioMesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
          const finMesPasado = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59, 999);
          return item.fechaHora >= inicioMesPasado && item.fechaHora <= finMesPasado;
        }
        default:
          return true;
      }
    });
  }, [todasLasHuellas, filtroActivo]);

  const abrirCrear = () => {
    setNuevaDescripcion('');
    setNuevaFechaHora(new Date());
    setModalCrearVisible(true);
  };

  const guardarNuevaHuella = async () => {
    if (!contact?._id) return;
    const desc = nuevaDescripcion.trim();
    if (!desc) {
      Alert.alert('Atención', 'Escribe la descripción del momento.');
      return;
    }
    setGuardando(true);
    try {
      const result = await saveInteractionFromText(contact._id, desc, nuevaFechaHora);
      if (result?.contacto && onContactUpdate) onContactUpdate(result.contacto);
      setModalCrearVisible(false);
      Alert.alert('Huella guardada', 'El momento se guardó correctamente.');
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const abrirEditar = (item) => {
    setHuellaEditando(item);
    setEditDescripcion(item.descripcion || '');
    setEditFechaHora(item.fechaHora ? new Date(item.fechaHora) : new Date());
    setModalEditarVisible(true);
  };

  const cerrarEditar = () => {
    setModalEditarVisible(false);
    setHuellaEditando(null);
  };

  const guardarEditarHuella = async () => {
    if (!huellaEditando?.contactoId || huellaEditando.interaccionIndex == null || !contact?.interacciones) return;
    const desc = editDescripcion.trim();
    if (!desc) {
      Alert.alert('Atención', 'La descripción no puede estar vacía.');
      return;
    }
    const actualizadas = [...contact.interacciones];
    const idx = huellaEditando.interaccionIndex;
    if (idx < 0 || idx >= actualizadas.length) return;
    actualizadas[idx] = {
      ...actualizadas[idx],
      descripcion: desc,
      fechaHora: editFechaHora instanceof Date ? editFechaHora : new Date(editFechaHora),
    };
    try {
      const result = await updateContactInteracciones(huellaEditando.contactoId, actualizadas);
      if (result.success && result.contacto && onContactUpdate) onContactUpdate(result.contacto);
      cerrarEditar();
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo guardar.');
    }
  };

  const renderHuella = ({ item }) => (
    <TouchableOpacity style={styles.huellaItem} onPress={() => abrirEditar(item)} activeOpacity={0.8}>
      <View style={styles.huellaLeft}>
        {item.contactoFoto ? (
          <Image source={{ uri: item.contactoFoto }} style={styles.contactoAvatar} />
        ) : (
          <View style={styles.contactoAvatarPlaceholder}>
            <Text style={styles.avatarInicial}>{(item.contactoNombre || '?').charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.huellaInfo}>
          <Text style={styles.huellaFecha}>
            {item.fechaHora.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {formatTime12h(item.fechaHora)}
          </Text>
          <Text style={styles.huellaDescripcion} numberOfLines={2}>{item.descripcion || '—'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORES.textoSecundario} />
      </View>
    </TouchableOpacity>
  );

  if (!visible) return null;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <Ionicons name="footsteps-outline" size={24} color={COLORES.agua} />
              <Text style={styles.modalTitle} numberOfLines={1}>Huellas de {contact?.nombre || 'Contacto'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ flexShrink: 0 }}>
              <Ionicons name="close-circle" size={30} color={COLORES.textoSuave} />
            </TouchableOpacity>
          </View>

          <View style={styles.desplegablesRow}>
            <View style={styles.desplegableWrap}>
              <View style={styles.desplegableLabelRow}>
                <Ionicons name="filter-outline" size={14} color={COLORES.textoSecundario} />
                <Text style={styles.desplegableLabel}>Filtro</Text>
              </View>
              <TouchableOpacity style={styles.desplegableButton} onPress={() => setDropdownTiempoVisible(true)} activeOpacity={0.7}>
                <Text style={styles.desplegableButtonText} numberOfLines={1}>{filtroActivo}</Text>
                <Ionicons name="chevron-down" size={20} color={COLORES.textoSecundario} />
              </TouchableOpacity>
            </View>
          </View>

          <Modal visible={dropdownTiempoVisible} transparent animationType="fade" onRequestClose={() => setDropdownTiempoVisible(false)}>
            <View style={styles.dropdownOverlay}>
              <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDropdownTiempoVisible(false)} />
              <View style={styles.dropdownContent}>
                <Text style={styles.dropdownTitle}>Filtro</Text>
                <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
                  {FILTROS.map((opcion) => (
                    <TouchableOpacity
                      key={opcion}
                      style={[styles.dropdownItem, filtroActivo === opcion && styles.dropdownItemActive]}
                      onPress={() => { setFiltroActivo(opcion); setDropdownTiempoVisible(false); }}
                    >
                      <Text style={[styles.dropdownItemText, filtroActivo === opcion && styles.dropdownItemTextActive]}>{opcion}</Text>
                      {filtroActivo === opcion && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>

          <FlatList
            data={huellasFiltradas}
            keyExtractor={(item, index) => `${item.contactoId}-${item.fechaHora?.getTime?.() ?? index}-${item.interaccionIndex}`}
            renderItem={renderHuella}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="footsteps-outline" size={48} color={COLORES.textoSecundario} />
                <Text style={styles.emptyText}>
                  {filtroActivo === 'Hoy' ? 'No hay huellas para hoy' : filtroActivo === 'Esta semana' ? 'No hay huellas esta semana' : filtroActivo === 'La semana pasada' ? 'No hay huellas la semana pasada' : filtroActivo === 'El mes pasado' ? 'No hay huellas el mes pasado' : 'No hay huellas'}
                </Text>
              </View>
            }
          />

        </View>
        <VoiceFABOnly />
      </View>

      {/* Modal Crear Huella (contacto fijo) */}
      <Modal visible={modalCrearVisible} animationType="slide" transparent onRequestClose={() => setModalCrearVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva huella</Text>
              <TouchableOpacity onPress={() => setModalCrearVisible(false)}>
                <Ionicons name="close" size={24} color={COLORES.texto} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalLabel}>Descripción</Text>
              <TextInput
                style={styles.modalInput}
                value={nuevaDescripcion}
                onChangeText={setNuevaDescripcion}
                placeholder="Qué pasó (ej.: Almorzamos juntos)"
                multiline
                numberOfLines={3}
              />
              <Text style={styles.modalLabel}>Fecha y hora</Text>
              <TouchableOpacity style={styles.modalDateButton} onPress={() => { setDatePickerModeCrear('date'); setShowDatePickerCrear(true); }}>
                <Text style={styles.modalDateText}>
                  {nuevaFechaHora.toLocaleDateString('es-ES')} · {formatTime12h(nuevaFechaHora)}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={COLORES.agua} />
              </TouchableOpacity>
              {showDatePickerCrear && (
                <DateTimePicker
                  value={nuevaFechaHora}
                  mode={datePickerModeCrear}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(e, d) => {
                    if (e.type === 'dismissed') { setShowDatePickerCrear(false); return; }
                    const next = d || nuevaFechaHora;
                    if (datePickerModeCrear === 'date') {
                      setNuevaFechaHora(next);
                      if (Platform.OS === 'android') setShowDatePickerCrear(false);
                      else setDatePickerModeCrear('time');
                    } else {
                      setNuevaFechaHora(next);
                      setShowDatePickerCrear(false);
                    }
                  }}
                />
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setModalCrearVisible(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, (!nuevaDescripcion.trim() || guardando) && { opacity: 0.6 }]}
                onPress={guardarNuevaHuella}
                disabled={!nuevaDescripcion.trim() || guardando}
              >
                {guardando ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalSaveText}>Guardar huella</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Editar Huella */}
      <Modal visible={modalEditarVisible} animationType="slide" transparent onRequestClose={cerrarEditar}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar huella</Text>
              <TouchableOpacity onPress={cerrarEditar}>
                <Ionicons name="close" size={24} color={COLORES.texto} />
              </TouchableOpacity>
            </View>
            {huellaEditando && (
              <>
                <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalLabel}>Descripción</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editDescripcion}
                    onChangeText={setEditDescripcion}
                    placeholder="Descripción del momento"
                    multiline
                    numberOfLines={3}
                  />
                  <Text style={styles.modalLabel}>Fecha y hora</Text>
                  <TouchableOpacity style={styles.modalDateButton} onPress={() => { setDatePickerModeEdit('date'); setShowDatePickerEdit(true); }}>
                    <Text style={styles.modalDateText}>
                      {editFechaHora.toLocaleDateString('es-ES')} · {formatTime12h(editFechaHora)}
                    </Text>
                    <Ionicons name="calendar-outline" size={20} color={COLORES.agua} />
                  </TouchableOpacity>
                  {showDatePickerEdit && (
                    <DateTimePicker
                      value={editFechaHora}
                      mode={datePickerModeEdit}
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(e, d) => {
                        if (e.type === 'dismissed') { setShowDatePickerEdit(false); return; }
                        const next = d || editFechaHora;
                        if (datePickerModeEdit === 'date') {
                          setEditFechaHora(next);
                          if (Platform.OS === 'android') setShowDatePickerEdit(false);
                          else setDatePickerModeEdit('time');
                        } else {
                          setEditFechaHora(next);
                          setShowDatePickerEdit(false);
                        }
                      }}
                    />
                  )}
                </ScrollView>
                <View style={styles.modalFooter}>
                  <TouchableOpacity style={styles.modalCancelButton} onPress={cerrarEditar}>
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSaveButton, !editDescripcion.trim() && { opacity: 0.6 }]}
                    onPress={guardarEditarHuella}
                    disabled={!editDescripcion.trim()}
                  >
                    <Text style={styles.modalSaveText}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORES.fondo, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORES.fondoSecundario },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORES.texto },
  desplegablesRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  desplegableWrap: { flex: 1 },
  desplegableLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  desplegableLabel: { fontSize: 12, fontWeight: '600', color: COLORES.textoSecundario },
  desplegableButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', borderWidth: 1, borderColor: COLORES.fondoSecundario, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  desplegableButtonText: { fontSize: 15, fontWeight: '500', color: COLORES.texto, flex: 1 },
  dropdownOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 24 },
  dropdownContent: { backgroundColor: COLORES.fondo, borderRadius: 16, paddingVertical: 8, maxHeight: 320 },
  dropdownList: { maxHeight: 260 },
  dropdownTitle: { fontSize: 14, fontWeight: '600', color: COLORES.textoSecundario, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORES.fondoSecundario },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  dropdownItemActive: { backgroundColor: COLORES.fondoSecundario },
  dropdownItemText: { fontSize: 16, color: COLORES.texto, fontWeight: '500' },
  dropdownItemTextActive: { color: COLORES.agua, fontWeight: '600' },
  listContent: { padding: 20, paddingTop: 8, flexGrow: 1 },
  huellaItem: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  huellaLeft: { flexDirection: 'row', alignItems: 'center' },
  contactoAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  contactoAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORES.fondoSecundario, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarInicial: { fontSize: 18, fontWeight: '600', color: COLORES.textoSecundario },
  huellaInfo: { flex: 1 },
  huellaFecha: { fontSize: 12, color: COLORES.textoSecundario, marginBottom: 4 },
  huellaDescripcion: { fontSize: 14, color: COLORES.textoSecundario, lineHeight: 20 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16, color: COLORES.textoSecundario, marginTop: 12, textAlign: 'center' },
  modalForm: { paddingHorizontal: 20, paddingVertical: 16, maxHeight: 320 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: COLORES.textoSecundario, marginBottom: 6 },
  modalInput: { fontSize: 15, color: COLORES.texto, borderWidth: 1, borderColor: COLORES.fondoSecundario, borderRadius: 12, padding: 14, minHeight: 80, textAlignVertical: 'top' },
  modalDateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 14, backgroundColor: COLORES.fondoSecundario, borderRadius: 12, marginTop: 8 },
  modalDateText: { fontSize: 15, color: COLORES.texto },
  modalFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, gap: 12, borderTopWidth: 1, borderTopColor: COLORES.fondoSecundario },
  modalCancelButton: { paddingVertical: 12, paddingHorizontal: 16 },
  modalCancelText: { fontSize: 15, color: COLORES.textoSecundario },
  modalSaveButton: { flex: 1, backgroundColor: COLORES.agua, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 16, fontWeight: '600', color: 'white' },
});
