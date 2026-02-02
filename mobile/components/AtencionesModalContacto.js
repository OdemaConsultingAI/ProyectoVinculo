/**
 * Modal reutilizable: mismas atenciones (tareas/gestos) que la pestaña Atenciones
 * pero filtrado a un solo contacto. Unifica código entre GestosScreen y modal de contacto.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORES } from '../constants/colores';
import { TIPOS_DE_GESTO_DISPLAY, GESTO_ICON_CONFIG } from '../constants/tiposDeGesto';
import { useVoiceGlobal } from '../context/VoiceGlobalContext';
import VoiceFABOnly from './VoiceFABOnly';
import { updateContactTareas } from '../services/syncService';
import { formatTime12h } from '../utils/dateTime';

const getGestoConfig = (clasificacion) => GESTO_ICON_CONFIG[clasificacion] || GESTO_ICON_CONFIG['Otro'];
const limpiarTelefono = (telf) => (telf || '').replace(/[^\d+]/g, '');

const FILTROS_TIEMPO = ['Hoy', 'Semana', 'Mes', 'Todas'];

function SelectorChips({ opciones, seleccionado, onSelect, colorActive }) {
  return (
    <View style={styles.chipContainer}>
      {opciones.map((op) => (
        <TouchableOpacity
          key={op}
          style={[styles.chip, seleccionado === op && { backgroundColor: colorActive, borderColor: colorActive }]}
          onPress={() => onSelect(op)}
        >
          <Text style={[styles.chipText, seleccionado === op && { color: 'white' }]}>{op}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AtencionesModalContacto({ visible, onClose, contact, onContactUpdate, onRequestVoice }) {
  const { setModalWithVoiceOpen } = useVoiceGlobal();
  useEffect(() => {
    if (visible) setModalWithVoiceOpen(true);
    return () => setModalWithVoiceOpen(false);
  }, [visible, setModalWithVoiceOpen]);

  const [filtroTiempo, setFiltroTiempo] = useState('Todas');
  const [filtroTipo, setFiltroTipo] = useState('Todas');
  const [dropdownFiltroVisible, setDropdownFiltroVisible] = useState(false);
  const [dropdownTipoVisible, setDropdownTipoVisible] = useState(false);
  const [modalAgregarVisible, setModalAgregarVisible] = useState(false);
  const [modalHistorialVisible, setModalHistorialVisible] = useState(false);
  const [textoTarea, setTextoTarea] = useState('');
  const [clasificacionTarea, setClasificacionTarea] = useState(TIPOS_DE_GESTO_DISPLAY[0] || 'Llamar');
  const [tareaRecurrenteAnual, setTareaRecurrenteAnual] = useState(false);
  const [tareaDesdeTarea, setTareaDesdeTarea] = useState(null);

  const tareasContacto = contact?.tareas || [];
  const pendientes = tareasContacto.filter((t) => !t.completada);
  const historial = tareasContacto.filter((t) => t.completada);

  const filtrarPorTiempo = (list) => {
    if (filtroTiempo === 'Todas') return list;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return list.filter((t) => {
      const fe = t.fechaHoraEjecucion ? new Date(t.fechaHoraEjecucion) : null;
      if (!fe) return false;
      fe.setHours(0, 0, 0, 0);
      switch (filtroTiempo) {
        case 'Hoy':
          return fe.getTime() === hoy.getTime();
        case 'Semana': {
          const fin = new Date(hoy);
          fin.setDate(fin.getDate() + 7);
          return t.fechaHoraEjecucion && new Date(t.fechaHoraEjecucion) >= hoy && new Date(t.fechaHoraEjecucion) < fin;
        }
        case 'Mes': {
          const finMes = new Date(hoy);
          finMes.setMonth(finMes.getMonth() + 1);
          return t.fechaHoraEjecucion && new Date(t.fechaHoraEjecucion) >= hoy && new Date(t.fechaHoraEjecucion) < finMes;
        }
        default:
          return true;
      }
    });
  };

  const filtrarPorTipo = (list) =>
    filtroTipo === 'Todas' ? list : list.filter((t) => (t.clasificacion || 'Otro') === filtroTipo);

  const pendientesFiltradas = useMemo(() => {
    const f = filtrarPorTipo(filtrarPorTiempo(pendientes));
    return [...f].sort((a, b) => {
      const fa = a.fechaHoraEjecucion ? new Date(a.fechaHoraEjecucion).getTime() : 0;
      const fb = b.fechaHoraEjecucion ? new Date(b.fechaHoraEjecucion).getTime() : 0;
      return fa - fb;
    });
  }, [pendientes, filtroTiempo, filtroTipo]);

  const historialOrdenado = useMemo(
    () =>
      [...historial].sort((a, b) => {
        const fa = a.fechaHoraCompletado ? new Date(a.fechaHoraCompletado).getTime() : 0;
        const fb = b.fechaHoraCompletado ? new Date(b.fechaHoraCompletado).getTime() : 0;
        return fb - fa;
      }),
    [historial]
  );

  const formatearFechaGesto = (fecha) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaTarea = new Date(fecha);
    fechaTarea.setHours(0, 0, 0, 0);
    const diffDias = Math.floor((fechaTarea - hoy) / (1000 * 60 * 60 * 24));
    if (diffDias === 0) return 'Hoy';
    if (diffDias === 1) return 'Mañana';
    if (diffDias === -1) return 'Ayer';
    if (diffDias > 1 && diffDias <= 7) return `En ${diffDias} días`;
    if (diffDias < -1 && diffDias >= -7) return `Hace ${Math.abs(diffDias)} días`;
    return fechaTarea.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: fechaTarea.getFullYear() !== hoy.getFullYear() ? 'numeric' : undefined,
    });
  };

  const formatearHoraGesto = (fecha) => formatTime12h(fecha);

  const getPrioridadColorGesto = (fechaEjecucion) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaTarea = new Date(fechaEjecucion);
    fechaTarea.setHours(0, 0, 0, 0);
    const diffDias = Math.floor((fechaTarea - hoy) / (1000 * 60 * 60 * 24));
    if (diffDias < 0) return COLORES.urgente;
    if (diffDias === 0 || diffDias <= 3) return COLORES.atencion;
    return COLORES.activo;
  };

  const ejecutarAccionGesto = (item) => {
    const config = getGestoConfig(item.clasificacion || 'Otro');
    const telefono = contact?.telefono ? limpiarTelefono(contact.telefono) : '';
    if (config.action === 'call' && telefono) Linking.openURL(`tel:${telefono}`);
    else if (config.action === 'whatsapp' && telefono) Linking.openURL(`whatsapp://send?phone=${telefono}`);
  };

  const agregarTarea = async () => {
    if (!textoTarea.trim()) {
      Alert.alert('Atención', 'Describe la atención.');
      return;
    }
    if (!contact?._id) {
      Alert.alert('Error', 'El contacto debe estar guardado antes de agregar atenciones.');
      return;
    }
    const tareasExistentes = Array.isArray(contact.tareas) ? contact.tareas : [];
    const nuevaTarea = {
      fechaHoraCreacion: new Date(),
      descripcion: textoTarea.trim(),
      fechaHoraEjecucion: new Date(),
      clasificacion: clasificacionTarea,
      completada: false,
      interaccionRelacionada: tareaDesdeTarea?._id || null,
      ...(tareaRecurrenteAnual && {
        recurrencia: { tipo: 'anual', fechaBase: new Date() },
        completadoParaAno: [],
      }),
    };
    const tareasActualizadas = [...tareasExistentes, nuevaTarea];
    try {
      const result = await updateContactTareas(contact._id, tareasActualizadas);
      if (result.success && result.contacto && onContactUpdate) {
        onContactUpdate(result.contacto);
        setTextoTarea('');
        setClasificacionTarea(TIPOS_DE_GESTO_DISPLAY[0] || 'Llamar');
        setTareaRecurrenteAnual(false);
        setTareaDesdeTarea(null);
        setModalAgregarVisible(false);
        Alert.alert('Atención guardada', 'La atención se guardó correctamente.');
      } else {
        Alert.alert('Error', 'No se pudo guardar la atención.');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo guardar la atención.');
    }
  };

  const toggleTareaCompletada = async (index) => {
    if (!contact?._id) return;
    const tareasActualizadas = [...(contact.tareas || [])];
    const tarea = tareasActualizadas[index];
    const nuevaCompletada = !tarea.completada;
    if (nuevaCompletada) {
      tareasActualizadas[index].fechaHoraCompletado = new Date();
      tareasActualizadas[index].completada = true;
      if (tarea.recurrencia?.tipo === 'anual') {
        const anio = new Date().getFullYear();
        tareasActualizadas[index].completadoParaAno = [...(tarea.completadoParaAno || []), anio].filter((v, i, a) => a.indexOf(v) === i);
      }
    } else {
      delete tareasActualizadas[index].fechaHoraCompletado;
      tareasActualizadas[index].completada = false;
      if (tarea.recurrencia?.tipo === 'anual' && tarea.completadoParaAno?.length) {
        const anio = new Date().getFullYear();
        tareasActualizadas[index].completadoParaAno = (tarea.completadoParaAno || []).filter((y) => y !== anio);
      }
    }
    try {
      const result = await updateContactTareas(contact._id, tareasActualizadas);
      if (result.success && result.contacto && onContactUpdate) onContactUpdate(result.contacto);
      else Alert.alert('Error', 'No se pudo actualizar.');
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo actualizar.');
    }
  };

  const eliminarTarea = async (index) => {
    if (!contact?._id) return;
    Alert.alert(
      'Eliminar atención',
      '¿Estás seguro de eliminar esta atención?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const tareasActualizadas = [...(contact.tareas || [])];
            tareasActualizadas.splice(index, 1);
            try {
              const result = await updateContactTareas(contact._id, tareasActualizadas);
              if (result.success && result.contacto && onContactUpdate) onContactUpdate(result.contacto);
            } catch (e) {
              Alert.alert('Error', e.message || 'No se pudo eliminar.');
            }
          },
        },
      ]
    );
  };

  const crearTareaDesdeTarea = (tarea) => {
    setTareaDesdeTarea(tarea);
    setTextoTarea(tarea.descripcion || '');
    setClasificacionTarea(tarea.clasificacion || TIPOS_DE_GESTO_DISPLAY[0] || 'Llamar');
    setModalAgregarVisible(true);
  };

  const abrirAgregar = () => {
    setTareaDesdeTarea(null);
    setTextoTarea('');
    setClasificacionTarea(TIPOS_DE_GESTO_DISPLAY[0] || 'Llamar');
    setTareaRecurrenteAnual(false);
    setModalAgregarVisible(true);
  };

  const renderGestoCard = (item, idxOrig, esHistorial) => {
    const clasificacion = item.clasificacion || 'Otro';
    const gestoConfig = getGestoConfig(clasificacion);
    const tieneAccion = gestoConfig.action && contact?.telefono;
    const fechaEjecucion = item.fechaHoraEjecucion ? new Date(item.fechaHoraEjecucion) : null;
    return (
      <View key={`${item.fechaHoraCreacion || item._id}-${idxOrig}`} style={[styles.tareaItem, item.completada && styles.tareaItemCompletada]}>
        <View style={styles.tareaLeft}>
          {!esHistorial && (
            <>
              <TouchableOpacity style={styles.editButton} onPress={() => crearTareaDesdeTarea(item)}>
                <Ionicons name="brush-outline" size={22} color={COLORES.agua} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.editButton} onPress={() => eliminarTarea(idxOrig)}>
                <Ionicons name="trash-outline" size={20} color={COLORES.urgente} />
              </TouchableOpacity>
            </>
          )}
          {esHistorial && (
            <TouchableOpacity style={styles.editButton} onPress={() => toggleTareaCompletada(idxOrig)}>
              <Ionicons name="checkmark-done" size={22} color={COLORES.activo} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.tareaInfo}>
          <View style={styles.tareaHeader}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.tareaTitulo} numberOfLines={1}>
                {gestoConfig.emoji} {gestoConfig.actionLabel ?? clasificacion}
              </Text>
              {item.recurrencia?.tipo === 'anual' && (
                <View style={styles.recurrenteBadge}>
                  <Text style={styles.recurrenteText}>Anual</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!esHistorial && (
                <TouchableOpacity onPress={() => toggleTareaCompletada(idxOrig)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={item.completada ? 'checkmark-done' : 'checkbox-outline'} size={22} color={item.completada ? COLORES.activo : COLORES.textoSecundario} />
                </TouchableOpacity>
              )}
              {esHistorial && (
                <TouchableOpacity onPress={() => toggleTareaCompletada(idxOrig)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="checkmark-done" size={22} color={COLORES.activo} />
                </TouchableOpacity>
              )}
              <Text style={styles.tareaContactoDerecha} numberOfLines={1}>{contact?.nombre || '—'}</Text>
            </View>
          </View>
          {item.audioBase64 ? (
            <>
              <Text style={[styles.tareaDescripcion, item.completada && styles.tareaDescripcionCompletada]}>[Nota de voz]</Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}
                onPress={async () => {
                  const { playFromBase64 } = await import('../services/voiceToTaskService');
                  const r = await playFromBase64(item.audioBase64);
                  if (r.error) Alert.alert('Audio', r.error);
                }}
              >
                <Ionicons name="play-circle" size={24} color={COLORES.agua} />
                <Text style={{ fontSize: 14, color: COLORES.agua }}>Reproducir</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[styles.tareaDescripcion, item.completada && styles.tareaDescripcionCompletada]} numberOfLines={2}>{item.descripcion}</Text>
          )}
          {fechaEjecucion && (
            <View style={styles.tareaMeta}>
              <View style={[styles.prioridadBadge, { backgroundColor: getPrioridadColorGesto(fechaEjecucion) }]}>
                <Text style={styles.prioridadText}>{formatearFechaGesto(fechaEjecucion)}</Text>
              </View>
              <View style={styles.horaContainer}>
                <Ionicons name="time-outline" size={14} color={COLORES.textoSecundario} />
                <Text style={styles.horaText}>{formatearHoraGesto(fechaEjecucion)}</Text>
              </View>
            </View>
          )}
          {item.completada && item.fechaHoraCompletado && (
            <Text style={styles.completadaText}>
              ✅ {new Date(item.fechaHoraCompletado).toLocaleDateString('es-ES')} {formatTime12h(item.fechaHoraCompletado)}
            </Text>
          )}
          {tieneAccion ? (
            <TouchableOpacity style={[styles.accionButton, { backgroundColor: gestoConfig.color }]} onPress={() => ejecutarAccionGesto(item)} activeOpacity={0.8}>
              <Ionicons name={gestoConfig.icon} size={20} color="white" />
              <Text style={styles.accionText}>{gestoConfig.actionLabel ?? clasificacion}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.accionButton, styles.accionInactivo]}>
              <Text style={styles.accionEmoji}>{gestoConfig.emoji}</Text>
              <Text style={styles.accionTextInactivo}>{gestoConfig.actionLabel ?? clasificacion}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <>
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <Ionicons name="sparkles" size={24} color={COLORES.agua} />
              <Text style={styles.headerTitle} numberOfLines={1}>Atenciones de {contact?.nombre || 'Contacto'}</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close-circle" size={30} color={COLORES.textoSuave} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>
            {pendientesFiltradas.length} {pendientesFiltradas.length === 1 ? 'atención' : 'atenciones'}
          </Text>

        <View style={styles.desplegablesRow}>
          <View style={styles.desplegableWrap}>
            <View style={styles.desplegableLabelRow}>
              <Ionicons name="filter-outline" size={14} color={COLORES.textoSecundario} />
              <Text style={styles.desplegableLabel}>Filtro</Text>
            </View>
            <TouchableOpacity style={styles.desplegableButton} onPress={() => setDropdownFiltroVisible(true)} activeOpacity={0.7}>
              <Text style={styles.desplegableButtonText} numberOfLines={1}>{filtroTiempo}</Text>
              <Ionicons name="chevron-down" size={20} color={COLORES.textoSecundario} />
            </TouchableOpacity>
          </View>
          <View style={styles.desplegableWrap}>
            <View style={styles.desplegableLabelRow}>
              <Ionicons name="pricetag-outline" size={14} color={COLORES.textoSecundario} />
              <Text style={styles.desplegableLabel}>Tipo</Text>
            </View>
            <TouchableOpacity style={styles.desplegableButton} onPress={() => setDropdownTipoVisible(true)} activeOpacity={0.7}>
              <Text style={styles.desplegableButtonText} numberOfLines={1}>{filtroTipo}</Text>
              <Ionicons name="chevron-down" size={20} color={COLORES.textoSecundario} />
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={dropdownFiltroVisible} transparent animationType="fade" onRequestClose={() => setDropdownFiltroVisible(false)}>
          <View style={styles.dropdownOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDropdownFiltroVisible(false)} />
            <View style={styles.dropdownContent}>
              <Text style={styles.dropdownTitle}>Filtro</Text>
              <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
                {FILTROS_TIEMPO.map((op) => (
                  <TouchableOpacity
                    key={op}
                    style={[styles.dropdownItem, filtroTiempo === op && styles.dropdownItemActive]}
                    onPress={() => { setFiltroTiempo(op); setDropdownFiltroVisible(false); }}
                  >
                    <Text style={[styles.dropdownItemText, filtroTiempo === op && styles.dropdownItemTextActive]}>{op}</Text>
                    {filtroTiempo === op && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
        <Modal visible={dropdownTipoVisible} transparent animationType="fade" onRequestClose={() => setDropdownTipoVisible(false)}>
          <View style={styles.dropdownOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDropdownTipoVisible(false)} />
            <View style={styles.dropdownContent}>
              <Text style={styles.dropdownTitle}>Tipo de atención</Text>
              <ScrollView style={styles.dropdownList} showsVerticalScrollIndicator={false}>
                {['Todas', ...TIPOS_DE_GESTO_DISPLAY].map((op) => (
                  <TouchableOpacity
                    key={op}
                    style={[styles.dropdownItem, filtroTipo === op && styles.dropdownItemActive]}
                    onPress={() => { setFiltroTipo(op); setDropdownTipoVisible(false); }}
                  >
                    <Text style={[styles.dropdownItemText, filtroTipo === op && styles.dropdownItemTextActive]} numberOfLines={1}>{op}</Text>
                    {filtroTipo === op && <Ionicons name="checkmark" size={20} color={COLORES.agua} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {pendientesFiltradas.length === 0 && historial.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="sparkles-outline" size={48} color={COLORES.textoSecundario} />
              <Text style={styles.emptyText}>No hay atenciones para este contacto</Text>
              <Text style={[styles.emptyText, { fontSize: 14, marginTop: 4 }]}>Usa el botón del micrófono para nota de voz o Historial arriba</Text>
            </View>
          ) : (
            <>
              {pendientesFiltradas.map((item, i) => {
                const idxOrig = (contact?.tareas || []).indexOf(item);
                return renderGestoCard(item, idxOrig, false);
              })}
              {historialOrdenado.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.historialTitle}>Historial</Text>
                  {historialOrdenado.map((item, i) => {
                    const idxOrig = (contact?.tareas || []).indexOf(item);
                    return renderGestoCard(item, idxOrig, true);
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
        </View>
        <VoiceFABOnly />
      </View>
    </Modal>

      {/* Modal Agregar atención */}
      <Modal animationType="slide" transparent visible={modalAgregarVisible} onRequestClose={() => setModalAgregarVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
          <View style={styles.modalHeaderImportar}>
            <Text style={styles.modalTitleImportar}>Agregar atención</Text>
            <TouchableOpacity onPress={() => setModalAgregarVisible(false)} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={COLORES.agua} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalGestosDeNombre}>Para {contact?.nombre || 'Contacto'}</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.nuevaInteraccionContainer}>
              <Text style={styles.label}>Descripción de la atención</Text>
              <TextInput
                style={styles.inputNuevaInteraccion}
                value={textoTarea}
                onChangeText={setTextoTarea}
                placeholder="Notas de la atención (ej: Preguntar por su perro)..."
                multiline
              />
              <Text style={styles.label}>Clasificación</Text>
              <SelectorChips opciones={TIPOS_DE_GESTO_DISPLAY} seleccionado={clasificacionTarea} colorActive={COLORES.agua} onSelect={setClasificacionTarea} />
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }} onPress={() => setTareaRecurrenteAnual(!tareaRecurrenteAnual)}>
                <Ionicons name={tareaRecurrenteAnual ? 'checkbox' : 'checkbox-outline'} size={22} color={tareaRecurrenteAnual ? COLORES.agua : COLORES.textoSecundario} />
                <Text style={[styles.label, { marginBottom: 0, fontSize: 14 }]}>Repetir cada año (ej. cumpleaños)</Text>
              </TouchableOpacity>
              {tareaDesdeTarea && (
                <Text style={[styles.label, { fontSize: 12, color: COLORES.textoSecundario, marginTop: 8 }]}>Creando desde: {tareaDesdeTarea.descripcion}</Text>
              )}
              <TouchableOpacity
                style={[styles.addButton, !textoTarea.trim() && styles.addButtonDisabled]}
                onPress={agregarTarea}
                disabled={!textoTarea.trim()}
              >
                <Ionicons name="create-outline" size={20} color="white" />
                <Text style={styles.addButtonText}>Agregar atención</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Historial */}
      <Modal animationType="slide" transparent visible={modalHistorialVisible} onRequestClose={() => setModalHistorialVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
          <View style={styles.modalHeaderImportar}>
            <Text style={styles.modalTitleImportar}>Historial de atenciones</Text>
            <TouchableOpacity onPress={() => setModalHistorialVisible(false)} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={COLORES.agua} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalGestosDeNombre}>{contact?.nombre || 'Contacto'}</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {historialOrdenado.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="sparkles" size={48} color={COLORES.textoSecundario} />
                <Text style={styles.emptyText}>No hay atenciones completadas</Text>
              </View>
            ) : (
              historialOrdenado.map((item, i) => {
                const idxOrig = (contact?.tareas || []).indexOf(item);
                return renderGestoCard(item, idxOrig, true);
              })
            )}
          </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORES.fondo, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
  headerActionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerActionText: { fontSize: 14, fontWeight: '600', color: COLORES.agua },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORES.texto, flex: 1 },
  headerSubtitle: { fontSize: 15, color: COLORES.textoSecundario, marginTop: 4, paddingHorizontal: 20, paddingBottom: 12 },
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
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: COLORES.textoSecundario, marginTop: 16, textAlign: 'center' },
  historialTitle: { fontSize: 16, fontWeight: '700', color: COLORES.texto, marginTop: 20, marginBottom: 12, marginHorizontal: 0 },
  tareaItem: {
    flexDirection: 'row',
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
  tareaItemCompletada: { opacity: 0.7, backgroundColor: COLORES.fondoSecundario },
  tareaLeft: { flexDirection: 'column', alignItems: 'center', marginRight: 12, gap: 8 },
  editButton: { padding: 4 },
  tareaInfo: { flex: 1 },
  tareaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tareaTitulo: { fontSize: 16, fontWeight: '600', color: COLORES.texto, flex: 1, marginRight: 8 },
  tareaContactoDerecha: { fontSize: 14, fontWeight: '600', color: COLORES.textoSecundario, maxWidth: '45%', textAlign: 'right' },
  recurrenteBadge: { backgroundColor: COLORES.agua, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  recurrenteText: { fontSize: 11, fontWeight: '600', color: 'white' },
  tareaDescripcion: { fontSize: 14, color: COLORES.textoSecundario, marginBottom: 12, lineHeight: 20 },
  tareaDescripcionCompletada: { textDecorationLine: 'line-through', color: '#95A5A6' },
  tareaMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prioridadBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  prioridadText: { fontSize: 12, fontWeight: '600', color: 'white' },
  horaContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  horaText: { fontSize: 12, color: COLORES.textoSecundario },
  completadaText: { fontSize: 12, color: COLORES.activo, marginBottom: 8 },
  accionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, marginTop: 12, gap: 8 },
  accionText: { fontSize: 15, fontWeight: '600', color: 'white' },
  accionInactivo: { backgroundColor: COLORES.fondoSecundario },
  accionEmoji: { fontSize: 18 },
  accionTextInactivo: { fontSize: 15, fontWeight: '600', color: COLORES.textoSecundario },
  modalHeaderImportar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E8ED',
  },
  modalTitleImportar: { fontSize: 24, fontWeight: 'bold', color: COLORES.texto },
  modalCloseButton: { padding: 4 },
  modalGestosDeNombre: { fontSize: 15, color: COLORES.textoSecundario, paddingHorizontal: 20, marginBottom: 8 },
  nuevaInteraccionContainer: { backgroundColor: 'white', padding: 12, borderBottomWidth: 1, borderBottomColor: '#E1E8ED' },
  label: { fontSize: 14, fontWeight: '600', color: COLORES.textoSecundario, marginBottom: 8, marginTop: 10 },
  inputNuevaInteraccion: {
    backgroundColor: COLORES.fondoSecundario,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: COLORES.texto,
    minHeight: 56,
    maxHeight: 100,
    marginBottom: 12,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORES.burbujaBorde || '#ddd',
  },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORES.burbujaBorde || '#ddd', marginRight: 8, marginBottom: 8, backgroundColor: 'white' },
  chipText: { color: '#7F8C8D', fontWeight: '600', fontSize: 13 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORES.agua,
    padding: 10,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  addButtonDisabled: { backgroundColor: COLORES.textoSecundario, opacity: 0.6 },
  addButtonText: { color: 'white', fontSize: 14, fontWeight: '600' },
});
