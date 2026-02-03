import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORES } from '../constants/colores';
import { useAyuda } from '../context/AyudaContext';
import { useBienvenida } from '../context/BienvenidaContext';
import { getUser, logout, changePassword, upgradeToPremium, getCurrentUser } from '../services/authService';
import { clearUserDataOnLogout } from '../services/syncService';
import { validatePassword, PASSWORD_REQUIREMENTS_TEXT } from '../utils/validations';
import NotificationBell from '../components/NotificationBell';

export default function ConfiguracionScreen({ onLogout }) {
  const { openAyuda } = useAyuda();
  const { openBienvenida } = useBienvenida();
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modalCambiarPassword, setModalCambiarPassword] = useState(false);
  const [passwordActual, setPasswordActual] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [actualizandoPlan, setActualizandoPlan] = useState(false);
  const [menuHamburguesaVisible, setMenuHamburguesaVisible] = useState(false);
  const [pushPermiso, setPushPermiso] = useState(false);
  const [pushTokenGuardado, setPushTokenGuardado] = useState(false);
  const [activandoPush, setActivandoPush] = useState(false);

  const VERSION_APP = '1.0';

  useEffect(() => {
    cargarUsuario();
  }, []);

  const cargarUsuario = async () => {
    try {
      // Intentar obtener usuario actualizado del servidor
      const result = await getCurrentUser();
      if (result.success) {
        setUsuario(result.usuario);
      } else {
        // Si falla, usar el almacenado localmente
        const user = await getUser();
        setUsuario(user);
      }
    } catch (error) {
      console.error('Error cargando usuario:', error);
      const user = await getUser();
      setUsuario(user);
    } finally {
      setCargando(false);
    }
  };

  const handleCambiarPassword = async () => {
    if (!passwordActual || !nuevaPassword || !confirmarPassword) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    const passwordValidation = validatePassword(nuevaPassword);
    if (!passwordValidation.valid) {
      Alert.alert('Error', passwordValidation.error);
      return;
    }

    if (nuevaPassword.trim() !== confirmarPassword.trim()) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }

    setCambiandoPassword(true);
    const result = await changePassword(passwordActual, nuevaPassword);
    setCambiandoPassword(false);

    if (result.success) {
      Alert.alert('Éxito', 'Contraseña actualizada exitosamente', [
        { text: 'OK', onPress: () => {
          setModalCambiarPassword(false);
          setPasswordActual('');
          setNuevaPassword('');
          setConfirmarPassword('');
        }}
      ]);
    } else {
      Alert.alert('Error', result.error || 'No se pudo cambiar la contraseña');
    }
  };

  const handleUpgradePremium = () => {
    Alert.alert(
      'Actualizar a Premium',
      '¿Deseas actualizar tu plan a Premium? Esto te dará acceso a todas las funciones premium.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Actualizar',
          onPress: async () => {
            setActualizandoPlan(true);
            const result = await upgradeToPremium();
            setActualizandoPlan(false);

            if (result.success) {
              setUsuario(result.usuario);
              Alert.alert('¡Éxito!', 'Tu plan ha sido actualizado a Premium');
            } else {
              Alert.alert('Error', result.error || 'No se pudo actualizar el plan');
            }
          }
        }
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro de que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar Sesión',
          style: 'destructive',
          onPress: async () => {
            await logout();
            await clearUserDataOnLogout();
            if (onLogout) {
              onLogout();
            }
          }
        }
      ]
    );
  };

  if (cargando) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={COLORES.agua} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={() => setMenuHamburguesaVisible(true)}
          >
            <Ionicons name="menu" size={28} color={COLORES.texto} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name="settings" size={48} color={COLORES.agua} />
            <Text style={styles.title}>Configuración</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={openAyuda} style={{ padding: 8 }} accessibilityLabel="Ayuda">
              <Ionicons name="help-circle-outline" size={26} color={COLORES.textoSuave} />
            </TouchableOpacity>
            <NotificationBell />
          </View>
        </View>
        
        {usuario && (
          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.userInfo}>
              <Ionicons name="person-circle" size={40} color={COLORES.agua} />
              <Text style={styles.userName}>{usuario.nombre}</Text>
              <Text style={styles.userEmail}>{usuario.email}</Text>
              
              {/* Tipo de usuario: Free, Premium o Administrador */}
              <View style={styles.planContainer}>
                <View style={[
                  styles.planBadge,
                  usuario.plan === 'Premium' && styles.planBadgePremium,
                  usuario.plan === 'Administrador' && styles.planBadgeAdmin,
                  usuario.plan === 'Free' && styles.planBadgeFree
                ]}>
                  <Ionicons 
                    name={usuario.plan === 'Premium' ? 'star' : usuario.plan === 'Administrador' ? 'shield-checkmark' : 'star-outline'} 
                    size={14} 
                    color={usuario.plan === 'Premium' ? '#FFD700' : usuario.plan === 'Administrador' ? COLORES.agua : COLORES.textoSecundario} 
                  />
                  <Text style={[
                    styles.planText,
                    usuario.plan === 'Premium' && styles.planTextPremium,
                    usuario.plan === 'Administrador' && styles.planTextAdmin
                  ]}>
                    {usuario.plan === 'Premium' ? 'Usuario Premium' : usuario.plan === 'Administrador' ? 'Administrador' : 'Plan Free'}
                  </Text>
                </View>
              </View>

              {/* Uso de IA: para Free mostrar X/20; Premium y Administrador sin límite */}
              <View style={styles.usageSection}>
                <Text style={styles.usageSectionTitle}>Uso de IA (notas de voz)</Text>
                {usuario.plan === 'Free' && (usuario.limiteDiarioIA != null || usuario.aiPeticionesRestantes != null) ? (
                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>Hoy:</Text>
                    <Text style={styles.usageValue}>{usuario.aiPeticionesHoy ?? 0} / {usuario.limiteDiarioIA ?? 20} interacciones</Text>
                  </View>
                ) : (
                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>Hoy:</Text>
                    <Text style={styles.usageValue}>{usuario.aiPeticionesHoy ?? 0} interacciones</Text>
                  </View>
                )}
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Mes actual:</Text>
                  <Text style={styles.usageValue}>{Math.max(usuario.aiPeticionesMes ?? 0, usuario.aiPeticionesHoy ?? 0)} interacciones</Text>
                </View>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Coste estimado (total):</Text>
                  <Text style={styles.usageValue}>${((usuario.aiEstimatedCostUsd ?? 0)).toFixed(4)} USD</Text>
                </View>
              </View>
            </View>

            {/* Notificaciones push (Etapa 1): estado y activar */}
            <View style={styles.pushSection}>
              <Text style={styles.pushSectionTitle}>Notificaciones push</Text>
              <View style={styles.pushStatusRow}>
                <Ionicons
                  name={pushPermiso && pushTokenGuardado ? 'notifications' : 'notifications-off-outline'}
                  size={20}
                  color={pushPermiso && pushTokenGuardado ? COLORES.activo : COLORES.textoSecundario}
                />
                <Text style={styles.pushStatusText}>
                  {pushPermiso && pushTokenGuardado
                    ? 'Activadas (recordatorios de gestos y momentos)'
                    : pushPermiso
                      ? 'Permiso concedido'
                      : 'Desactivadas'}
                </Text>
              </View>
              {(!pushPermiso || !pushTokenGuardado) && (
                <TouchableOpacity
                  style={styles.pushActivarButton}
                  onPress={async () => {
                    setActivandoPush(true);
                    const token = await registerForPushNotificationsAsync();
                    await cargarEstadoPush();
                    setActivandoPush(false);
                    if (token) {
                      Alert.alert('Listo', 'Recibirás recordatorios de atenciones y momentos.');
                    } else if (!pushPermiso) {
                      Alert.alert(
                        'Permiso necesario',
                        'Activa las notificaciones en Ajustes del teléfono para recibir recordatorios.'
                      );
                    }
                  }}
                  disabled={activandoPush}
                >
                  {activandoPush ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <Ionicons name="notifications" size={18} color="white" />
                      <Text style={styles.pushActivarButtonText}>Activar notificaciones</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Botón Actualizar a Premium: solo visible para usuarios Free */}
            {usuario.plan === 'Free' && (
              <TouchableOpacity 
                style={styles.premiumButton} 
                onPress={handleUpgradePremium}
                disabled={actualizandoPlan}
              >
                {actualizandoPlan ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons name="star" size={20} color="#FFD700" />
                    <Text style={styles.premiumButtonText}>Actualizar a Premium</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Sección Administración: solo visible para Administrador */}
            {usuario.plan === 'Administrador' && (
              <View style={styles.adminSection}>
                <Text style={styles.adminSectionTitle}>Administración</Text>
                <TouchableOpacity 
                  style={styles.adminButton}
                  onPress={() => Alert.alert('Próximamente', 'El panel de administración se desarrollará aquí.')}
                >
                  <Ionicons name="shield-checkmark" size={20} color="white" />
                  <Text style={styles.adminButtonText}>Administrar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Segundo: Compartir */}
            <TouchableOpacity 
              style={styles.recomendarButton} 
              onPress={() => {}}
            >
              <Ionicons name="share-social-outline" size={20} color={COLORES.texto} />
              <Text style={styles.actionButtonText}>Compartir</Text>
            </TouchableOpacity>

            {/* Versión de la app */}
            <Text style={styles.versionText}>Versión {VERSION_APP}</Text>
          </ScrollView>
        )}
      </View>

      {/* Menú hamburguesa: Cambiar contraseña y Cerrar sesión */}
      <Modal
        visible={menuHamburguesaVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuHamburguesaVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuHamburguesaVisible(false)}
        >
          <TouchableOpacity style={styles.menuPanel} activeOpacity={1} onPress={() => {}}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Menú</Text>
              <TouchableOpacity onPress={() => setMenuHamburguesaVisible(false)}>
                <Ionicons name="close" size={24} color={COLORES.texto} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuHamburguesaVisible(false);
                setModalCambiarPassword(true);
              }}
            >
              <Ionicons name="lock-closed-outline" size={22} color={COLORES.texto} />
              <Text style={styles.menuItemText}>Cambiar contraseña</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuHamburguesaVisible(false);
                openBienvenida();
              }}
            >
              <Ionicons name="book-outline" size={22} color={COLORES.texto} />
              <Text style={styles.menuItemText}>Ver guía de bienvenida</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLogout]}
              onPress={() => {
                setMenuHamburguesaVisible(false);
                handleLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={22} color={COLORES.urgente} />
              <Text style={styles.menuItemTextLogout}>Cerrar sesión</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal para cambiar contraseña */}
      <Modal
        visible={modalCambiarPassword}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalCambiarPassword(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cambiar Contraseña</Text>
              <TouchableOpacity onPress={() => setModalCambiarPassword(false)}>
                <Ionicons name="close" size={24} color={COLORES.textoSuave} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORES.textoSuave} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Contraseña actual"
                  placeholderTextColor={COLORES.textoSuave}
                  value={passwordActual}
                  onChangeText={setPasswordActual}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORES.textoSuave} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Nueva contraseña"
                  placeholderTextColor={COLORES.textoSuave}
                  value={nuevaPassword}
                  onChangeText={setNuevaPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
              <Text style={styles.passwordRequirementsHint}>{PASSWORD_REQUIREMENTS_TEXT}</Text>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORES.textoSuave} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirmar nueva contraseña"
                  placeholderTextColor={COLORES.textoSuave}
                  value={confirmarPassword}
                  onChangeText={setConfirmarPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={[styles.modalButton, cambiandoPassword && styles.modalButtonDisabled]}
                onPress={handleCambiarPassword}
                disabled={cambiandoPassword}
              >
                {cambiandoPassword ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.modalButtonText}>Cambiar Contraseña</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORES.fondo,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
    position: 'relative',
  },
  headerLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: 8,
    zIndex: 10,
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    paddingTop: 60,
    paddingLeft: 0,
  },
  menuPanel: {
    backgroundColor: 'white',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORES.texto,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORES.texto,
  },
  menuItemLogout: {},
  menuItemTextLogout: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.urgente,
  },
  versionText: {
    fontSize: 12,
    color: COLORES.textoSecundario,
    marginTop: 24,
    marginBottom: 8,
    alignSelf: 'center',
  },
  title: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: COLORES.texto, 
    marginTop: 8,
  },
  usageSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORES.fondoSecundario,
    width: '100%',
  },
  usageSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    marginBottom: 10,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  usageLabel: {
    fontSize: 14,
    color: COLORES.texto,
  },
  usageValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.texto,
  },
  recomendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORES.fondoSecundario,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    width: '100%',
    gap: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  userInfo: {
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORES.texto,
    marginTop: 8,
  },
  userEmail: {
    fontSize: 13,
    color: COLORES.textoSecundario,
    marginTop: 4,
  },
  planContainer: {
    marginTop: 12,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  planBadgeFree: {
    backgroundColor: COLORES.fondoSecundario,
  },
  planBadgePremium: {
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  planText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORES.textoSecundario,
  },
  planTextPremium: {
    color: '#B8860B',
  },
  planBadgeAdmin: {
    backgroundColor: COLORES.aguaClaro || '#E8F4F8',
    borderWidth: 1,
    borderColor: COLORES.agua,
  },
  planTextAdmin: {
    color: COLORES.agua,
  },
  adminSection: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORES.fondoSecundario || '#F5F7FA',
    borderRadius: 12,
  },
  adminSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    marginBottom: 10,
  },
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORES.agua,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    gap: 8,
  },
  adminButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES.aguaClaro,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
    width: '100%',
    gap: 12,
    shadowColor: COLORES.agua,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORES.texto,
  },
  premiumButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORES.agua,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    width: '100%',
    gap: 8,
    shadowColor: COLORES.agua,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  premiumButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  pushSection: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORES.fondoSecundario || '#F5F7FA',
    borderRadius: 12,
  },
  pushSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORES.textoSecundario,
    marginBottom: 8,
  },
  pushStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pushStatusText: {
    fontSize: 14,
    color: COLORES.texto,
    flex: 1,
  },
  pushActivarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORES.agua,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 10,
  },
  pushActivarButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORES.urgente,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
    width: '100%',
    gap: 8,
    shadowColor: COLORES.urgente,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  logoutText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORES.fondoSecundario,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORES.texto,
  },
  modalScroll: {
    padding: 20,
  },
  passwordRequirementsHint: {
    fontSize: 13,
    color: COLORES.textoSecundario,
    marginBottom: 12,
    marginTop: -4,
    paddingHorizontal: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORES.fondoSecundario,
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORES.texto,
  },
  modalButton: {
    backgroundColor: COLORES.agua,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});