import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  Modal, FlatList, StyleSheet, Alert, ScrollView
} from 'react-native'
import { Sesion } from '../types'
import { COLORS, SIZES } from '../constants/theme'
import { useSesion } from '../context/SesionContext'
import { AREAS, nombreArea } from '../constants/areas'
import { obtenerOperadoresHoyPorArea } from '../services/supabase'

const MAX_OPERADORES_POR_AREA = 2
const REFRESH_MS = 15000

export default function SesionSelector() {
  const { sesion, sesiones, mostrarSelector, ocultarSelector, crearSesion, seleccionarSesion, salirSesion } = useSesion()
  const [areaId, setAreaId] = useState<string | null>(null)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [mostrandoNuevo, setMostrandoNuevo] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [operadoresPorArea, setOperadoresPorArea] = useState<Record<string, string[]>>({})
  const [mostrarHistorial, setMostrarHistorial] = useState(false)

  useEffect(() => {
    if (!mostrarSelector) return
    // Si ya trabajas en un área, entra directo a "quién está aquí" de esa
    // área; si no, primero hay que elegir una.
    setAreaId(sesion?.area_id || null)
    setMostrandoNuevo(false)
    setNombreNuevo('')
    setMostrarHistorial(false)

    async function actualizar() {
      setOperadoresPorArea(await obtenerOperadoresHoyPorArea())
    }
    actualizar()
    const intervalo = setInterval(actualizar, REFRESH_MS)
    return () => clearInterval(intervalo)
  }, [mostrarSelector])

  const area = areaId ? AREAS.find(a => a.id === areaId) || null : null
  const ocupantes = areaId ? (operadoresPorArea[areaId] || []) : []
  const hayCupo = ocupantes.length < MAX_OPERADORES_POR_AREA

  function esMio(nombreOperador: string): boolean {
    return sesiones.some(
      s => s.area_id === areaId && s.nombre_operador.toLowerCase() === nombreOperador.toLowerCase()
    )
  }

  function handleBloqueado(nombreOperador: string) {
    Alert.alert(
      'Sala ocupada',
      `${nombreOperador} sigue activo en otro celular. Debe tocar "Salir de mi sesión" desde ese teléfono antes de que puedas entrar aquí.`
    )
  }

  async function handleSalir() {
    if (!sesion) return
    Alert.alert(
      '¿Salir de tu sesión?',
      `Vas a liberar tu lugar como "${sesion.nombre_operador}" en ${nombreArea(sesion.area_id)}. Tu compañero podrá ver que ya no estás activo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            setSaliendo(true)
            const ok = await salirSesion()
            setSaliendo(false)
            if (!ok) {
              Alert.alert('Sin conexión', 'No se pudo salir. Revisa tu internet e intenta de nuevo.')
              return
            }
            setAreaId(null)
          },
        },
      ]
    )
  }

  function abrirNuevoOperador() {
    // Ancla el nombre de quien ya usa este celular (sesión activa, o si no,
    // la más reciente en el historial) para no tener que volver a
    // escribirlo cada vez que cambia de área.
    const sugerido = sesion?.nombre_operador || sesiones[0]?.nombre_operador || ''
    setNombreNuevo(sugerido)
    setMostrandoNuevo(true)
  }

  async function handleContinuar(nombreOperador: string) {
    if (!areaId || procesando) return
    setProcesando(true)
    try {
      const local = sesiones.find(
        s => s.area_id === areaId && s.nombre_operador.toLowerCase() === nombreOperador.toLowerCase()
      )
      if (local) {
        await seleccionarSesion(local)
      } else {
        await crearSesion(nombreOperador, areaId)
      }
      ocultarSelector()
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo entrar a la sala')
    } finally {
      setProcesando(false)
    }
  }

  async function handleCrearNuevo() {
    if (!nombreNuevo.trim() || !areaId || procesando) return
    setProcesando(true)
    try {
      const frescos = await obtenerOperadoresHoyPorArea()
      setOperadoresPorArea(frescos)
      const ocupantesFrescos = frescos[areaId] || []
      const yaEstaDentro = ocupantesFrescos.some(o => o.toLowerCase() === nombreNuevo.trim().toLowerCase())
      if (ocupantesFrescos.length >= MAX_OPERADORES_POR_AREA && !yaEstaDentro) {
        setProcesando(false)
        Alert.alert(
          'Sala llena',
          `${nombreArea(areaId)} ya tiene ${ocupantesFrescos.length} operadores hoy: ${ocupantesFrescos.join(', ')}.`
        )
        return
      }
      const nombre = nombreNuevo.trim()
      setNombreNuevo('')
      setMostrandoNuevo(false)
      await handleContinuar(nombre)
    } finally {
      setProcesando(false)
    }
  }

  async function handleSeleccionarHistorial(s: Sesion) {
    await seleccionarSesion(s)
    ocultarSelector()
  }

  return (
    <Modal visible={mostrarSelector} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {sesion && (
            <TouchableOpacity style={styles.closeBtn} onPress={ocultarSelector}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          )}

          {sesion && (
            <TouchableOpacity style={styles.salirLink} onPress={handleSalir} disabled={saliendo}>
              <Text style={styles.salirLinkText}>
                🚪 {saliendo ? 'Saliendo...' : `Salir de mi sesión (${sesion.nombre_operador} · ${nombreArea(sesion.area_id)})`}
              </Text>
            </TouchableOpacity>
          )}

          {!area ? (
            <>
              <Text style={styles.title}>Inventario CIA A.C.A</Text>
              <Text style={styles.subtitle}>Elige tu área de trabajo</Text>

              <ScrollView contentContainerStyle={styles.areaGrid}>
                {AREAS.map(a => {
                  const ocupantesArea = operadoresPorArea[a.id] || []
                  return (
                    <TouchableOpacity key={a.id} style={styles.areaCard} onPress={() => setAreaId(a.id)} activeOpacity={0.8}>
                      <Text style={styles.areaCardIcon}>{a.icono}</Text>
                      <Text style={styles.areaCardNombre}>{a.nombre}</Text>
                      <Text style={styles.areaCardEstado} numberOfLines={1}>
                        {ocupantesArea.length === 0 ? 'Sin operadores hoy' : ocupantesArea.join(' · ')}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              <TouchableOpacity onPress={() => setMostrarHistorial(v => !v)}>
                <Text style={styles.historialLink}>
                  {mostrarHistorial ? '▲ Ocultar historial de sesiones' : '▼ Ver historial de sesiones'}
                </Text>
              </TouchableOpacity>

              {mostrarHistorial && (
                <FlatList
                  data={sesiones}
                  keyExtractor={item => item.id}
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  ListEmptyComponent={<Text style={styles.emptyText}>Sin sesiones previas</Text>}
                  renderItem={({ item }) => {
                    const fecha = new Date(item.created_at).toLocaleDateString('es-MX', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
                    return (
                      <TouchableOpacity
                        style={[styles.sessionItem, item.activa === 1 && styles.sessionActiva]}
                        onPress={() => handleSeleccionarHistorial(item)}
                      >
                        <View style={styles.sessionLeft}>
                          <Text style={styles.sessionIcon}>{item.activa === 1 ? '🟢' : '🔵'}</Text>
                          <View>
                            <Text style={styles.sessionName}>{item.nombre_operador}</Text>
                            <Text style={styles.sessionDate}>{nombreArea(item.area_id)} · {fecha}</Text>
                          </View>
                        </View>
                        <View style={styles.sessionRight}>
                          <Text style={styles.sessionCount}>{item.total_registros ?? 0} reg</Text>
                          <Text style={styles.sessionTotal}>{(item.total_neto ?? 0).toFixed(1)} kg</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  }}
                />
              )}
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setAreaId(null)} style={styles.backRow}>
                <Text style={styles.backText}>← Cambiar de área</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{area.icono} {area.nombre}</Text>
              <Text style={styles.subtitle}>
                {ocupantes.length === 0 ? 'Nadie ha registrado aquí hoy' : '¿Quién eres?'}
              </Text>

              {ocupantes.map(op => {
                const mio = esMio(op)
                return (
                  <TouchableOpacity
                    key={op}
                    style={[styles.operadorBtn, !mio && styles.operadorBtnBloqueado]}
                    onPress={() => (mio ? handleContinuar(op) : handleBloqueado(op))}
                    disabled={procesando}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.operadorBtnText, !mio && styles.operadorBtnTextBloqueado]}>
                      {mio ? '👤' : '🔒'} {op}
                    </Text>
                    <Text style={styles.operadorBtnHint}>
                      {mio ? 'Continuar pesando →' : 'activo en otro celular'}
                    </Text>
                  </TouchableOpacity>
                )
              })}

              {hayCupo && !mostrandoNuevo && (
                <TouchableOpacity style={styles.nuevoBtn} onPress={abrirNuevoOperador} activeOpacity={0.8}>
                  <Text style={styles.nuevoBtnText}>+ Nuevo operador</Text>
                </TouchableOpacity>
              )}

              {hayCupo && mostrandoNuevo && (
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Tu nombre"
                    placeholderTextColor={COLORS.textLight}
                    value={nombreNuevo}
                    onChangeText={setNombreNuevo}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[styles.createBtn, (!nombreNuevo.trim() || procesando) && styles.disabled]}
                    onPress={handleCrearNuevo}
                    disabled={!nombreNuevo.trim() || procesando}
                  >
                    <Text style={styles.createBtnText}>{procesando ? '...' : 'Entrar'}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!hayCupo && (
                <Text style={styles.llenoText}>
                  🔒 Esta sala ya tiene {MAX_OPERADORES_POR_AREA} operadores hoy. Si eres uno de ellos, toca tu nombre arriba.
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 20,
  },
  backRow: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  backText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  areaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  areaCard: {
    width: '47%',
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  areaCardIcon: {
    fontSize: 30,
    marginBottom: 6,
  },
  areaCardNombre: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  areaCardEstado: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 4,
    textAlign: 'center',
  },
  historialLink: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  operadorBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: SIZES.radiusLg,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  operadorBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.primary,
  },
  operadorBtnHint: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  operadorBtnBloqueado: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  operadorBtnTextBloqueado: {
    color: COLORS.textLight,
  },
  salirLink: {
    alignSelf: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  salirLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  nuevoBtn: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: SIZES.radiusLg,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  nuevoBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  llenoText: {
    fontSize: 13,
    color: COLORS.danger,
    textAlign: 'center',
    marginTop: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    padding: 12,
    fontSize: 16,
    backgroundColor: COLORS.bg,
  },
  createBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
  list: {
    maxHeight: 300,
    marginTop: 6,
  },
  listContent: {
    gap: 8,
  },
  sessionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sessionActiva: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(26,95,42,0.04)',
  },
  sessionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionIcon: {
    fontSize: 20,
  },
  sessionName: {
    fontWeight: '700',
    fontSize: 15,
    color: COLORS.text,
  },
  sessionDate: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  sessionRight: {
    alignItems: 'flex-end',
  },
  sessionCount: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  sessionTotal: {
    fontWeight: '800',
    fontSize: 15,
    color: COLORS.primary,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textLight,
    paddingVertical: 30,
  },
})
