import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  KeyboardAvoidingView, Alert, Modal, StyleSheet, Animated, PanResponder, Dimensions, Platform
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { randomUUID } from 'expo-crypto'
import ContainerSelector from '../components/ContainerSelector'
import MaterialGrid from '../components/MaterialGrid'
import ReferenciaSelector from '../components/ReferenciaSelector'
import PhotoViewer from '../components/PhotoViewer'
import ChatBubble from '../components/ChatBubble'
import ReferenciaChipsBar from '../components/ReferenciaChipsBar'
import ChatPhotoThumb from '../components/ChatPhotoThumb'
import ComparacionTabla from '../components/ComparacionTabla'
import QrScanner from '../components/QrScanner'
import LoteAutocomplete from '../components/LoteAutocomplete'
import NumericKeypad from '../components/NumericKeypad'
import CameraCapture from '../components/CameraCapture'
import MaterialPickerPanel from '../components/MaterialPickerPanel'
import ScaleReader from '../components/ScaleReader'
import { getDatabase } from '../services/database'
import { subirEnSegundoPlano, sincronizarLotes, subirFotosEnSegundoPlano, sincronizarCierresHoy, estaAreaCerradaHoy } from '../services/sync'
import { nombreArea } from '../constants/areas'
import { COLORS, SIZES } from '../constants/theme'
import { CATEGORIA_MAP, MATERIAL_MAP } from '../constants/materiales'
import { formatDescripcion } from '../utils/format'
import { useSesion } from '../context/SesionContext'
import { useComparaciones } from '../context/ComparacionesContext'
import { useConfig } from '../context/ConfigContext'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import {
  RegistroPesada, Referencia, Foto, ReferenciaFlat,
  ChatPendingMessage, ChatListItem, Lote
} from '../types'

type FotoItem = { uri: string } | null

const CONTENEDORES = [
  { id: 'tula', nombre: 'TULA', tara: 2, icono: '🛍️' },
  { id: 'alambre', nombre: 'ALAMBRE', tara: 1, icono: '📦' },
  { id: 'otro', nombre: 'Otro', tara: 0, icono: '⚖️' },
]

const MAX_FOTOS_POR_MENSAJE = 5
const screenWidth = Dimensions.get('window').width

// Pager de 3 paneles: Material (0) ← Chat (1) → Doble conteo (2). El chat
// es el panel de entrada por defecto.
const POS_MATERIAL = 0
const POS_CHAT = 1
const POS_COMPARACION = 2

