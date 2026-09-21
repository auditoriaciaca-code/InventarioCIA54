import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  Modal, FlatList, StyleSheet, Alert, ScrollView
} from 'react-native'
import { Sesion } from '../types'
import { COLORS, SIZES } from '../constants/theme'
import { useSesion } from '../context/SesionContext'
import { AREAS, AREA_MAP, nombreArea } from '../constants/areas'
import {
  obtenerOperadoresHoyPorArea,
  obtenerCierresHoy,
  crearAreaRemota,
  reabrirInventarioRemoto,
  obtenerClaveSupervisorHash,
  guardarClaveSupervisorHash,
} from '../services/supabase'
import { sincronizarAreas } from '../services/sync'
import { sha256, slugify } from '../utils/hash'
import { hoyLocalISO } from '../utils/fechas'
import HistorialAreaModal from './HistorialAreaModal'

const MAX_OPERADORES_POR_AREA = 2
const REFRESH_MS = 15000
const ICONOS_AREA_NUEVA = ['🏗️', '🚛', '📦', '🔧', '⚙️', '🏬', '🧱', '🛠️']

export default function SesionSelector() {
  const { sesion, sesiones, mostrarSelector, ocultarSelector, crearSesion, seleccionarSesion, salirSesion } = useSesion()

  const [operadoresPorArea, setOperadoresPorArea] = useState<Record<string, string[]>>({})
  const [cierresHoy, setCierresHoy] = useState<Record<string, any>>({})
  const [saliendo, setSaliendo] = useState(false)
  const [procesando, setProcesando] = useState(false)

  const [areaExpandidaId, setAreaExpandidaId] = useState<string | null>(null)
  const [nombreNuevo, setNombreNuevo] = useState('')

  const [creandoAreaAbierto, setCreandoAreaAbierto] = useState(false)
  const [nombreAreaNueva, setNombreAreaNueva] = useState('')
  const [iconoAreaNueva, setIconoAreaNueva] = useState(ICONOS_AREA_NUEVA[0])
  const [creandoAreaProcesando, setCreandoAreaProcesando] = useState(false)

  const [pinReabrir, setPinReabrir] = useState('')
  const [reabriendo, setReabriendo] = useState(false)

  const [historialAreaId, setHistorialAreaId] = useState<string | null>(null)

  useEffect(() => {
    if (!mostrarSelector) return
    setAreaExpandidaId(null)
    setCreandoAreaAbierto(false)

    async function actualizar() {
      setOperadoresPorArea(await obtenerOperadoresHoyPorArea())
      setCierresHoy(await obtenerCierresHoy())
    }
    actualizar()
    sincronizarAreas()
    const intervalo = setInterval(actualizar, REFRESH_MS)
    return () => clearInterval(intervalo)
  }, [mostrarSelector])

  function esMio(areaId: string, nombreOperador: string): boolean {
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
            }
          },
        },
      ]
    )
  }

  function toggleExpand(areaId: string) {
    if (areaExpandidaId === areaId) {
      setAreaExpandidaId(null)
      return
    }
    setAreaExpandidaId(areaId)
    setCreandoAreaAbierto(false)
    setPinReabrir('')
    const sugerido = sesion?.nombre_operador || sesiones[0]?.nombre_operador || ''
    setNombreNuevo(sugerido)
  }

  async function handleContinuar(areaId: string, nombreOperador: string) {
    if (procesando) return
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
      setAreaExpandidaId(null)
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo entrar a la sala')
    } finally {
      setProcesando(false)
    }
  }

  async function handleUnirse(areaId: string) {
    const nombre = nombreNuevo.trim()
    if (!nombre || procesando) return
    setProcesando(true)
    try {
      const frescos = await obtenerOperadoresHoyPorArea()
      setOperadoresPorArea(frescos)
      const ocupantesFrescos = frescos[areaId] || []
      const yaEstaDentro = ocupantesFrescos.some(o => o.toLowerCase() === nombre.toLowerCase())
      if (ocupantesFrescos.length >= MAX_OPERADORES_POR_AREA && !yaEstaDentro) {
        Alert.alert(
          'Sala llena',
          `${nombreArea(areaId)} ya tiene ${ocupantesFrescos.length} operadores hoy: ${ocupantesFrescos.join(', ')}.`
        )
        return
      }
      setNombreNuevo('')
      await handleContinuar(areaId, nombre)
    } finally {
      setProcesando(false)
    }
  }

  async function handleSeleccionarHistorial(s: Sesion) {
    await seleccionarSesion(s)
    ocultarSelector()
  }

  async function handleCrearArea() {
    const nombre = nombreAreaNueva.trim()
    if (!nombre || creandoAreaProcesando) return
    setCreandoAreaProcesando(true)
    try {
      const id = slugify(nombre)
      if (!id) {
        Alert.alert('Nombre inválido', 'Escribe un nombre válido para el área.')
        return
      }
      if (AREA_MAP.get(id)) {
        Alert.alert('Ya existe', 'Ya hay un área con ese nombre.')
        return
      }
      const orden = AREAS.length + 1
      const ok = await crearAreaRemota({ id, nombre, icono: iconoAreaNueva, orden })
      if (!ok) {
        Alert.alert('Sin conexión', 'No se pudo crear el área. Intenta de nuevo.')
        return
      }
      await sincronizarAreas()
      setNombreAreaNueva('')
      setCreandoAreaAbierto(false)
    } finally {
      setCreandoAreaProcesando(false)
    }
  }

  async function confirmarReapertura(areaId: string) {
    const ok = await reabrirInventarioRemoto(areaId, hoyLocalISO(), sesion?.nombre_operador || 'supervisor')
    if (!ok) {
      Alert.alert('Sin conexión', 'No se pudo reabrir. Intenta de nuevo.')
      return
    }
    setPinReabrir('')
    setAreaExpandidaId(null)
    setCierresHoy(await obtenerCierresHoy())
  }

  async function handleReabrir(areaId: string) {
    const pin = pinReabrir.trim()
    if (!pin || reabriendo) return
    setReabriendo(true)
    try {
      const hashGuardado = await obtenerClaveSupervisorHash()
      if (hashGuardado === null) {
        Alert.alert('Sin conexión', 'No se pudo validar la clave. Intenta de nuevo.')
        return
      }
      const hashIngresado = await sha256(pin)
      if (hashGuardado === '') {
        Alert.alert(
          'Configurar clave de supervisor',
          'Todavía no hay ninguna clave configurada. ¿Quieres usar la que acabas de escribir como la clave del supervisor de ahora en adelante?',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Sí, usarla',
              onPress: async () => {
                const guardada = await guardarClaveSupervisorHash(hashIngresado)
                if (guardada) await confirmarReapertura(areaId)
                else Alert.alert('Error', 'No se pudo guardar la clave. Intenta de nuevo.')
              },
            },
          ]
        )
        return
      }
      if (hashIngresado !== hashGuardado) {
        Alert.alert('Clave incorrecta', 'La clave no coincide.')
        return
      }
      await confirmarReapertura(areaId)
    } finally {
      setReabriendo(false)
    }
  }

  const recientes = sesiones.slice(0, 6)

  return (
    <Modal visible={mostrarSelector} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {sesion && (
            <TouchableOpacity style={styles.closeBtn} onPress={ocultarSelector}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.title}>Elige tu sala de trabajo</Text>
          <Text style={styles.subtitle}>{AREAS.length} áreas · toca una sala con cupo para entrar</Text>

          {sesion && (
            <View style={styles.opTag}>
              <View style={styles.opAvatar}>
                <Text style={styles.opAvatarText}>
                  {sesion.nombre_operador.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.opName}>{sesion.nombre_operador}</Text>
                <Text style={styles.opRole}>
                  <Text style={styles.opLiveDot}>●</Text> Ahora en {nombreArea(sesion.area_id)}
                </Text>
              </View>
              <TouchableOpacity onPress={handleSalir} disabled={saliendo}>
                <Text style={styles.salirLinkText}>{saliendo ? 'Saliendo…' : '🚪 Salir'}</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={styles.salasScroll} contentContainerStyle={styles.salasContent}>
            {AREAS.map(area => {
              const ocupantes = operadoresPorArea[area.id] || []
              const cierre = cierresHoy[area.id]
              const cerrada = !!cierre?.cerrado
              const hayCupo = ocupantes.length < MAX_OPERADORES_POR_AREA
              const expandida = areaExpandidaId === area.id

              let pillEstilo = styles.pillOk
              let pillTexto = `0/${MAX_OPERADORES_POR_AREA} libre`
              if (cerrada) {
                pillEstilo = styles.pillLocked
                pillTexto = 'FINALIZADO'
              } else if (ocupantes.length >= MAX_OPERADORES_POR_AREA) {
                pillEstilo = styles.pillDanger
                pillTexto = `${ocupantes.length}/${MAX_OPERADORES_POR_AREA} LLENA`
              } else if (ocupantes.length > 0) {
                pillEstilo = styles.pillWarn
                pillTexto = `${ocupantes.length}/${MAX_OPERADORES_POR_AREA} · cupo`
              }

              return (
                <View key={area.id} style={styles.room}>
                  <View style={styles.roomRowOuter}>
                    <TouchableOpacity
                      style={styles.roomRowMain}
                      onPress={() => toggleExpand(area.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.roomIcon, cerrada && styles.roomIconLocked]}>
                        <Text style={styles.roomIconText}>{cerrada ? '🔒' : area.icono}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.roomName, cerrada && styles.roomNameLocked]}>{area.nombre}</Text>
                        <Text style={styles.roomOcupantes} numberOfLines={1}>
                          {cerrada
                            ? `Finalizado hoy${cierre?.cerrado_por ? ' · por ' + cierre.cerrado_por : ''}`
                            : ocupantes.length === 0
                            ? 'Sin operadores hoy'
                            : ocupantes.join(' · ')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.roomSide}>
                      <TouchableOpacity
                        style={styles.histBtn}
                        onPress={() => setHistorialAreaId(area.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.histBtnText}>📜</Text>
                      </TouchableOpacity>
                      <View style={[styles.pill, pillEstilo]}>
                        <Text style={styles.pillText}>{pillTexto}</Text>
                      </View>
                    </View>
                  </View>

                  {expandida && cerrada && (
                    <View style={styles.roomExpand}>
                      <Text style={styles.lockedNote}>
                        Nadie puede registrar ni modificar pesadas aquí hasta reabrirlo. Solo el
                        supervisor puede reabrir, con clave.
                      </Text>
                      <View style={styles.pinRow}>
                        <TextInput
                          style={styles.pinInput}
                          placeholder="Clave"
                          placeholderTextColor={COLORS.textLight}
                          secureTextEntry
                          value={pinReabrir}
                          onChangeText={setPinReabrir}
                          autoFocus
                        />
                        <TouchableOpacity
                          style={styles.reopenBtn}
                          onPress={() => handleReabrir(area.id)}
                          disabled={!pinReabrir.trim() || reabriendo}
                        >
                          <Text style={styles.reopenBtnText}>{reabriendo ? '...' : '🔓 Reabrir'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {expandida && !cerrada && (
                    <View style={styles.roomExpand}>
                      {ocupantes.map(op => {
                        const mio = esMio(area.id, op)
                        return (
                          <TouchableOpacity
                            key={op}
                            style={[styles.whoRow, !mio && styles.whoRowLocked]}
                            onPress={() => (mio ? handleContinuar(area.id, op) : handleBloqueado(op))}
                            disabled={procesando}
                          >
                            <Text style={styles.whoName}>{mio ? '👤' : '🔒'} {op}</Text>
                            <Text style={styles.whoHint}>
                              {mio ? 'Continuar →' : 'en otro celular'}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}

                      {hayCupo && (
                        <View style={styles.newOpRow}>
                          <TextInput
                            style={styles.newOpInput}
                            placeholder="Escribe tu nombre para entrar…"
                            placeholderTextColor={COLORS.textLight}
                            value={nombreNuevo}
                            onChangeText={setNombreNuevo}
                          />
                          <TouchableOpacity
                            style={styles.joinBtn}
                            onPress={() => handleUnirse(area.id)}
                            disabled={!nombreNuevo.trim() || procesando}
                          >
                            <Text style={styles.joinBtnText}>{procesando ? '...' : 'Entrar →'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {!hayCupo && (
                        <Text style={styles.llenoText}>
                          🔒 Esta sala ya tiene {MAX_OPERADORES_POR_AREA} operadores hoy.
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )
            })}

            {/* Crear nueva área */}
            <View style={[styles.room, styles.roomNueva]}>
              <TouchableOpacity
                style={styles.roomRowOuter}
                onPress={() => {
                  setCreandoAreaAbierto(v => !v)
                  setAreaExpandidaId(null)
                }}
                activeOpacity={0.7}
              >
                <View style={styles.roomRowMain}>
                  <View style={[styles.roomIcon, styles.roomIconNueva]}>
                    <Text style={styles.roomIconText}>➕</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roomNameNueva}>Crear nueva área</Text>
                    <Text style={styles.roomOcupantes}>Se agrega para siempre a esta lista</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {creandoAreaAbierto && (
                <View style={styles.roomExpand}>
                  <TextInput
                    style={styles.newAreaInput}
                    placeholder="Nombre del área (ej. Bodega Este)"
                    placeholderTextColor={COLORS.textLight}
                    value={nombreAreaNueva}
                    onChangeText={setNombreAreaNueva}
                  />
                  <View style={styles.iconPickerRow}>
                    {ICONOS_AREA_NUEVA.map(ic => (
                      <TouchableOpacity
                        key={ic}
                        style={[styles.iconOpt, iconoAreaNueva === ic && styles.iconOptSelected]}
                        onPress={() => setIconoAreaNueva(ic)}
                      >
                        <Text style={styles.iconOptText}>{ic}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={styles.crearAreaBtn}
                    onPress={handleCrearArea}
                    disabled={!nombreAreaNueva.trim() || creandoAreaProcesando}
                  >
                    <Text style={styles.crearAreaBtnText}>
                      {creandoAreaProcesando ? 'Creando…' : `✓ Crear área "${nombreAreaNueva.trim() || '...'}"`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>

          {recientes.length > 0 && (
            <View style={styles.recentWrap}>
              <Text style={styles.recentLabel}>Tus sesiones recientes en este celular</Text>
              <FlatList
                data={recientes}
                keyExtractor={item => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                renderItem={({ item }) => {
                  const fecha = new Date(item.created_at).toLocaleDateString('es-MX', {
                    day: '2-digit', month: '2-digit',
                  })
                  return (
                    <TouchableOpacity
                      style={[styles.recentChip, item.activa === 1 && styles.recentChipActiva]}
                      onPress={() => handleSeleccionarHistorial(item)}
                    >
                      <View style={[styles.recentDot, item.activa === 1 && styles.recentDotActiva]} />
                      <Text style={styles.recentChipText}>{fecha} · {nombreArea(item.area_id)}</Text>
                    </TouchableOpacity>
                  )
                }}
              />
            </View>
          )}
        </View>
      </View>

      <HistorialAreaModal areaId={historialAreaId} onClose={() => setHistorialAreaId(null)} />
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
    maxHeight: '92%',
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
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12.5,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 14,
  },
  opTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusLg,
    padding: 10,
    marginBottom: 14,
  },
  opAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opAvatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  opName: {
    fontWeight: '700',
    fontSize: 13.5,
    color: COLORS.text,
  },
  opRole: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 1,
  },
  opLiveDot: {
    color: '#2ecc71',
    fontSize: 9,
  },
  salirLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  salasScroll: {
    flexGrow: 0,
  },
  salasContent: {
    gap: 10,
    paddingBottom: 6,
  },
  room: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusLg,
    overflow: 'hidden',
  },
  roomRowOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  roomRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  roomIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomIconLocked: {
    backgroundColor: COLORS.border,
  },
  roomIconNueva: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  roomIconText: {
    fontSize: 19,
  },
  roomName: {
    fontWeight: '800',
    fontSize: 15.5,
    color: COLORS.text,
  },
  roomNameLocked: {
    color: COLORS.textLight,
  },
  roomNameNueva: {
    fontWeight: '700',
    fontSize: 15,
    color: COLORS.textLight,
  },
  roomOcupantes: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 1,
  },
  roomSide: {
    alignItems: 'flex-end',
    gap: 6,
  },
  histBtn: {
    padding: 2,
  },
  histBtnText: {
    fontSize: 15,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  pillOk: {
    backgroundColor: 'rgba(46,204,113,0.14)',
  },
  pillWarn: {
    backgroundColor: 'rgba(230,126,34,0.16)',
  },
  pillDanger: {
    backgroundColor: 'rgba(192,57,43,0.14)',
  },
  pillLocked: {
    backgroundColor: COLORS.border,
  },
  roomExpand: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
    padding: 12,
    gap: 8,
  },
  lockedNote: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
  },
  pinRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pinInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusSm,
    padding: 10,
    fontSize: 15,
    letterSpacing: 4,
    backgroundColor: COLORS.card,
    color: COLORS.text,
  },
  reopenBtn: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: 14,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reopenBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12.5,
  },
  whoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(26,95,42,0.06)',
  },
  whoRowLocked: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    opacity: 0.75,
  },
  whoName: {
    fontWeight: '700',
    fontSize: 13.5,
    color: COLORS.text,
  },
  whoHint: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  newOpRow: {
    flexDirection: 'row',
    gap: 8,
  },
  newOpInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: SIZES.radiusSm,
    padding: 10,
    fontSize: 13,
    backgroundColor: COLORS.card,
    color: COLORS.text,
  },
  joinBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12.5,
  },
  llenoText: {
    fontSize: 12,
    color: COLORS.danger,
    textAlign: 'center',
  },
  roomNueva: {
    borderStyle: 'dashed',
    borderWidth: 1.5,
  },
  newAreaInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusSm,
    padding: 10,
    fontSize: 13,
    backgroundColor: COLORS.card,
    color: COLORS.text,
  },
  iconPickerRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  iconOpt: {
    width: 36,
    height: 36,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(26,95,42,0.08)',
  },
  iconOptText: {
    fontSize: 16,
  },
  crearAreaBtn: {
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
  },
  crearAreaBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  recentWrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  recentLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textLight,
    marginBottom: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: COLORS.card,
  },
  recentChipActiva: {
    borderColor: COLORS.primary,
  },
  recentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.textLight,
  },
  recentDotActiva: {
    backgroundColor: '#2ecc71',
  },
  recentChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.text,
  },
})
