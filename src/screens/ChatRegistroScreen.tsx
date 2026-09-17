import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  KeyboardAvoidingView, Alert, Modal, StyleSheet, Animated, PanResponder, Dimensions
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import { randomUUID } from 'expo-crypto'
import ContainerSelector from '../components/ContainerSelector'
import MaterialGrid from '../components/MaterialGrid'
import ReferenciaSelector from '../components/ReferenciaSelector'
import PhotoViewer from '../components/PhotoViewer'
import ChatBubble from '../components/ChatBubble'
import ReferenciaChipsBar from '../components/ReferenciaChipsBar'
import ChatReferenciaAutocomplete from '../components/ChatReferenciaAutocomplete'
import ChatPhotoThumb from '../components/ChatPhotoThumb'
import ComparacionTabla from '../components/ComparacionTabla'
import QrScanner from '../components/QrScanner'
import LoteAutocomplete from '../components/LoteAutocomplete'
import { getDatabase } from '../services/database'
import { subirEnSegundoPlano, sincronizarLotes } from '../services/sync'
import { COLORS, SIZES } from '../constants/theme'
import { CATEGORIA_MAP, MATERIAL_MAP } from '../constants/materiales'
import { parseMensaje } from '../utils/chatParser'
import { formatDescripcion } from '../utils/format'
import { useSesion } from '../context/SesionContext'
import { useComparaciones } from '../context/ComparacionesContext'
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