export default function ChatRegistroScreen() {
  const { sesion } = useSesion()
  const { porRegistro } = useComparaciones()
  const { usarTara } = useConfig()
  const alturaTeclado = useKeyboardHeight()

  const [registros, setRegistros] = useState<RegistroPesada[]>([])
  const [pendientes, setPendientes] = useState<ChatPendingMessage[]>([])
  const [sistemas, setSistemas] = useState<{ id: string; createdAt: string; texto: string }[]>([])
  const [fotosPorRegistro, setFotosPorRegistro] = useState<Map<string, Foto[]>>(new Map())

  const [contenedorConfirmado, setContenedorConfirmado] = useState(false)
  const [tara, setTara] = useState(2)
  const [contenedor, setContenedor] = useState('TULA')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [taraPersonalizada, setTaraPersonalizada] = useState('')

  // Arrastre tipo WhatsApp: los 3 paneles viven lado a lado, un solo valor
  // animado mueve la fila completa según cuánto arrastres.
  const [panelMontado, setPanelMontado] = useState(false)
  const swipeX = useRef(new Animated.Value(-screenWidth * POS_CHAT)).current
  const paneIndexRef = useRef(POS_CHAT)

  const UMBRAL_DISTANCIA = screenWidth * 0.35
  const UMBRAL_VELOCIDAD = 0.5

  function irA(indice: number) {
    const destino = -screenWidth * indice
    Animated.timing(swipeX, { toValue: destino, duration: 220, useNativeDriver: true }).start(() => {
      paneIndexRef.current = indice
      if (indice === POS_CHAT) setPanelMontado(false)
    })
  }

  function abrirMaterialPanel() {
    setPanelMontado(true)
    irA(POS_MATERIAL)
  }

  function cerrarComparacion() {
    irA(POS_CHAT)
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderGrant: () => {
        setPanelMontado(true)
      },
      onPanResponderMove: (_, g) => {
        const base = -screenWidth * paneIndexRef.current
        const nuevo = Math.min(0, Math.max(-screenWidth * POS_COMPARACION, base + g.dx))
        swipeX.setValue(nuevo)
      },
      onPanResponderRelease: (_, g) => {
        const actual = paneIndexRef.current
        let indice = actual
        if (g.dx < -UMBRAL_DISTANCIA || g.vx < -UMBRAL_VELOCIDAD) {
          indice = Math.min(POS_COMPARACION, actual + 1)
        } else if (g.dx > UMBRAL_DISTANCIA || g.vx > UMBRAL_VELOCIDAD) {
          indice = Math.max(POS_MATERIAL, actual - 1)
        }
        irA(indice)
      },
    })
  ).current

  const [activeReferencia, setActiveReferencia] = useState<ReferenciaFlat | null>(null)
  const [chips, setChips] = useState<ReferenciaFlat[]>([])

  const [pesoInput, setPesoInput] = useState('')
  const [inputFotos, setInputFotos] = useState<{ uri: string }[]>([])
  const [sending, setSending] = useState(false)
  const [camaraVisible, setCamaraVisible] = useState(false)
  const [basculaVisible, setBasculaVisible] = useState(false)

  const [loteScannerVisible, setLoteScannerVisible] = useState(false)
  const [inputLote, setInputLote] = useState<string | null>(null)
  const [loteEstado, setLoteEstado] = useState<'ok' | 'desconocido' | 'repetido' | null>(null)
  const [loteModalVisible, setLoteModalVisible] = useState(false)
  const [loteManualInput, setLoteManualInput] = useState('')
  const [loteSugerencias, setLoteSugerencias] = useState<Lote[]>([])

  const [editando, setEditando] = useState<RegistroPesada | null>(null)
  const [editPesoBruto, setEditPesoBruto] = useState('')
  const [editTara, setEditTara] = useState('')
  const [editContenedor, setEditContenedor] = useState('')
  const [editObservaciones, setEditObservaciones] = useState('')
  const [editMaterialId, setEditMaterialId] = useState('')
  const [editReferencia, setEditReferencia] = useState<Referencia | null>(null)
  const [editLote, setEditLote] = useState('')

  const [corrigiendo, setCorrigiendo] = useState<ChatPendingMessage | null>(null)
  const [corrMaterialId, setCorrMaterialId] = useState('')
  const [corrReferencia, setCorrReferencia] = useState<Referencia | null>(null)
  const [corrPeso, setCorrPeso] = useState('')
  const [corrTara, setCorrTara] = useState('')
  const [corrLote, setCorrLote] = useState('')

  const [fotosVisible, setFotosVisible] = useState(false)
  const [fotosActuales, setFotosActuales] = useState<Foto[]>([])

  const flatListRef = useRef<FlatList>(null)

  useFocusEffect(
    useCallback(() => {
      if (sesion) {
        cargarHistorial()
        sincronizarLotes(sesion.area_id || '')
        sincronizarCierresHoy()
      }
    }, [sesion])
  )

  function buildRefFlat(categoriaId: string, referencia: Referencia): ReferenciaFlat {
    const mat = MATERIAL_MAP.get(categoriaId)
    return {
      categoriaId,
      categoriaNombre: mat?.nombre || categoriaId,
      icono: mat?.icono || '📦',
      color: mat?.color || COLORS.primary,
      codigo: referencia.codigo,
      descripcion: referencia.descripcion,
    }
  }

  function referenciaFlatFromRegistro(r: RegistroPesada): ReferenciaFlat | null {
    if (!r.referencia_codigo) return null
    return buildRefFlat(r.material_id, { codigo: r.referencia_codigo, descripcion: r.referencia_descripcion })
  }

  async function cargarHistorial() {
    if (!sesion) return
    try {
      const db = getDatabase()
      const rows = await db.getAllAsync<RegistroPesada>(
        'SELECT * FROM inv_registros WHERE sesion_id = ? ORDER BY created_at ASC',
        [sesion.id]
      )
      setRegistros(rows)

      const conFotos = rows.filter(r => r.fotos_count > 0)
      if (conFotos.length > 0) {
        const placeholders = conFotos.map(() => '?').join(',')
        const fotos = await db.getAllAsync<Foto>(
          `SELECT * FROM inv_fotos WHERE registro_id IN (${placeholders}) ORDER BY orden ASC`,
          conFotos.map(r => r.id)
        )
        const map = new Map<string, Foto[]>()
        for (const f of fotos) {
          const arr = map.get(f.registro_id) || []
          arr.push(f)
          map.set(f.registro_id, arr)
        }
        setFotosPorRegistro(map)
      } else {
        setFotosPorRegistro(new Map())
      }

      setChips(prevChips => {
        if (prevChips.length > 0) return prevChips
        const ultimasFlat: ReferenciaFlat[] = []
        const vistos = new Set<string>()
        for (let i = rows.length - 1; i >= 0 && ultimasFlat.length < 8; i--) {
          const flat = referenciaFlatFromRegistro(rows[i])
          if (flat && !vistos.has(flat.codigo)) {
            vistos.add(flat.codigo)
            ultimasFlat.push(flat)
          }
        }
        if (ultimasFlat.length > 0) {
          setActiveReferencia(prev => prev || ultimasFlat[0])
        }
        return ultimasFlat
      })
    } catch (e) {
      console.error(e)
    }
  }

  function activarReferencia(ref: ReferenciaFlat) {
    setActiveReferencia(ref)
    setChips(prev => [ref, ...prev.filter(c => c.codigo !== ref.codigo)].slice(0, 8))
  }

  function agregarPendiente(textoOriginal: string, pesoBrutoDetectado?: number, taraOverrideDetectado?: number, fotoUris?: string[], loteCodigo?: string) {
    setPendientes(prev => [
      ...prev,
      {
        localId: randomUUID(),
        textoOriginal,
        createdAt: new Date().toISOString(),
        fotoUris,
        pesoBrutoDetectado,
        taraOverrideDetectado,
        loteCodigo,
      },
    ])
  }

  function agregarSistema(texto: string) {
    setSistemas(prev => [...prev, { id: randomUUID(), createdAt: new Date().toISOString(), texto }])
  }

  async function consultarEstadoLote(areaId: string, codigo: string): Promise<'pendiente' | 'pesado' | null> {
    try {
      const db = getDatabase()
      const row = await db.getFirstAsync<{ estado: string }>(
        'SELECT estado FROM inv_lotes WHERE area_id = ? AND codigo = ?',
        [areaId, codigo]
      )
      return (row?.estado as 'pendiente' | 'pesado') || null
    } catch {
      return null
    }
  }

  async function aplicarLoteInput(data: string) {
    const codigo = data.trim()
    if (!codigo) {
      quitarLoteInput()
      return
    }
    const estadoDb = await consultarEstadoLote(sesion?.area_id || '', codigo)
    setInputLote(codigo)
    setLoteEstado(estadoDb === 'pesado' ? 'repetido' : estadoDb === 'pendiente' ? 'ok' : 'desconocido')
  }

  async function handleEscanearLote(data: string) {
    // Si el escáner se abrió desde el modal manual (para corregir/afinar el
    // código antes de confirmar), el modal sigue montado detrás — se cierra
    // junto con el escáner en vez de dejarlo abierto con el valor viejo.
    if (loteModalVisible) {
      setLoteManualInput(data)
      setLoteModalVisible(false)
    }
    await aplicarLoteInput(data)
  }

  function quitarLoteInput() {
    setInputLote(null)
    setLoteEstado(null)
  }

  function abrirModalLote() {
    setLoteManualInput(inputLote || '')
    setLoteModalVisible(true)
  }

  async function handleGuardarLoteManual() {
    await aplicarLoteInput(loteManualInput)
    setLoteModalVisible(false)
  }

  async function handleSeleccionarSugerenciaLote(codigo: string) {
    setLoteManualInput(codigo)
    await aplicarLoteInput(codigo)
    setLoteModalVisible(false)
  }

  // Sugerencias de lote mientras escribe en el modal manual: busca en la
  // copia local (ya sincronizada por área) por coincidencia parcial, sin
  // pegarle a Supabase en cada tecla.
  useEffect(() => {
    if (!loteModalVisible || !sesion) {
      setLoteSugerencias([])
      return
    }
    const prefijo = loteManualInput.trim()
    if (!prefijo) {
      setLoteSugerencias([])
      return
    }
    let activo = true
    getDatabase()
      .getAllAsync<Lote>(
        'SELECT * FROM inv_lotes WHERE area_id = ? AND codigo LIKE ? ORDER BY estado ASC, codigo ASC LIMIT 8',
        [sesion.area_id || '', `%${prefijo}%`]
      )
      .then(rows => {
        if (activo) setLoteSugerencias(rows)
      })
      .catch(() => {
        if (activo) setLoteSugerencias([])
      })
    return () => {
      activo = false
    }
  }, [loteManualInput, loteModalVisible, sesion])

  async function insertarRegistro(
    referencia: ReferenciaFlat,
    pesoBruto: number,
    taraEfectiva: number,
    fotoUris?: string[],
    loteCodigo?: string
  ): Promise<boolean> {
    if (!sesion) return false
    if (await estaAreaCerradaHoy(sesion.area_id || '')) {
      Alert.alert(
        'Inventario finalizado',
        `${nombreArea(sesion.area_id)} ya fue finalizado hoy. Solo el supervisor puede reabrirlo (Salas → 🔓 Reabrir).`
      )
      return false
    }
    const neto = pesoBruto - taraEfectiva
    if (!(pesoBruto > 0) || neto < 0) return false

    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()
    const fotos = fotoUris || []

    const fila = {
      id, sesion_id: sesion.id, area_id: sesion.area_id || '',
      material_id: referencia.categoriaId,
      referencia_codigo: referencia.codigo,
      referencia_descripcion: referencia.descripcion,
      contenedor, tara: taraEfectiva, peso_bruto: pesoBruto, peso_neto: neto,
      observaciones: '', codigo_barras: '', lote_codigo: loteCodigo || '',
      fotos_count: fotos.length,
      created_at: now, created_by: sesion.nombre_operador,
    }

    await db.runAsync(
      `INSERT INTO inv_registros (id, sesion_id, area_id, material_id, referencia_codigo, referencia_descripcion, contenedor, tara, peso_bruto, peso_neto, observaciones, codigo_barras, lote_codigo, fotos_count, created_at, created_by, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [fila.id, fila.sesion_id, fila.area_id, fila.material_id, fila.referencia_codigo, fila.referencia_descripcion, fila.contenedor, fila.tara, fila.peso_bruto, fila.peso_neto, fila.observaciones, fila.codigo_barras, fila.lote_codigo, fila.fotos_count, fila.created_at, fila.created_by]
    )
    const fotoRows = fotos.map((uri, i) => ({ id: randomUUID(), registro_id: id, path_local: uri, orden: i }))
    for (const f of fotoRows) {
      await db.runAsync(
        'INSERT INTO inv_fotos (id, registro_id, path_local, orden) VALUES (?, ?, ?, ?)',
        [f.id, f.registro_id, f.path_local, f.orden]
      )
    }
    subirFotosEnSegundoPlano(fotoRows)

    if (loteCodigo) {
      await db.runAsync(
        "UPDATE inv_lotes SET estado = 'pesado' WHERE area_id = ? AND codigo = ? AND estado = 'pendiente'",
        [fila.area_id, loteCodigo]
      )
    }

    subirEnSegundoPlano(fila)

    activarReferencia(referencia)
    await cargarHistorial()
    return true
  }

  function handleAbrirCamara() {
    if (inputFotos.length >= MAX_FOTOS_POR_MENSAJE) {
      Alert.alert('Límite de fotos', `Máximo ${MAX_FOTOS_POR_MENSAJE} fotos por pesada`)
      return
    }
    setCamaraVisible(true)
  }

  function handleFotoCapturada(uri: string) {
    setInputFotos(prev => [...prev, { uri }])
  }

  function handleQuitarFotoInput(index: number) {
    setInputFotos(prev => prev.filter((_, i) => i !== index))
  }

  function handleSeleccionarMaterial(ref: ReferenciaFlat) {
    activarReferencia(ref)
    irA(POS_CHAT)
  }

  async function handleEnviarPeso() {
    const pesoBruto = parseFloat(pesoInput)
    if (!(pesoBruto > 0)) return

    if (!activeReferencia) {
      abrirMaterialPanel()
      return
    }

    setSending(true)
    try {
      const fotos = inputFotos.map(f => f.uri)
      const lote = inputLote || undefined
      const taraEfectiva = usarTara ? tara : 0
      const ok = await insertarRegistro(activeReferencia, pesoBruto, taraEfectiva, fotos, lote)
      if (!ok) agregarPendiente(pesoBruto.toString(), pesoBruto, taraEfectiva, fotos, lote)
    } finally {
      setPesoInput('')
      setInputFotos([])
      quitarLoteInput()
      setSending(false)
    }
  }

  function handleEditRegistro(r: RegistroPesada) {
    setEditando(r)
    setEditPesoBruto(r.peso_bruto.toString())
    setEditTara((usarTara ? r.tara : 0).toString())
    setEditContenedor(r.contenedor)
    setEditObservaciones(r.observaciones)
    setEditMaterialId(r.material_id)
    setEditReferencia(r.referencia_codigo ? { codigo: r.referencia_codigo, descripcion: r.referencia_descripcion } : null)
    setEditLote(r.lote_codigo || '')
  }

  async function handleSaveEdit() {
    if (!editando) return
    const pb = parseFloat(editPesoBruto)
    const t = usarTara ? parseFloat(editTara) : 0
    if (isNaN(pb) || pb <= 0) { Alert.alert('Error', 'Peso bruto inválido'); return }
    if (isNaN(t) || t < 0) { Alert.alert('Error', 'Tara inválida'); return }
    if (await estaAreaCerradaHoy(editando.area_id || sesion?.area_id || '')) {
      Alert.alert('Inventario finalizado', 'Esta área ya fue finalizada hoy — no se puede editar.')
      return
    }
    try {
      const db = getDatabase()
      const lote = editLote.trim()
      await db.runAsync(
        'UPDATE inv_registros SET material_id = ?, referencia_codigo = ?, referencia_descripcion = ?, peso_bruto = ?, tara = ?, contenedor = ?, observaciones = ?, peso_neto = ?, lote_codigo = ?, synced = 0 WHERE id = ?',
        [editMaterialId, editReferencia?.codigo || '', editReferencia?.descripcion || '', pb, t, editContenedor, editObservaciones, pb - t, lote, editando.id]
      )
      if (lote) {
        await db.runAsync(
          "UPDATE inv_lotes SET estado = 'pesado' WHERE area_id = ? AND codigo = ? AND estado = 'pendiente'",
          [editando.area_id || sesion?.area_id || '', lote]
        )
      }
      setEditando(null)
      await cargarHistorial()
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar')
    }
  }

  async function handleLongPressRegistro(r: RegistroPesada) {
    if (await estaAreaCerradaHoy(r.area_id || sesion?.area_id || '')) {
      Alert.alert('Inventario finalizado', 'Esta área ya fue finalizada hoy — no se puede eliminar nada.')
      return
    }
    Alert.alert(
      '¿Eliminar registro?',
      'Esta acción no se puede deshacer',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = getDatabase()
              await db.runAsync('DELETE FROM inv_registros WHERE id = ?', [r.id])
              await cargarHistorial()
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'No se pudo eliminar')
            }
          },
        },
      ]
    )
  }

  function handleVerFotos(fotos: Foto[]) {
    setFotosActuales(fotos)
    setFotosVisible(true)
  }

  function handleAbrirCorreccion(p: ChatPendingMessage) {
    setCorrigiendo(p)
    setCorrMaterialId('')
    setCorrReferencia(null)
    setCorrPeso(p.pesoBrutoDetectado?.toString() ?? '')
    setCorrTara((usarTara ? (p.taraOverrideDetectado ?? tara) : 0).toString())
    setCorrLote(p.loteCodigo || '')
  }

  async function handleGuardarCorreccion() {
    if (!corrigiendo) return
    if (!corrReferencia || !corrReferencia.codigo) {
      Alert.alert('Falta referencia', 'Selecciona una referencia')
      return
    }
    const pb = parseFloat(corrPeso)
    const t = usarTara ? parseFloat(corrTara) : 0
    if (isNaN(pb) || pb <= 0) { Alert.alert('Error', 'Peso bruto inválido'); return }
    if (isNaN(t) || t < 0) { Alert.alert('Error', 'Tara inválida'); return }

    const refFlat = buildRefFlat(corrMaterialId, corrReferencia)
    const ok = await insertarRegistro(refFlat, pb, t, corrigiendo.fotoUris, corrLote.trim() || undefined)
    if (!ok) { Alert.alert('Error', 'El peso neto no puede ser negativo'); return }
    setPendientes(prev => prev.filter(x => x.localId !== corrigiendo.localId))
    setCorrigiendo(null)
  }

  function handleDescartarCorreccion() {
    if (!corrigiendo) return
    setPendientes(prev => prev.filter(x => x.localId !== corrigiendo.localId))
    setCorrigiendo(null)
  }

  const items: ChatListItem[] = useMemo(() => {
    const a: ChatListItem[] = registros.map(r => ({ kind: 'registro', key: `r-${r.id}`, createdAt: r.created_at, registro: r }))
    const b: ChatListItem[] = pendientes.map(p => ({ kind: 'pending', key: `p-${p.localId}`, createdAt: p.createdAt, pending: p }))
    const c: ChatListItem[] = sistemas.map(s => ({ kind: 'system', key: `s-${s.id}`, createdAt: s.createdAt, texto: s.texto }))
    return [...a, ...b, ...c].sort((x, y) => x.createdAt.localeCompare(y.createdAt))
  }, [registros, pendientes, sistemas])

  useEffect(() => {
    if (items.length > 0) {
      const timer = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
      return () => clearTimeout(timer)
    }
  }, [items.length])

  const totalNeto = registros.reduce((s, r) => s + r.peso_neto, 0)

  if (!sesion) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Inicia una sesión primero</Text>
      </View>
    )
  }

  if (usarTara && !contenedorConfirmado) {
    return (
      <View style={styles.wrapper}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitleText}>📦 Contenedor de esta sesión rápida</Text>
            <View style={{ height: 12 }} />
            <ContainerSelector tara={tara} onSelect={(t, n) => { setTara(t); setContenedor(n) }} />
            <TouchableOpacity style={styles.confirmBtn} onPress={() => setContenedorConfirmado(true)} activeOpacity={0.8}>
              <Text style={styles.confirmBtnText}>Confirmar y empezar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={styles.pagerOverflow} {...panResponder.panHandlers}>
      <Animated.View style={[styles.pagerRow, { transform: [{ translateX: swipeX }] }]}>
      <View style={styles.pagerPane}>
        {panelMontado && (
          <MaterialPickerPanel recientes={chips} activo={activeReferencia} onSelect={handleSeleccionarMaterial} />
        )}
      </View>
      <KeyboardAvoidingView
        style={[
          styles.wrapper,
          styles.pagerPane,
          Platform.OS === 'android' && { paddingBottom: alturaTeclado },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ReferenciaChipsBar chips={chips} activo={activeReferencia} onSelectChip={activarReferencia} />

      <FlatList
        ref={flatListRef}
        style={styles.flatList}
        data={items}
        keyExtractor={item => item.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ChatBubble
            item={item}
            fotos={item.kind === 'registro' ? fotosPorRegistro.get(item.registro.id) : undefined}
            comparacion={item.kind === 'registro' ? porRegistro[item.registro.id] : undefined}
            usarTara={usarTara}
            onPressRegistro={handleEditRegistro}
            onLongPressRegistro={handleLongPressRegistro}
            onPressPending={handleAbrirCorreccion}
            onPressFoto={handleVerFotos}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>Sin mensajes aún</Text>
            <Text style={styles.emptyDesc}>Escribe un material o un peso para empezar</Text>
          </View>
        }
      />

      <View style={styles.footer}>
        {usarTara && (
          <View style={styles.footerRow}>
            <Text style={styles.footerContenedor}>📦 {contenedor} · tara {tara} kg</Text>
            <TouchableOpacity onPress={() => setPickerVisible(true)}>
              <Text style={styles.footerCambiar}>cambiar</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.footerText}>
          {registros.length} registro(s) · {totalNeto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} kg neto
        </Text>
      </View>

      <View style={styles.materialBar}>
        {activeReferencia ? (
          <View style={styles.materialBarInfo}>
            <Text style={styles.materialBarIcon}>{activeReferencia.icono}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.materialBarCodigo} numberOfLines={1}>{activeReferencia.codigo}</Text>
              <Text style={styles.materialBarDesc} numberOfLines={1}>{formatDescripcion(activeReferencia.descripcion)}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.materialBarVacio}>Sin material seleccionado</Text>
        )}
        <TouchableOpacity style={styles.quickIconBtn} onPress={handleAbrirCamara} activeOpacity={0.7}>
          <Text style={styles.quickIconBtnText}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickIconBtn} onPress={() => setBasculaVisible(true)} activeOpacity={0.7}>
          <Text style={styles.quickIconBtnText}>⚖️</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickIconBtn}
          onPress={() => setLoteScannerVisible(true)}
          onLongPress={abrirModalLote}
          activeOpacity={0.7}
        >
          <Text style={styles.quickIconBtnText}>🏷️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.materialBarBtn} onPress={abrirMaterialPanel} activeOpacity={0.7}>
          <Text style={styles.materialBarBtnText}>🔀 Cambiar</Text>
        </TouchableOpacity>
      </View>

      {inputFotos.length > 0 && (
        <View style={styles.inputFotoPreview}>
          {inputFotos.map((f, i) => (
            <ChatPhotoThumb key={f.uri + i} uri={f.uri} onPress={() => {}} onRemove={() => handleQuitarFotoInput(i)} size={48} />
          ))}
        </View>
      )}

      {inputLote && (
        <View style={styles.loteChipRow}>
          <View
            style={[
              styles.loteChip,
              loteEstado === 'ok' && styles.loteChipOk,
              loteEstado === 'desconocido' && styles.loteChipDesconocido,
              loteEstado === 'repetido' && styles.loteChipRepetido,
            ]}
          >
            <TouchableOpacity onPress={abrirModalLote} activeOpacity={0.7}>
              <Text style={styles.loteChipText}>
                🏷️ {inputLote}
                {loteEstado === 'desconocido' && ' · no está en la lista cargada'}
                {loteEstado === 'repetido' && ' · ya fue pesado'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={quitarLoteInput}>
              <Text style={styles.loteChipQuitar}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <NumericKeypad
        value={pesoInput}
        onChange={setPesoInput}
        onSubmit={handleEnviarPeso}
        submitDisabled={sending || !(parseFloat(pesoInput) > 0)}
        submitLabel={activeReferencia ? `Enviar · ${activeReferencia.codigo}` : 'Elegir material'}
      />

      <PhotoViewer visible={fotosVisible} fotos={fotosActuales} onClose={() => setFotosVisible(false)} />

      <CameraCapture
        visible={camaraVisible}
        onClose={() => setCamaraVisible(false)}
        onCapture={handleFotoCapturada}
      />

      <Modal visible={basculaVisible} animationType="slide" onRequestClose={() => setBasculaVisible(false)}>
        <ScaleReader
          onClose={() => setBasculaVisible(false)}
          onWeight={kg => { setPesoInput(kg.toString()); setBasculaVisible(false) }}
        />
      </Modal>

      <QrScanner
        visible={loteScannerVisible}
        onClose={() => setLoteScannerVisible(false)}
        onScan={handleEscanearLote}
      />

      <Modal visible={loteModalVisible} transparent animationType="fade" onRequestClose={() => setLoteModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🏷️ Lote de esta pesada</Text>
            <TextInput
              style={styles.input}
              placeholder="Escribe el código del lote"
              placeholderTextColor={COLORS.textLight}
              value={loteManualInput}
              onChangeText={setLoteManualInput}
              autoCapitalize="characters"
              autoFocus
            />
            {loteManualInput.trim().length > 0 && (
              <LoteAutocomplete sugerencias={loteSugerencias} onSelect={handleSeleccionarSugerenciaLote} />
            )}
            <View style={{ height: 14 }} />
            <TouchableOpacity style={styles.secondaryBtnLote} onPress={() => setLoteScannerVisible(true)} activeOpacity={0.8}>
              <Text style={styles.secondaryBtnLoteText}>📷 Escanear código de barras</Text>
            </TouchableOpacity>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarLoteManual} activeOpacity={0.8}>
                <Text style={styles.saveBtnText}>💾 Guardar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setLoteModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setPickerVisible(false)}>
          <TouchableOpacity style={styles.sheetContainer} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Cambiar contenedor</Text>
            <View style={styles.sheetRow}>
              {CONTENEDORES.map(op => {
                const activo = contenedor === op.nombre
                return (
                  <TouchableOpacity
                    key={op.id}
                    style={[styles.sheetPill, activo && styles.sheetPillActiva]}
                    onPress={() => {
                      if (op.id === 'otro') {
                        setContenedor('Personalizado')
                        setTara(0)
                        setTaraPersonalizada('')
                      } else {
                        setContenedor(op.nombre)
                        setTara(op.tara)
                        setPickerVisible(false)
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sheetPillIcon}>{op.icono}</Text>
                    <Text style={[styles.sheetPillText, activo && styles.sheetPillTextActiva]}>
                      {op.id === 'otro' ? 'Otro' : `${op.nombre} · ${op.tara}kg`}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            {contenedor === 'Personalizado' && (
              <View style={styles.sheetCustomRow}>
                <TextInput
                  style={styles.sheetCustomInput}
                  placeholder="Tara personalizada (kg)"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="decimal-pad"
                  value={taraPersonalizada}
                  onChangeText={val => { setTaraPersonalizada(val); setTara(parseFloat(val) || 0) }}
                  autoFocus
                />
                <TouchableOpacity style={styles.sheetListoBtn} onPress={() => setPickerVisible(false)}>
                  <Text style={styles.sheetListoBtnText}>Listo</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!editando} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>✏️ Editar Registro</Text>
            {editando && (
              <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
                <MaterialGrid seleccionado={editMaterialId} onSelect={setEditMaterialId} />
                {editMaterialId && (
                  <View style={styles.modalRefSection}>
                    <ReferenciaSelector
                      referencias={CATEGORIA_MAP.get(editMaterialId)?.referencias || []}
                      seleccionada={editReferencia}
                      onSelect={setEditReferencia}
                    />
                  </View>
                )}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Peso Bruto (kg) *</Text>
                  <TextInput style={styles.input} value={editPesoBruto} onChangeText={setEditPesoBruto} keyboardType="decimal-pad" />
                </View>
                {usarTara && (
                  <>
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Tara (kg) *</Text>
                      <TextInput style={styles.input} value={editTara} onChangeText={setEditTara} keyboardType="decimal-pad" />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Contenedor</Text>
                      <TextInput style={styles.input} value={editContenedor} onChangeText={setEditContenedor} />
                    </View>
                  </>
                )}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Observaciones</Text>
                  <TextInput style={[styles.input, styles.textArea]} value={editObservaciones} onChangeText={setEditObservaciones} multiline numberOfLines={2} />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Lote</Text>
                  <TextInput
                    style={styles.input}
                    value={editLote}
                    onChangeText={setEditLote}
                    placeholder="Código de lote (opcional)"
                    placeholderTextColor={COLORS.textLight}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={{ height: 20 }} />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit} activeOpacity={0.8}>
                    <Text style={styles.saveBtnText}>💾 Guardar Cambios</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditando(null)}>
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!corrigiendo} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⚠️ Corregir mensaje</Text>
            {corrigiendo && (
              <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
                <View style={styles.corrOriginal}>
                  <Text style={styles.corrOriginalLabel}>Mensaje original</Text>
                  <Text style={styles.corrOriginalText}>"{corrigiendo.textoOriginal}"</Text>
                </View>
                <MaterialGrid
                  seleccionado={corrMaterialId}
                  onSelect={id => { setCorrMaterialId(id); setCorrReferencia(null) }}
                />
                {corrMaterialId && (
                  <View style={styles.modalRefSection}>
                    <ReferenciaSelector
                      referencias={CATEGORIA_MAP.get(corrMaterialId)?.referencias || []}
                      seleccionada={corrReferencia}
                      onSelect={setCorrReferencia}
                    />
                  </View>
                )}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Peso Bruto (kg) *</Text>
                  <TextInput style={styles.input} value={corrPeso} onChangeText={setCorrPeso} keyboardType="decimal-pad" />
                </View>
                {usarTara && (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Tara (kg) *</Text>
                    <TextInput style={styles.input} value={corrTara} onChangeText={setCorrTara} keyboardType="decimal-pad" />
                  </View>
                )}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Lote</Text>
                  <TextInput
                    style={styles.input}
                    value={corrLote}
                    onChangeText={setCorrLote}
                    placeholder="Código de lote (opcional)"
                    placeholderTextColor={COLORS.textLight}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={{ height: 20 }} />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleGuardarCorreccion} activeOpacity={0.8}>
                    <Text style={styles.saveBtnText}>💾 Guardar Registro</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.discardBtn} onPress={handleDescartarCorreccion}>
                    <Text style={styles.discardBtnText}>🗑️ Descartar mensaje</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setCorrigiendo(null)}>
                    <Text style={styles.cancelBtnText}>Cancelar (dejar pendiente)</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>

      <View style={styles.pagerPane}>
        {panelMontado && (
          <ComparacionTabla areaId={sesion.area_id || ''} miNombre={sesion.nombre_operador} onCerrar={cerrarComparacion} />
        )}
      </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  pagerOverflow: {
    flex: 1,
    overflow: 'hidden',
  },
  pagerRow: {
    flex: 1,
    flexDirection: 'row',
    width: screenWidth * 3,
  },
  pagerPane: {
    width: screenWidth,
  },
  wrapper: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  centerText: {
    color: COLORS.textLight,
    fontSize: 15,
  },
  content: {
    padding: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  confirmBtn: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    marginTop: 18,
  },
  confirmBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  flatList: {
    flex: 1,
  },
  list: {
    padding: 10,
    paddingBottom: 20,
  },
  footer: {
    paddingVertical: 4,
    paddingHorizontal: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  footerContenedor: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  footerCambiar: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 30,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 14,
    textAlign: 'center',
  },
  sheetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sheetPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  sheetPillActiva: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(26,95,42,0.06)',
  },
  sheetPillIcon: {
    fontSize: 15,
  },
  sheetPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  sheetPillTextActiva: {
    color: COLORS.primary,
  },
  sheetCustomRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  sheetCustomInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    padding: 12,
    fontSize: 15,
    backgroundColor: COLORS.card,
    color: COLORS.text,
  },
  sheetListoBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetListoBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    opacity: 0.3,
    marginBottom: 15,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textLight,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  inputFotoPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: COLORS.card,
  },
  loteChipRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: COLORS.card,
  },
  loteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'flex-start',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loteChipOk: {
    borderColor: '#2ecc71',
    backgroundColor: 'rgba(46,204,113,0.08)',
  },
  loteChipDesconocido: {
    borderColor: '#e67e22',
    backgroundColor: 'rgba(230,126,34,0.08)',
  },
  loteChipRepetido: {
    borderColor: COLORS.danger,
    backgroundColor: 'rgba(231,76,60,0.08)',
  },
  loteChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  loteChipQuitar: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  secondaryBtnLote: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    padding: 12,
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  secondaryBtnLoteText: {
    fontWeight: '700',
    fontSize: 13,
    color: COLORS.text,
  },
  materialBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  materialBarInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  materialBarIcon: {
    fontSize: 18,
  },
  materialBarCodigo: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  materialBarDesc: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  materialBarVacio: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  materialBarBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: SIZES.radiusSm,
  },
  materialBarBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 12,
  },
  quickIconBtn: {
    width: 32,
    height: 32,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickIconBtnText: {
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    padding: 25,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 500,
  },
  modalRefSection: {
    marginTop: 10,
    marginBottom: 10,
  },
  corrOriginal: {
    backgroundColor: COLORS.bg,
    borderRadius: SIZES.radiusSm,
    padding: 10,
    marginBottom: 12,
  },
  corrOriginalLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  corrOriginalText: {
    fontSize: 14,
    color: COLORS.text,
    fontStyle: 'italic',
    marginTop: 2,
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 5,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modalBtns: {
    marginTop: 15,
    gap: 10,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radius,
    padding: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  discardBtn: {
    backgroundColor: 'transparent',
    borderRadius: SIZES.radius,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  discardBtnText: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 14,
  },
  cancelBtn: {
    alignItems: 'center',
    padding: 10,
  },
  cancelBtnText: {
    color: COLORS.textLight,
    fontWeight: '600',
    fontSize: 14,
  },
})
