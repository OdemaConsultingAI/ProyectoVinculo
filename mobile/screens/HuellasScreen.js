import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORES } from '../constants/colores';
import { API_URL, fetchWithAuth } from '../constants/api';
import { loadContacts, updateContactInteracciones, saveInteractionFromText } from '../services/syncService';
import { formatTime12h } from '../utils/dateTime';
import NotificationBell from '../components/NotificationBell';
import AyudaContext from '../context/AyudaContext';
const useAyuda = AyudaContext?.useAyuda ?? (() => ({ openAyuda: () => {} }));

const FILTROS = ['Hoy', 'Esta semana', 'La semana pasada', 'El mes pasado', 'Todas'];

export default function HuellasScreen() {
  const [contactos, setContactos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroActivo, setFiltroActivo] = useState('Todas');
  const [filtroContactoId, setFiltroContactoId] = useState(null);
  const [dropdownTiempoVisible, setDropdownTiempoVisible] = useState(false);
  const [dropdownContactoVisible, setDropdownContactoVisible] = useState(false);

  const [modalCrearVisible, setModalCrearVisible] = useState(false);
  const [pasoCrear, setPasoCrear] = useState('contacto');
  const [contactoSeleccionado, setContactoSeleccionado] = useState(null);
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

  const { openAyuda } = useAyuda();
  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, [])
  );

  const cargarDatos = async () => {
    try {
      setCargando(true);
      const res = await loadContacts();
      const lista = res?.contactos ?? [];
      setContactos(Array.isArray(lista) ? lista : []);
    } catch (error) {
      console.error('Error cargando huellas:', error);
      try {
        const raw = await fetchWithAuth(API_URL);
        if (raw.ok) {
          const data = await raw.json();
          setContactos(data || []);
        }
      } catch (_) {}
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  };

  const todasLasHuellas = useMemo(() => {
    const list = [];
    contactos.forEach((contacto) => {
      const interacciones = contacto.interacciones || [];
      interacciones.forEach((interaccion, index) => {
        const fechaHora = interaccion.fechaHora ? new Date(interaccion.fechaHora) : null;
        if (fechaHora) {
          list.push({
            ...interaccion,
            fechaHora,
            contactoId: contacto._id,
            contactoNombre: contacto.nombre,
            contactoFoto: contacto.foto,
            interaccionIndex: index,
          });
        }
      });
    });
    return list.sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime());
  }, [contactos]);

  const huellasFiltradas = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    let list = todasLasHuellas;

    if (filtroActivo !== 'Todas') {
      list = list.filter((item) => {
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
    }

    if (filtroContactoId) {
      list = list.filter((item) => item.contactoId === filtroContactoId);
    }
    return list;
  }, [todasLasHuellas, filtroActivo, filtroContactoId]);

  const abrirCrear = () => {
    setPasoCrear('contacto');
    setContactoSeleccionado(null);
    setNuevaDescripcion('');
    setNuevaFechaHora(new Date());
    setModalCrearVisible(true);
  };

  const volverASelectorContacto = () => {
    setPasoCrear('contacto');
    setContactoSeleccionado(null);
  };

  const cerrarCrear = () => {
    setModalCrearVisible(false);
    setContactoSeleccionado(null);
    setNuevaDescripcion('');
  };

  const guardarNuevaHuella = async () => {
    if (!contactoSeleccionado?._id) return;
    const desc = nuevaDescripcion.trim();
    if (!desc) {
      Alert.alert('Atención', 'Escribe la descripción del momento.');
      return;
    }
    setGuardando(true);
    try {
      await saveInteractionFromText(contactoSeleccionado._id, desc, nuevaFechaHora);
      cerrarCrear();
      cargarDatos();
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
    if (!huellaEditando?.contactoId || huellaEditando.interaccionIndex == null) return;
    const desc = editDescripcion.trim();
    if (!desc) {
      Alert.alert('Atención', 'La descripción no puede estar vacía.');
      return;
    }
    const contacto = contactos.find((c) => c._id === huellaEditando.contactoId);
    if (!contacto?.interacciones) return;
    const actualizadas = [...contacto.interacciones];
    const idx = huellaEditando.interaccionIndex;
    if (idx < 0 || idx >= actualizadas.length) return;
    actualizadas[idx] = {
      ...actualizadas[idx],
      descripcion: desc,
      fechaHora: editFechaHora instanceof Date ? editFechaHora : new Date(editFechaHora),
    };
    try {
      const result = await updateContactInteracciones(huellaEditando.contactoId, actualizadas);
      if (result.success) {
        setContactos((prev) =>
          prev.map((c) => (c._id === huellaEditando.contactoId ? { ...c, interacciones: result.contacto?.interacciones ?? actualizadas } : c))
        );
        cerrarEditar();
      } else {
        Alert.alert('Error', 'No se pudo guardar.');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo guardar.');
    }
  };

  const borrarHuella = async (item) => {
    const contacto = contactos.find(c => c._id === item.contactoId);
    if (!contacto) return;
    const idx = item.interaccionIndex;
    const interaccionesActualizadas = (contacto.interacciones || []).filter((_, i) => i !== idx);
    try {
      const result = await updateContactInteracciones(item.contactoId, interaccionesActualizadas);
      if (result.success) {
        setContactos(prev => prev.map(c => c._id === item.contactoId ? result.contacto : c));
      }
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo borrar la huella.');
    }
  };

  const renderHuella = ({ item }) => {
    return (
      <View style={[styles.huellaItem, { flexDirection: 'row', alignItems: 'center' }]}>
        <TouchableOpacity
          style={[styles.huellaLeft, { flex: 1 }]}
          onPress={() => abrirEditar(item)}
          activeOpacity={0.8}
        >
          {item.contactoFoto ? (
            <Image source={{ uri: item.contactoFoto }} style={styles.contactoAvatar} />
          ) : (
            <View style={styles.contactoAvatarPlaceholder}>
              <Text style={styles.avatarInicial} numberOfLines={1}>
                {(item.contactoNombre || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.huellaInfo}>
            <View style={styles.huellaHeader}>
              <Text style={styles.huellaContacto} numberOfLines={1}>
                {item.contactoNombre || '—'}
              </Text>
              <Text style={styles.huellaFecha}>
                {item.fechaHora.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {formatTime12h(item.fechaHora)}
              </Text>
            </View>
            <Text style={styles.huellaDescripcion} numberOfLines={2}>
              {item.descripcion || '—'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORES.textoSecundario} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              'Borrar huella',
              '¿Eliminar este momento? No se puede deshacer.',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Borrar', style: 'destructive', onPress: () => borrarHuella(item) },
              ]
            );
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ padding: 8 }}
          accessibilityLabel="Borrar esta huella"
        >
          <Ionicons name="trash-outline" size={20} color={COLORES.urgente} />
        </TouchableOpacity>
      </View>
    );
  };

  if (cargando) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORES.agua} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name="footsteps-outline" size={24} color={COLORES.agua} />
            <Text style={styles.headerTitle}>Huellas</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity onPress={() => openAyuda('huellas')} style={{ padding: 8 }} accessibilityLabel="Ayuda">
              <Ionicons name="help-circle-outline" size={26} color={COLORES.textoSecundario} />
            </TouchableOpacity>
            <NotificationBell />
          </View>
        </View>
        <Text style={styles.headerSubtitle}>Momentos que has compartido con cada contacto</Text>
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
        <View style={styles.desplegableWrap}>
          <View style={styles.desplegableLabelRow}>
            <Ionicons name="person-outline" size={14} color={COLORES.textoSecundario} />
            <Text style={styles.desplegableLabel}>Contacto</Text>
          </View>
          <TouchableOpacity style={styles.desplegableButton} onPress={() => setDropdownContactoVisible(true)} activeOpacity={0.7}>
            <Text style={styles.desplegableButtonText} numberOfLines={1}>
              {filtroContactoId ? (contactos.find((c) => c._id === filtroContactoId)?.nombre || 'Contacto') : 'Todos'}
            </Text>
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
                  onPress={() => {
                    setFiltroActivo(opcion);
                    setDropdownTiempoVisible(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, filtroActivo === opcion && styles.dropdownItemTextActive]}>{opcion}</Text>
                  {filtroActivo === opcion && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={dropdownContactoVisible} transparent animationType="fade" onRequestClose={() => setDropdownContactoVisible(false)}>
        <View style={styles.dropdownOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDropdownContactoVisible(false)} />
          <View style={styles.dropdownContent}>
            <Text style={styles.dropdownTitle}>Buscar por contacto</Text>
            <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.dropdownItem, !filtroContactoId && styles.dropdownItemActive]}
                onPress={() => {
                  setFiltroContactoId(null);
                  setDropdownContactoVisible(false);
                }}
              >
                <Text style={[styles.dropdownItemText, !filtroContactoId && styles.dropdownItemTextActive]}>Todos</Text>
                {!filtroContactoId && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
              </TouchableOpacity>
              {contactos.map((c) => (
                <TouchableOpacity
                  key={c._id}
                  style={[styles.dropdownItem, filtroContactoId === c._id && styles.dropdownItemActive]}
                  onPress={() => {
                    setFiltroContactoId(c._id);
                    setDropdownContactoVisible(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, filtroContactoId === c._id && styles.dropdownItemTextActive]} numberOfLines={1}>{c.nombre || 'Sin nombre'}</Text>
                  {filtroContactoId === c._id && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
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
            <Ionicons name="footsteps-outline" size={64} color={COLORES.textoSecundario} />
            <Text style={styles.emptyText}>
              {contactos.length === 0
                ? (filtroActivo === 'Hoy'
                    ? 'No hay huellas para hoy'
                    : filtroActivo === 'Esta semana'
                    ? 'No hay huellas esta semana'
                    : filtroActivo === 'La semana pasada'
                    ? 'No hay huellas la semana pasada'
                    : filtroActivo === 'El mes pasado'
                    ? 'No hay huellas el mes pasado'
                    : 'No hay huellas')
                : (filtroActivo === 'Hoy'
                    ? 'No hay huellas para hoy'
                    : filtroActivo === 'Esta semana'
                    ? 'No hay huellas esta semana'
                    : filtroActivo === 'La semana pasada'
                    ? 'No hay huellas la semana pasada'
                    : filtroActivo === 'El mes pasado'
                    ? 'No hay huellas el mes pasado'
                    : 'Momentos compartidos con tus vínculos')}
            </Text>
            <Text style={styles.emptySubtext}>
              {contactos.length === 0
                ? 'Para usar Huellas necesitas al menos un vínculo. Ve a la pestaña Vínculos y agrega un contacto desde tu agenda.'
                : 'Registra almuerzos, llamadas, quedadas… Toca el micrófono flotante y elige "Huella".'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargarDatos(); }} colors={[COLORES.agua]} />
        }
      />

      {/* Modal Crear Huella */}
      <Modal visible={modalCrearVisible} animationType="slide" transparent onRequestClose={cerrarCrear}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              {pasoCrear === 'formulario' ? (
                <TouchableOpacity onPress={volverASelectorContacto} style={styles.modalBack}>
                  <Ionicons name="arrow-back" size={24} color={COLORES.agua} />
                  <Text style={styles.modalBackText}>Contactos</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.modalTitle}>¿Agregar una huella?</Text>
              )}
              <TouchableOpacity onPress={cerrarCrear}>
                <Ionicons name="close" size={24} color={COLORES.texto} />
              </TouchableOpacity>
            </View>
            {pasoCrear === 'contacto' && (
              <View style={styles.modalBody}>
                <Text style={styles.modalSubtitle}>Elige el contacto.</Text>
                {contactos.length === 0 ? (
                  <View style={styles.modalEmpty}>
                    <Text style={styles.modalEmptyText}>No hay contactos</Text>
                    <Text style={styles.modalEmptyHint}>Añade contactos desde la pestaña Vínculos.</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                    {contactos.map((item) => (
                      <TouchableOpacity
                        key={item._id}
                        style={styles.modalBurbujaWrap}
                        onPress={() => {
                          setContactoSeleccionado(item);
                          setPasoCrear('formulario');
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.modalBurbuja}>
                          {item.foto ? (
                            <Image source={{ uri: item.foto }} style={styles.modalBurbujaImagen} />
                          ) : (
                            <View style={styles.modalBurbujaInicial}>
                              <Text style={styles.modalBurbujaInicialText} numberOfLines={1}>{(item.nombre || '?').charAt(0).toUpperCase()}</Text>
                            </View>
                          )}
                          <Text style={styles.modalBurbujaNombre} numberOfLines={1}>{item.nombre || 'Sin nombre'}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
            {pasoCrear === 'formulario' && contactoSeleccionado && (
              <>
                <View style={styles.modalParaQuien}>
                  {contactoSeleccionado.foto ? (
                    <Image source={{ uri: contactoSeleccionado.foto }} style={styles.modalAvatar} />
                  ) : (
                    <View style={styles.modalAvatarPlaceholder}>
                      <Text style={styles.modalAvatarInicial}>{(contactoSeleccionado.nombre || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.modalParaQuienNombre}>{contactoSeleccionado.nombre}</Text>
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
                  <TouchableOpacity
                    style={styles.modalDateButton}
                    onPress={() => { setDatePickerModeCrear('date'); setShowDatePickerCrear(true); }}
                  >
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
                  <TouchableOpacity style={styles.modalCancelButton} onPress={volverASelectorContacto}>
                    <Text style={styles.modalCancelText}>Cambiar contacto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSaveButton, (!nuevaDescripcion.trim() || guardando) && { opacity: 0.6 }]}
                    onPress={guardarNuevaHuella}
                    disabled={!nuevaDescripcion.trim() || guardando}
                  >
                    {guardando ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.modalSaveText}>Guardar huella</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORES.fondo },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: COLORES.fondo,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: COLORES.texto },
  headerSubtitle: { fontSize: 15, color: COLORES.textoSecundario, marginTop: 6 },
  desplegablesRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  desplegableWrap: { flex: 1 },
  desplegableLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  desplegableLabel: { fontSize: 12, fontWeight: '600', color: COLORES.textoSecundario },
  desplegableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: COLORES.fondoSecundario,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  desplegableButtonText: { fontSize: 15, fontWeight: '500', color: COLORES.texto, flex: 1 },
  dropdownOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 24 },
  dropdownContent: { backgroundColor: COLORES.fondo, borderRadius: 16, paddingVertical: 8, maxHeight: 320 },
  dropdownList: { maxHeight: 260 },
  dropdownTitle: { fontSize: 14, fontWeight: '600', color: COLORES.textoSecundario, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORES.fondoSecundario },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  dropdownItemActive: { backgroundColor: COLORES.fondoSecundario },
  dropdownItemText: { fontSize: 16, color: COLORES.texto, fontWeight: '500' },
  dropdownItemTextActive: { color: COLORES.agua, fontWeight: '600' },
  listContent: { padding: 20, paddingTop: 8 },
  huellaItem: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  huellaLeft: { flexDirection: 'row', alignItems: 'center' },
  contactoAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  contactoAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORES.fondoSecundario, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarInicial: { fontSize: 18, fontWeight: '600', color: COLORES.textoSecundario },
  huellaInfo: { flex: 1 },
  huellaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  huellaContacto: { fontSize: 16, fontWeight: '600', color: COLORES.texto, flex: 1, marginRight: 8 },
  huellaFecha: { fontSize: 12, color: COLORES.textoSecundario },
  huellaDescripcion: { fontSize: 14, color: COLORES.textoSecundario, lineHeight: 20 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyText: { fontSize: 18, fontWeight: '600', color: COLORES.texto, marginTop: 16, textAlign: 'center' },
  emptySubtext: { fontSize: 15, color: COLORES.textoSecundario, marginTop: 12, textAlign: 'center', lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORES.fondo, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORES.fondoSecundario },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORES.texto },
  modalBack: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalBackText: { fontSize: 16, color: COLORES.agua, fontWeight: '600' },
  modalBody: { paddingHorizontal: 20, paddingVertical: 16 },
  modalSubtitle: { fontSize: 15, color: COLORES.texto, marginBottom: 12 },
  modalEmpty: { alignItems: 'center', paddingVertical: 24 },
  modalEmptyText: { fontSize: 16, color: COLORES.texto, fontWeight: '600' },
  modalEmptyHint: { fontSize: 14, color: COLORES.textoSecundario, marginTop: 8 },
  modalList: { maxHeight: 320 },
  modalListContent: { paddingBottom: 20, gap: 12 },
  modalBurbujaWrap: { marginBottom: 12 },
  modalBurbuja: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORES.fondoSecundario },
  modalBurbujaImagen: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  modalBurbujaInicial: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORES.aguaClaro, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  modalBurbujaInicialText: { fontSize: 18, fontWeight: '700', color: COLORES.agua },
  modalBurbujaNombre: { fontSize: 16, color: COLORES.texto, flex: 1 },
  modalParaQuien: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORES.fondoSecundario },
  modalAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  modalAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORES.aguaClaro, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  modalAvatarInicial: { fontSize: 18, fontWeight: '700', color: COLORES.agua },
  modalParaQuienNombre: { fontSize: 16, fontWeight: '600', color: COLORES.texto },
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
