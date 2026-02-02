import React, { useEffect, useState, useRef, useMemo } from 'react';
import { StyleSheet, View, Text, Dimensions, ActivityIndicator, PanResponder, Animated, TouchableOpacity, FlatList, Linking, Alert, TextInput, Modal, ScrollView, Image, KeyboardAvoidingView, Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker'; 
import DateTimePicker from '@react-native-community/datetimepicker'; 
import { Ionicons } from '@expo/vector-icons'; 
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { API_URL } from '../constants/api';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.30;

const PRIORIDADES = ['💖 Alta', '✨ Media', '💤 Baja'];
const FRECUENCIAS = ['Diario', 'Semanal', 'Mensual', 'Cumpleaños'];
const CLASIFICACIONES = ['Familia', 'Mejor Amigo', 'Amigo', 'Trabajo', 'Conocido'];

export default function ContactosScreen() {
  // --- ESTADOS ---
  const [misContactos, setMisContactos] = useState([]); 
  const [vipHistorico, setVipHistorico] = useState([]); 
  const [busqueda, setBusqueda] = useState(''); 
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [pilaAcciones, setPilaAcciones] = useState([]); 
  const [modoJuego, setModoJuego] = useState(false);

  const activeIndex = useRef(0);
  const contactsRef = useRef([]);
  const position = useRef(new Animated.ValueXY()).current;
  const isSwiping = useRef(false);

  const [modalVisible, setModalVisible] = useState(false); 
  const [modalSelectorVisible, setModalSelectorVisible] = useState(false);
  const [datosEditados, setDatosEditados] = useState({}); 
  const [agendaTelefonica, setAgendaTelefonica] = useState([]);
  const [filtroAgenda, setFiltroAgenda] = useState('');
  const [guardando, setGuardando] = useState(false); 

  const [diaCumple, setDiaCumple] = useState('');
  const [mesCumple, setMesCumple] = useState('');
  const [anioCumple, setAnioCumple] = useState('');
  const [edadCalculada, setEdadCalculada] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateMode, setDateMode] = useState('date'); 

  useEffect(() => { activeIndex.current = currentIndex; }, [currentIndex]);
  useEffect(() => { contactsRef.current = misContactos; }, [misContactos]);

  const normalizarTelefono = (telf) => telf ? telf.replace(/[^\d]/g, '') : '';
  const limpiarTelefonoVisual = (telf) => telf ? telf.replace(/[^\d+]/g, '') : '';

  useEffect(() => {
    if (anioCumple && mesCumple && diaCumple && anioCumple.length === 4) {
        const hoy = new Date();
        const nacimiento = new Date(anioCumple, mesCumple - 1, diaCumple);
        let edad = hoy.getFullYear() - nacimiento.getFullYear();
        if (hoy < new Date(hoy.getFullYear(), mesCumple - 1, diaCumple)) edad--;
        setEdadCalculada(edad);
    } else { setEdadCalculada(null); }
  }, [diaCumple, mesCumple, anioCumple]);

  useEffect(() => { 
      cargarHistorialVIP(); 
      preCargarJuego();
  }, []);

  const preCargarJuego = async () => {
    const { status } = await Contacts.getPermissionsAsync();
    if(status === 'granted') prepararDatosJuego(true); 
  };

  const cargarHistorialVIP = async () => {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        setVipHistorico(data.reverse()); 
        setCargando(false);
    } catch (error) { setCargando(false); }
  };

  const guardarEnServidor = async (datos) => {
      try {
        const datosLimpios = { ...datos, telefono: limpiarTelefonoVisual(datos.telefono) };
        await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datosLimpios) });
        return true;
      } catch (error) { return false; }
  };

  const borrarDelServidor = async (telefonoRaw) => {
    try {
        await fetch(API_URL, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefono: telefonoRaw }) });
        return true;
    } catch (error) { return false; }
  };

  const prepararDatosJuego = async (silent = false) => {
      if(!silent) setCargando(true);
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
          const { data } = await Contacts.getContactsAsync({
              fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Image],
          });
          const validos = data.filter(c => c.name && c.phoneNumbers && c.phoneNumbers[0]);
          const aleatorios = validos.sort(() => 0.5 - Math.random()).slice(0, 30); 
          setMisContactos(aleatorios);
          setCurrentIndex(0); 
          activeIndex.current = 0; 
          setPilaAcciones([]); 
          isSwiping.current = false;
      }
      if(!silent) setCargando(false);
  };

  const activarModoJuego = async () => {
      if (misContactos.length === 0) await prepararDatosJuego();
      setModoJuego(true);
  };

  const cerrarModoJuego = () => {
      setModoJuego(false);
      prepararDatosJuego(true);
  };

  const onSwipeComplete = (direction) => {
    const idx = activeIndex.current;
    const item = contactsRef.current[idx];
    if (!item) return;

    setPilaAcciones(prev => [...prev, { index: idx, tipo: direction === 'right' ? 'guardar' : 'descartar', item }]);

    if (direction === 'right') {
        const datos = {
            nombre: item.name, telefono: limpiarTelefonoVisual(item.phoneNumbers[0].number),
            prioridad: '✨ Media', frecuencia: 'Mensual', clasificacion: 'Amigo', foto: ''
        };
        setVipHistorico(prev => [datos, ...prev]);
        guardarEnServidor(datos);
    }

    position.setValue({ x: 0, y: 0 });
    setCurrentIndex(prev => prev + 1);
    isSwiping.current = false;
  };
  
  const forceSwipe = (direction) => {
    if (isSwiping.current) return;
    isSwiping.current = true;
    const x = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
    Animated.timing(position, { toValue: { x, y: 0 }, duration: 250, useNativeDriver: false }).start(() => onSwipeComplete(direction));
  };

  const deshacerAccion = () => {
      if (isSwiping.current || pilaAcciones.length === 0 || currentIndex === 0) return;
      isSwiping.current = true;
      const ultima = pilaAcciones[pilaAcciones.length - 1];
      if (ultima.tipo === 'guardar') {
          const telf = limpiarTelefonoVisual(ultima.item.phoneNumbers[0].number);
          setVipHistorico(prev => prev.filter(c => c.telefono !== telf));
          borrarDelServidor(telf);
      }
      setPilaAcciones(prev => prev.slice(0, -1));
      setCurrentIndex(prev => prev - 1);
      position.setValue({ x: 0, y: 0 });
      isSwiping.current = false;
  };

  const panResponder = useMemo(() => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
          if (isSwiping.current) return;
          position.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (isSwiping.current) return;
        if (gestureState.dx > SWIPE_THRESHOLD) forceSwipe('right');
        else if (gestureState.dx < -SWIPE_THRESHOLD) forceSwipe('left');
        else Animated.spring(position, { toValue: { x, y: 0 }, friction: 6, tension: 60, useNativeDriver: false }).start();
      }
    }), []);

  const getCardStyle = () => {
    if (!position || typeof position.x.interpolate !== 'function') return { transform: [{ rotate: '0deg' }] };
    const rotate = position.x.interpolate({ inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5], outputRange: ['-120deg', '0deg', '120deg'] });
    return { ...position.getLayout(), transform: [{ rotate }] };
  };

  const abrirDirectorio = async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
          setCargando(true);
          const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Image] });
          const validos = data.filter(c => c.name && c.phoneNumbers && c.phoneNumbers[0]);
          setAgendaTelefonica(validos.sort((a,b) => a.name.localeCompare(b.name)));
          setCargando(false);
          setModalSelectorVisible(true);
      } else { Alert.alert("Permiso denegado"); }
  };

  const importarContacto = async (c) => {
      const nuevo = { nombre: c.name, telefono: limpiarTelefonoVisual(c.phoneNumbers[0].number), prioridad: '✨ Media', frecuencia: 'Mensual', clasificacion: 'Conocido', foto: c.image ? c.image.uri : '' };
      setGuardando(true);
      if (await guardarEnServidor(nuevo)) {
          setVipHistorico(prev => [nuevo, ...prev]);
          setModalSelectorVisible(false);
          setFiltroAgenda('');
      }
      setGuardando(false);
  };

  const abrirModalVip = (item) => {
      const telfBuscado = normalizarTelefono(item.telefono);
      const contacto = vipHistorico.find(c => normalizarTelefono(c.telefono) === telfBuscado) || item;
      let prio = contacto.prioridad; if (!PRIORIDADES.includes(prio)) prio = '✨ Media';
      let freq = contacto.frecuencia; if (!FRECUENCIAS.includes(freq)) freq = 'Mensual';
      let clas = contacto.clasificacion; if (!CLASIFICACIONES.includes(clas)) clas = 'Amigo';
      const partes = (contacto.fechaNacimiento || '').split('/');
      setDiaCumple(partes[0] || ''); setMesCumple(partes[1] || ''); setAnioCumple(partes[2] || '');
      setDatosEditados({ ...contacto, telefonoOriginal: contacto.telefono, telefono: limpiarTelefonoVisual(contacto.telefono), prioridad: prio, frecuencia: freq, clasificacion: clas });
      setModalVisible(true);
  };

  const guardarCambios = async () => {
      setGuardando(true);
      let fechaNac = (diaCumple && mesCumple) ? `${diaCumple}/${mesCumple}` : '';
      if (fechaNac && anioCumple) fechaNac += `/${anioCumple}`;
      const nuevo = { ...datosEditados, fechaNacimiento: fechaNac };
      setVipHistorico(prev => [nuevo, ...prev.filter(c => c.telefono !== datosEditados.telefonoOriginal)]);
      if (datosEditados.telefonoOriginal) borrarDelServidor(datosEditados.telefonoOriginal);
      guardarEnServidor(nuevo);
      setGuardando(false); setModalVisible(false);
  };
  
  const elegirFoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'Images', allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
    if (!r.canceled) setDatosEditados(prev => ({ ...prev, foto: 'data:image/jpeg;base64,' + r.assets[0].base64 }));
  };

  const SelectorChips = ({ opciones, seleccionado, onSelect, colorActive }) => (
      <View style={styles.chipContainer}>
          {opciones.map(op => (
              <TouchableOpacity key={op} style={[styles.chip, seleccionado === op && { backgroundColor: colorActive, borderColor: colorActive }]} onPress={() => onSelect(op)}>
                  <Text style={[styles.chipText, seleccionado === op && { color: 'white' }]}>{op}</Text>
              </TouchableOpacity>
          ))}
      </View>
  );

  if (cargando) return <ActivityIndicator size="large" style={styles.center} />;

  if (modoJuego && misContactos.length > 0 && currentIndex < misContactos.length) {
      const contactoActual = misContactos[currentIndex];
      return (
        <View style={styles.gameContainer}>
            <View style={styles.gameHeader}>
                <TouchableOpacity onPress={cerrarModoJuego} style={styles.exitButton}>
                    <Ionicons name="close-circle" size={32} color="white" />
                    <Text style={styles.exitText}>Salir</Text>
                </TouchableOpacity>
            </View>
            <Text style={styles.gameTitle}>¿Cultivar relación?</Text>
            <View style={styles.cardArea}>
                <Animated.View key={currentIndex} style={[styles.card, getCardStyle()]} {...panResponder.panHandlers}>
                    <View style={styles.cardInner}>
                        {contactoActual.image ? <Image source={{ uri: contactoActual.image.uri }} style={styles.cardImage} /> : <Text style={styles.initial}>{contactoActual.name.charAt(0)}</Text>}
                        <Text style={styles.name}>{contactoActual.name}</Text>
                        <Text style={styles.number}>{contactoActual.phoneNumbers ? contactoActual.phoneNumbers[0].number : ''}</Text>
                    </View>
                </Animated.View>
                <View style={styles.buttonsOverlay}>
                    <TouchableOpacity style={[styles.controlBtn, styles.btnNo]} onPress={() => forceSwipe('left')}>
                        <Ionicons name="close" size={40} color="#FF3B30" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.controlBtn, styles.btnUndo, {opacity: currentIndex === 0 ? 0.3 : 1}]} onPress={deshacerAccion} disabled={currentIndex === 0}>
                        <Ionicons name="arrow-undo" size={40} color="#F1C40F" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.controlBtn, styles.btnYes]} onPress={() => forceSwipe('right')}>
                        <Ionicons name="heart" size={40} color="#2ECC71" />
                    </TouchableOpacity>
                </View>
            </View>
            <View style={{height: 100}} />
        </View>
      );
  }

  const listaFiltrada = busqueda ? vipHistorico.filter(i => i.nombre.toLowerCase().includes(busqueda.toLowerCase())) : vipHistorico;
  const listaAgendaFiltrada = agendaTelefonica.filter(c => c.name.toLowerCase().includes(filtroAgenda.toLowerCase()));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}> 
        <View style={styles.container}>
            <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                  <View style={styles.modalContent}>
                      <ScrollView showsVerticalScrollIndicator={false}>
                          <View style={styles.modalHeader}>
                              <Text style={styles.modalTitle}>Cultivar Relación 🌱</Text>
                              <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={30} color="#ddd" /></TouchableOpacity>
                          </View>
                          <TouchableOpacity style={styles.photoContainer} onPress={elegirFoto}>
                              {datosEditados.foto ? <Image key={datosEditados.foto.length} source={{ uri: datosEditados.foto }} style={styles.photo} /> : <View style={styles.photoPlaceholder}><Ionicons name="camera" size={35} color="#fff" /></View>}
                              <Text style={styles.photoLabel}>Cambiar foto</Text>
                          </TouchableOpacity>
                          <TextInput style={styles.inputName} value={datosEditados.nombre} onChangeText={(t) => setDatosEditados({...datosEditados, nombre: t})} placeholder="Nombre" />
                          <Text style={styles.phoneDisplay}>{datosEditados.telefono}</Text>
                          <View style={styles.sectionContainer}>
                              <Text style={styles.sectionTitle}>🎂 Cumpleaños {edadCalculada !== null && <Text style={{color:'#007AFF'}}>({edadCalculada} años)</Text>}</Text>
                              <View style={styles.birthdayRow}>
                                  <TextInput style={styles.inputDate} placeholder="Día" keyboardType="number-pad" maxLength={2} value={diaCumple} onChangeText={setDiaCumple} />
                                  <Text style={styles.slash}>/</Text>
                                  <TextInput style={styles.inputDate} placeholder="Mes" keyboardType="number-pad" maxLength={2} value={mesCumple} onChangeText={setMesCumple} />
                                  <Text style={styles.slash}>/</Text>
                                  <TextInput style={[styles.inputDate, {flex:1.5}]} placeholder="Año" keyboardType="number-pad" maxLength={4} value={anioCumple} onChangeText={setAnioCumple} />
                              </View>
                          </View>
                          <View style={styles.taskSection}>
                              <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: 10}}>
                                 <Text style={styles.sectionTitle}>📌 Próxima huella / Contexto</Text>
                                 <TouchableOpacity style={styles.dateBtn} onPress={() => { setDateMode('date'); setShowDatePicker(true); }}>
                                     <Ionicons name="calendar" size={16} color="white" />
                                     <Text style={styles.dateBtnText}>{datosEditados.fechaRecordatorio ? new Date(datosEditados.fechaRecordatorio).toLocaleDateString() : "Agendar"}</Text>
                                 </TouchableOpacity>
                              </View>
                              <TextInput style={styles.inputTask} value={datosEditados.proximaTarea} onChangeText={(t) => setDatosEditados({...datosEditados, proximaTarea: t})} placeholder="Ej: Llamar mañana..." multiline={true} />
                              {showDatePicker && (<DateTimePicker testID="dateTimePicker" value={datosEditados.fechaRecordatorio || new Date()} mode={dateMode} is24Hour={false} display="default" onChange={(e,d) => { if(e.type==='dismissed'){setShowDatePicker(false);return;} const curr=d||new Date(); if(dateMode==='date'){setDatosEditados({...datosEditados,fechaRecordatorio:curr});if(Platform.OS==='android'){setShowDatePicker(false);setTimeout(()=>{setDateMode('time');setShowDatePicker(true);},100);}else{setDateMode('time');}}else{setDatosEditados({...datosEditados,fechaRecordatorio:curr});setShowDatePicker(false);} }} />)}
                          </View>
                          <Text style={styles.label}>Círculo Social</Text><SelectorChips opciones={CLASIFICACIONES} seleccionado={datosEditados.clasificacion} colorActive="#FF9500" onSelect={(v) => setDatosEditados({...datosEditados, clasificacion: v})} />
                          <Text style={styles.label}>Importancia</Text><SelectorChips opciones={PRIORIDADES} seleccionado={datosEditados.prioridad} colorActive="#FF3B30" onSelect={(v) => setDatosEditados({...datosEditados, prioridad: v})} />
                          <Text style={styles.label}>Frecuencia de Riego</Text><SelectorChips opciones={FRECUENCIAS} seleccionado={datosEditados.frecuencia} colorActive="#34C759" onSelect={(v) => setDatosEditados({...datosEditados, frecuencia: v})} />
                          <TouchableOpacity style={styles.saveButton} onPress={guardarCambios} disabled={guardando}>
                              {guardando ? <ActivityIndicator color="white" /> : <Text style={styles.saveButtonText}>💾 Guardar Cambios</Text>}
                          </TouchableOpacity>
                          <View style={{height: 40}} />
                      </ScrollView>
                  </View>
              </KeyboardAvoidingView>
          </Modal>

            <Modal animationType="slide" visible={modalSelectorVisible} onRequestClose={() => setModalSelectorVisible(false)}>
              <View style={styles.modalFull}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Importar 📒</Text>
                      <TouchableOpacity onPress={() => setModalSelectorVisible(false)}><Text style={{fontSize:16, color:'#007AFF'}}>Cerrar</Text></TouchableOpacity>
                  </View>
                  <View style={styles.searchBarContainer}>
                      <Ionicons name="search" size={20} color="#8e8e93" />
                      <TextInput style={styles.searchInput} placeholder="Buscar..." value={filtroAgenda} onChangeText={setFiltroAgenda} />
                  </View>
                  <FlatList 
                      data={listaAgendaFiltrada}
                      keyExtractor={(item) => item.id}
                      renderItem={({item}) => (
                          <TouchableOpacity style={styles.contactItem} onPress={() => importarContacto(item)}>
                              <View style={[styles.avatar, {marginRight:15, backgroundColor:'#eee'}]}><Text>{item.name.charAt(0)}</Text></View>
                              <View><Text style={styles.itemName}>{item.name}</Text><Text style={styles.itemMeta}>{item.phoneNumbers ? item.phoneNumbers[0].number : ''}</Text></View>
                              <Ionicons name="add-circle" size={28} color="#34C759" style={{marginLeft:'auto'}} />
                          </TouchableOpacity>
                      )}
                  />
              </View>
            </Modal>

            <Text style={styles.header}>Contactos</Text>
            <View style={styles.actionButtonsRow}>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#2ECC71'}]} onPress={activarModoJuego}>
                    <Text style={{fontSize:24}}>🎮</Text><Text style={styles.actionBtnText}>Descubrir</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#3498DB'}]} onPress={abrirDirectorio}>
                    <Text style={{fontSize:24}}>📒</Text><Text style={styles.actionBtnText}>Importar</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.searchBarContainer}>
                <Ionicons name="search" size={20} color="#8e8e93" style={{marginRight: 8}} />
                <TextInput style={styles.searchInput} placeholder="Buscar..." value={busqueda} onChangeText={setBusqueda} />
            </View>

            <FlatList 
                data={listaFiltrada} 
                keyExtractor={(item, index) => item.telefono + item.prioridad + index.toString()} 
                extraData={vipHistorico} 
                contentContainerStyle={{paddingBottom: 100}}
                renderItem={({item}) => (
                    <Swipeable renderRightActions={() => <TouchableOpacity style={styles.deleteButton} onPress={() => borrarDelServidor(item.telefono).then(() => cargarHistorialVIP())}><Ionicons name="trash" size={28} color="white" /></TouchableOpacity>} renderLeftActions={() => <View style={styles.chatButtonSwipe}><Ionicons name="logo-whatsapp" size={28} color="white" /></View>} onSwipeableLeftOpen={() => Linking.openURL(`whatsapp://send?phone=${limpiarTelefonoVisual(item.telefono)}`)}>
                        <TouchableOpacity activeOpacity={0.9} onPress={() => abrirModalVip(item)}>
                          <View style={styles.itemCard}>
                              <View style={styles.avatarContainer}>
                                  {item.foto && item.foto.length > 20 ? <Image source={{ uri: item.foto }} style={styles.avatar} /> : <View style={[styles.avatar, {backgroundColor:'#eee', justifyContent:'center', alignItems:'center'}]}><Text style={{fontSize: 20, color:'#999'}}>{item.nombre ? item.nombre.charAt(0) : '?'}</Text></View>}
                                  {item.prioridad && item.prioridad.includes('Alta') && <View style={styles.badgeHeart}><Text>💖</Text></View>}
                              </View>
                              <View style={{flex: 1, paddingHorizontal: 12}}>
                                  <Text style={styles.itemName}>{item.nombre}</Text>
                                  <Text style={styles.itemMeta}>{item.clasificacion || 'Amigo'} • {item.frecuencia}</Text>
                                  {item.proximaTarea ? (<View style={styles.taskPreview}><Ionicons name="pin" size={12} color="#FF9500" style={{marginRight:4}} /><Text numberOfLines={1} style={styles.taskText}>{item.proximaTarea}</Text></View>) : null}
                              </View>
                              <TouchableOpacity style={styles.btnCallMini} onPress={() => Linking.openURL(`tel:${limpiarTelefonoVisual(item.telefono)}`)}><Ionicons name="call" size={18} color="white" /></TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                    </Swipeable>
                )}
                onRefresh={cargarHistorialVIP} refreshing={false}
            />
        </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', paddingTop: 50 },
  gameContainer: { flex: 1, backgroundColor: '#E74C3C', paddingTop: 40, alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 28, fontWeight: '800', marginHorizontal: 20, marginBottom: 10, color: '#2C3E50' },
  gameHeader: { width: '100%', paddingHorizontal: 20, marginBottom: 10, height: 40 },
  exitButton: { flexDirection: 'row', alignItems: 'center' },
  exitText: { fontWeight: 'bold', fontSize: 16, color: 'white', marginLeft: 5 },
  gameTitle: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 20, textAlign: 'center' },
  cardArea: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' },
  card: { width: SCREEN_WIDTH * 0.88, height: '75%', backgroundColor: 'white', borderRadius: 30, elevation: 10, shadowColor: '#000', shadowOpacity: 0.15 },
  cardInner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  cardImage: { width: 180, height: 180, borderRadius: 90, marginBottom: 40 },
  initial: { fontSize: 90, fontWeight: 'bold', color: '#ECF0F1', marginBottom: 20 },
  name: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#2C3E50' },
  number: { fontSize: 20, color: '#95A5A6' },
  buttonsOverlay: { 
      flexDirection: 'row', 
      justifyContent: 'space-evenly', 
      alignItems: 'center', 
      width: '100%', 
      marginTop: -40, 
      zIndex: 10,
  },
  controlBtn: { 
      width: 75, 
      height: 75, 
      borderRadius: 40, 
      backgroundColor: 'white', 
      justifyContent: 'center', 
      alignItems: 'center', 
      elevation: 8, 
      shadowColor: '#000', 
      shadowOffset: {width:0, height:4}, 
      shadowOpacity: 0.3, 
      shadowRadius: 4,
      borderWidth: 2,
  },
  btnNo: { borderColor: '#FF3B30' },
  btnYes: { borderColor: '#2ECC71' },
  btnUndo: { borderColor: '#F1C40F' }, 

  actionButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 15 },
  actionBtn: { flex: 0.48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 15, elevation: 3 },
  actionBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  searchBarContainer: { flexDirection: 'row', backgroundColor: 'white', marginHorizontal: 20, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 15, shadowColor: "#000", shadowOpacity: 0.05, elevation: 2 },
  searchInput: { flex: 1, fontSize: 16, color: '#333' },
  itemCard: { flexDirection: 'row', backgroundColor: 'white', marginHorizontal: 20, marginBottom: 12, borderRadius: 16, padding: 12, alignItems: 'center', shadowColor: "#000", shadowOffset: {width:0, height:2}, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 55, height: 55, borderRadius: 20, backgroundColor: '#eee' },
  badgeHeart: { position: 'absolute', bottom: -5, right: -5, backgroundColor: 'white', borderRadius: 10, padding: 2, elevation: 2 },
  itemName: { fontSize: 17, fontWeight: '700', color: '#2C3E50' },
  itemMeta: { fontSize: 12, color: '#95A5A6', marginTop: 2 },
  taskPreview: { flexDirection: 'row', marginTop: 6, backgroundColor: '#FFF5E5', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignItems: 'center' },
  taskText: { fontSize: 11, color: '#D35400', fontWeight: '600', maxWidth: 140 },
  btnCallMini: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#34C759', justifyContent: 'center', alignItems: 'center' },
  deleteButton: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 70, marginVertical: 6, borderRadius: 10, marginRight: 20 },
  chatButtonSwipe: { backgroundColor: '#25D366', justifyContent: 'center', alignItems: 'center', width: 70, marginVertical: 6, borderRadius: 10, marginLeft: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, height: '90%', padding: 24, shadowColor: "#000", shadowOpacity: 0.2, elevation: 10 },
  modalFull: { flex: 1, backgroundColor: 'white', paddingTop: 50 },
  photoContainer: { alignItems: 'center', marginBottom: 15, alignSelf: 'center' },
  photoPlaceholder: { width: 100, height: 100, borderRadius: 35, backgroundColor: '#34495E', justifyContent: 'center', alignItems: 'center' },
  photo: { width: 100, height: 100, borderRadius: 35 },
  photoLabel: { color: '#007AFF', marginTop: 8, fontSize: 13, fontWeight: '600' },
  inputName: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 5, color: '#2C3E50', borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  phoneDisplay: { fontSize: 16, color: '#7F8C8D', textAlign: 'center', marginBottom: 20, fontWeight: '500' },
  sectionContainer: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#34495E', marginBottom: 8 },
  birthdayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputDate: { backgroundColor: '#F7F9FC', borderRadius: 12, padding: 12, textAlign: 'center', fontSize: 16, flex: 1, borderWidth: 1, borderColor: '#E1E8ED' },
  slash: { fontSize: 20, color: '#BDC3C7', marginHorizontal: 10 },
  taskSection: { backgroundColor: '#F7F9FC', padding: 15, borderRadius: 15, marginBottom: 20, borderWidth: 1, borderColor: '#E1E8ED' },
  inputTask: { fontSize: 15, color: '#2C3E50', minHeight: 40, marginTop: 5, textAlignVertical: 'top' },
  dateBtn: { flexDirection:'row', backgroundColor:'#007AFF', paddingHorizontal:10, paddingVertical:5, borderRadius:12, alignItems:'center' },
  dateBtnText: { color:'white', fontWeight:'600', fontSize:12, marginLeft:5 },
  label: { fontSize: 14, fontWeight: '600', color: '#7F8C8D', marginBottom: 8, marginTop: 10 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ECF0F1', marginRight: 8, marginBottom: 8, backgroundColor: 'white' },
  chipText: { color: '#7F8C8D', fontWeight: '600', fontSize: 13 },
  saveButton: { backgroundColor: '#2C3E50', padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 20, shadowColor: "#000", shadowOpacity: 0.2, elevation: 4 },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});