export default function ChatRegistroScreen() {
  const { sesion } = useSesion()
  const { porRegistro } = useComparaciones()

  const [registros, setRegistros] = useState<RegistroPesada[]>([])
  const [pendientes, setPendientes] = useState<ChatPendingMessage[]>([])
  const [sistemas, setSistemas] = useState<{ id: string; createdAt: string; texto: string }[]>([])
  const [fotosPorRegistro, setFotosPorRegistro] = useState<Map<string, Foto[]>>(new Map())

  const [contenedorConfirmado, setContenedorConfirmado] = useState(false)
  const [tara, setTara] = useState(2)
  const [contenedor, setContenedor] = useState('TULA')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [taraPersonalizada, setTaraPersonalizada] = useState('')

  // Arrastre tipo WhatsApp: el chat y la tabla "1 vs 1" viven lado a lado,
  // un solo valor animado mueve la fila completa según cuánto arrastres.
  const [panelMontado, setPanelMontado] = useState(false)
  const swipeX = useRef(new Animated.Value(0)).current
  const basePosRef = useRef(0) // 0 = chat, -screenWidth = tabla

  const UMBRAL_DISTANCIA = screenWidth * 0.35
  const UMBRAL_VELOCIDAD = 0.5

  function irA(destino: number) {
    Animated.timing(swipeX, { toValue: destino, duration: 220, useNativeDriver: true }).start(() => {
      basePosRef.current = destino
      if (destino === 0) setPanelMontado(false)
    })
  }

  function cerrarComparacion() {
    irA(0)
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderGrant: () => {
        setPanelMontado(true)
      },
      onPanResponderMove: (_, g) => {
        const nuevo = Math.min(0, Math.max(-screenWidth, basePosRef.current + g.dx))
        swipeX.setValue(nuevo)
      },
      onPanResponderRelease: (_, g) => {
        const cerrado = basePosRef.current === 0
        const destino = cerrado
          ? (g.dx < -UMBRAL_DISTANCIA || g.vx < -UMBRAL_VELOCIDAD ? -screenWidth : 0)
          : (g.dx > UMBRAL_DISTANCIA || g.vx > UMBRAL_VELOCIDAD ? 0 : -screenWidth)
        irA(destino)
      },
    })
  ).current

  const [activeReferencia, setActiveReferencia] = useState<ReferenciaFlat | null>(null)
  const [chips, setChips] = useState<ReferenciaFlat[]>([])

  const [inputText, setInputText] = useState('')
  const [inputFotos, setInputFotos] = useState<{ uri: string }[]>([])
  const [sending, setSending] = useState(false)

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
    for (let i = 0; i < fotos.length; i++) {
      await db.runAsync(
        'INSERT INTO inv_fotos (id, registro_id, path_local, orden) VALUES (?, ?, ?, ?)',
        [randomUUID(), id, fotos[i], i]
      )
    }

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

  async function handleTakePhotoInput() {
    if (inputFotos.length >= MAX_FOTOS_POR_MENSAJE) {
      Alert.alert('Límite de fotos', `Máximo ${MAX_FOTOS_POR_MENSAJE} fotos por pesada`)
      return
    }
    const permiso = await ImagePicker.requestCameraPermissionsAsync()
    if (!permiso.granted) {
      Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara')
      return
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.5 })
    if (!result.canceled && result.assets[0]) {
      setInputFotos(prev => [...prev, { uri: result.assets[0].uri }])
    }
  }

  function handleQuitarFotoInput(index: number) {
    setInputFotos(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSend() {
    const texto = inputText.trim()
    const fotos = inputFotos.map(f => f.uri)
    if (!texto && fotos.length === 0) return

    setSending(true)
    try {
      const parsed = parseMensaje(texto)

      const lote = inputLote || undefined

      if (parsed.tipo === 'referencia') {
        const refFlat = buildRefFlat(parsed.categoriaId, parsed.referencia)
        if (parsed.pesoBruto !== undefined) {
          const ok = await insertarRegistro(refFlat, parsed.pesoBruto, parsed.taraOverride ?? tara, fotos, lote)
          if (!ok) agregarPendiente(texto, parsed.pesoBruto, parsed.taraOverride, fotos, lote)
        } else {
          activarReferencia(refFlat)
          agregarSistema(`🔀 Activa: ${refFlat.codigo} · ${formatDescripcion(refFlat.descripcion)}`)
        }
      } else if (parsed.tipo === 'peso') {
        if (activeReferencia) {
          const ok = await insertarRegistro(activeReferencia, parsed.pesoBruto, parsed.taraOverride ?? tara, fotos, lote)
          if (!ok) agregarPendiente(texto, parsed.pesoBruto, parsed.taraOverride, fotos, lote)
        } else {
          agregarPendiente(texto, parsed.pesoBruto, parsed.taraOverride, fotos, lote)
        }
      } else {
        agregarPendiente(parsed.textoOriginal, parsed.pesoBrutoDetectado, parsed.taraOverrideDetectado, fotos, lote)
      }
    } finally {
      setInputText('')
      setInputFotos([])
      quitarLoteInput()
      setSending(false)
    }
  }

  function handleSeleccionarSugerencia(ref: ReferenciaFlat) {
    activarReferencia(ref)
    agregarSistema(`🔀 Activa: ${ref.codigo} · ${formatDescripcion(ref.descripcion)}`)
    setInputText('')
  }

  function handleEditRegistro(r: RegistroPesada) {
    setEditando(r)
    setEditPesoBruto(r.peso_bruto.toString())
    setEditTara(r.tara.toString())
    setEditContenedor(r.contenedor)
    setEditObservaciones(r.observaciones)
    setEditMaterialId(r.material_id)
    setEditReferencia(r.referencia_codigo ? { codigo: r.referencia_codigo, descripcion: r.referencia_descripcion } : null)
    setEditLote(r.lote_codigo || '')
  }

  async function handleSaveEdit() {
    if (!editando) return
    const pb = parseFloat(editPesoBruto)
    const t = parseFloat(editTara)
    if (isNaN(pb) || pb <= 0) { Alert.alert('Error', 'Peso bruto inválido'); return }
    if (isNaN(t) || t < 0) { Alert.alert('Error', 'Tara inválida'); return }
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

  function handleLongPressRegistro(r: RegistroPesada) {
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
    setCorrTara((p.taraOverrideDetectado ?? tara).toString())
    setCorrLote(p.loteCodigo || '')
  }

  async function handleGuardarCorreccion() {
    if (!corrigiendo) return
    if (!corrReferencia || !corrReferencia.codigo) {
      Alert.alert('Falta referencia', 'Selecciona una referencia')
      return
    }
    const pb = parseFloat(corrPeso)
    const t = parseFloat(corrTara)
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
  const previewParsed = inputText.trim().length >= 2 ? parseMensaje(inputText) : null
  const mostrarAutocomplete = !!previewParsed && previewParsed.tipo !== 'peso'

  if (!sesion) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Inicia una sesión primero</Text>
      </View>
    )
  }

  if (!contenedorConfirmado) {
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
      <KeyboardAvoidingView style={[styles.wrapper, styles.pagerPane]} behavior="padding">
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
        <View style={styles.footerRow}>
          <Text style={styles.footerContenedor}>📦 {contenedor} · tara {tara} kg</Text>
          <TouchableOpacity onPress={() => setPickerVisible(true)}>
            <Text style={styles.footerCambiar}>cambiar</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.footerText}>
          {registros.length} registro(s) · {totalNeto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} kg neto
        </Text>
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

      <View style={styles.composerWrap}>
        {mostrarAutocomplete && (
          <ChatReferenciaAutocomplete query={inputText} onSelect={handleSeleccionarSugerencia} />
        )}
        <View style={styles.composerRow}>
          <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhotoInput} activeOpacity={0.7}>
            <Text style={styles.photoBtnIcon}>📷</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.photoBtn}
            onPress={() => setLoteScannerVisible(true)}
            onLongPress={abrirModalLote}
            activeOpacity={0.7}
          >
            <Text style={styles.photoBtnIcon}>🏷️</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.composerInput}
            placeholder={activeReferencia ? `${activeReferencia.codigo} · escribe el peso` : 'Escribe un material o código...'}
            placeholderTextColor={COLORS.textLight}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={sending}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <PhotoViewer visible={fotosVisible} fotos={fotosActuales} onClose={() => setFotosVisible(false)} />

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
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Tara (kg) *</Text>
                  <TextInput style={styles.input} value={editTara} onChangeText={setEditTara} keyboardType="decimal-pad" />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Contenedor</Text>
                  <TextInput style={styles.input} value={editContenedor} onChangeText={setEditContenedor} />
                </View>
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
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Tara (kg) *</Text>
                  <TextInput style={styles.input} value={corrTara} onChangeText={setCorrTara} keyboardType="decimal-pad" />
                </View>
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
    width: screenWidth * 2,
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
    paddingVertical: 8,
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
  composerWrap: {
    position: 'relative',
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
  },
  photoBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtnIcon: {
    fontSize: 18,
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: COLORS.bg,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
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
