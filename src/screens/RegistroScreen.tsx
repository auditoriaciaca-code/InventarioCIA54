import { useState, useCallback, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Alert, StyleSheet, KeyboardAvoidingView, Platform
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { randomUUID } from 'expo-crypto'
import MaterialGrid from '../components/MaterialGrid'
import ContainerSelector from '../components/ContainerSelector'
import WeightDisplay from '../components/WeightDisplay'
import PhotoGrid from '../components/PhotoGrid'
import ReferenciaSelector from '../components/ReferenciaSelector'
import QrScanner from '../components/QrScanner'
import ScaleReader from '../components/ScaleReader'
import { getDatabase } from '../services/database'
import { subirEnSegundoPlano, subirFotosEnSegundoPlano, estaAreaCerradaHoy, sincronizarCierresHoy } from '../services/sync'
import { nombreArea } from '../constants/areas'
import { COLORS, SIZES } from '../constants/theme'
import { CATEGORIA_MAP, CATEGORIAS } from '../constants/materiales'
import { Referencia } from '../types'
import { useSesion } from '../context/SesionContext'
import { formatDescripcion } from '../utils/format'

type FotoItem = { uri: string } | null

export default function RegistroScreen() {
  const { sesion } = useSesion()
  const [materialId, setMaterialId] = useState('')
  const [referencia, setReferencia] = useState<Referencia | null>(null)
  const [tara, setTara] = useState(2)
  const [contenedor, setContenedor] = useState('TULA')
  const [pesoBruto, setPesoBruto] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [fotos, setFotos] = useState<FotoItem[]>([null, null, null])
  const [saving, setSaving] = useState(false)
  const [qrVisible, setQrVisible] = useState(false)
  const [codigoBarras, setCodigoBarras] = useState('')
  const [scaleReaderVisible, setScaleReaderVisible] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const scrollTo = (y: number) => scrollRef.current?.scrollTo({ y, animated: true })

  useEffect(() => {
    sincronizarCierresHoy()
  }, [sesion?.area_id])

  const TODOS_CODIGOS = CATEGORIAS
    .flatMap(c => c.referencias.map(r => r.codigo))
    .sort((a, b) => b.length - a.length)

  function extraerDeBarras(barcode: string): { codigo: string | null; resto: string } {
    for (const refCodigo of TODOS_CODIGOS) {
      if (barcode.startsWith(refCodigo)) {
        return { codigo: refCodigo, resto: barcode.slice(refCodigo.length) }
      }
    }
    return { codigo: null, resto: barcode }
  }

  const categoriaActual = CATEGORIA_MAP.get(materialId)

  const bruto = parseFloat(pesoBruto) || 0
  const neto = bruto - tara
  const netoValido = neto >= 0

  const handleSelectContainer = useCallback((t: number, nombre: string) => {
    setTara(t)
    setContenedor(nombre)
  }, [])

  async function handleTakePhoto(index: number) {
    const permiso = await ImagePicker.requestCameraPermissionsAsync()
    if (!permiso.granted) {
      Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
    })
    if (!result.canceled && result.assets[0]) {
      const nuevas = [...fotos]
      nuevas[index] = { uri: result.assets[0].uri }
      setFotos(nuevas)
    }
  }

  function handleRemovePhoto(index: number) {
    const nuevas = [...fotos]
    nuevas[index] = null
    setFotos(nuevas)
  }

  async function handleGuardar() {
    if (!sesion) {
      Alert.alert('Sin sesión', 'Debe iniciar una sesión primero')
      return
    }
    if (!materialId) {
      Alert.alert('Campo requerido', 'Por favor seleccione una categoría de material')
      return
    }
    if (!referencia || !referencia.codigo) {
      Alert.alert('Campo requerido', 'Por favor seleccione una referencia')
      return
    }
    if (!pesoBruto || bruto <= 0) {
      Alert.alert('Campo requerido', 'Por favor ingrese un peso bruto válido')
      return
    }
    if (neto < 0) {
      Alert.alert('Error', 'El peso neto no puede ser negativo')
      return
    }
    if (await estaAreaCerradaHoy(sesion.area_id || '')) {
      Alert.alert(
        'Inventario finalizado',
        `${nombreArea(sesion.area_id)} ya fue finalizado hoy. Solo el supervisor puede reabrirlo (Salas → 🔓 Reabrir).`
      )
      return
    }

    setSaving(true)
    try {
      const db = getDatabase()
      const id = randomUUID()
      const now = new Date().toISOString()
      const fotosValidas = fotos.filter(f => f !== null)

      const fila = {
        id, sesion_id: sesion.id, area_id: sesion.area_id || '',
        material_id: materialId,
        referencia_codigo: referencia.codigo,
        referencia_descripcion: referencia.descripcion,
        contenedor, tara, peso_bruto: bruto, peso_neto: neto,
        observaciones, codigo_barras: codigoBarras,
        fotos_count: fotosValidas.length,
        created_at: now, created_by: sesion.nombre_operador,
      }

      await db.runAsync(
        `INSERT INTO inv_registros (id, sesion_id, area_id, material_id, referencia_codigo, referencia_descripcion, contenedor, tara, peso_bruto, peso_neto, observaciones, codigo_barras, fotos_count, created_at, created_by, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [fila.id, fila.sesion_id, fila.area_id, fila.material_id, fila.referencia_codigo, fila.referencia_descripcion, fila.contenedor, fila.tara, fila.peso_bruto, fila.peso_neto, fila.observaciones, fila.codigo_barras, fila.fotos_count, fila.created_at, fila.created_by]
      )

      const fotoRows = fotosValidas.map((f, i) => ({ id: randomUUID(), registro_id: id, path_local: f!.uri, orden: i }))
      for (const f of fotoRows) {
        await db.runAsync(
          'INSERT INTO inv_fotos (id, registro_id, path_local, orden) VALUES (?, ?, ?, ?)',
          [f.id, f.registro_id, f.path_local, f.orden]
        )
      }
      subirFotosEnSegundoPlano(fotoRows)

      subirEnSegundoPlano(fila)

      Alert.alert('Guardado', 'Registro guardado correctamente', [
        { text: 'OK', onPress: limpiarFormulario },
      ])
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  function limpiarFormulario() {
    setPesoBruto('')
    setObservaciones('')
    setFotos([null, null, null])
    setTara(2)
    setContenedor('TULA')
    setCodigoBarras('')
  }

  function handleSelectCategoria(id: string) {
    setMaterialId(id)
    setReferencia(null)
  }

  function handleQrScan(data: string) {
    const barcode = data.trim()
    const id = barcode.toLowerCase()

    if (CATEGORIA_MAP.has(id)) {
      setMaterialId(id)
      setReferencia(null)
      setCodigoBarras(barcode)
      return
    }

    const { codigo, resto } = extraerDeBarras(barcode)
    if (codigo) {
      for (const cat of CATEGORIAS) {
        const ref = cat.referencias.find(r => r.codigo === codigo)
        if (ref) {
          setMaterialId(cat.id)
          setReferencia(ref)
          setCodigoBarras(barcode)
          return
        }
      }
    }

    Alert.alert('Código no válido', `El código "${barcode}" no corresponde a ningún material o referencia`)
  }

  return (
    <View style={styles.wrapper}>
      {scaleReaderVisible ? (
        <ScaleReader
          onClose={() => setScaleReaderVisible(false)}
          onWeight={kg => { setPesoBruto(kg.toString()); setScaleReaderVisible(false) }}
        />
      ) : (
      <>
      {referencia && (
        <View style={styles.referenciaActive}>
          <View style={styles.referenciaActiveLeft}>
            <Text style={styles.referenciaActiveCode}>{referencia.codigo}</Text>
            <Text style={styles.referenciaActiveDesc}>{formatDescripcion(referencia.descripcion)}</Text>
          </View>
          <TouchableOpacity
            style={styles.referenciaActiveBtn}
            onPress={() => { setMaterialId(''); setReferencia(null); setCodigoBarras('') }}
          >
            <Text style={styles.referenciaActiveBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      {codigoBarras ? (
        <View style={styles.barcodeBadge}>
          <Text style={styles.barcodeBadgeText}>📱 {codigoBarras}</Text>
        </View>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      {sesion && (
        <View style={styles.sesionBar}>
          <Text style={styles.sesionBarText}>
            🟢 {sesion.nombre_operador} — {new Date(sesion.created_at).toLocaleDateString('es-MX')}
          </Text>
        </View>
      )}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <View style={styles.cardTitle}>
            <View style={styles.iconBox}>
              <Text style={styles.iconText}>🏗️</Text>
            </View>
            <Text style={styles.cardTitleText}>Seleccionar Material</Text>
          </View>
          <TouchableOpacity style={styles.qrBtn} onPress={() => setQrVisible(true)} activeOpacity={0.7}>
            <Text style={styles.qrBtnIcon}>📷</Text>
            <Text style={styles.qrBtnText}>QR</Text>
          </TouchableOpacity>
        </View>
        <MaterialGrid seleccionado={materialId} onSelect={handleSelectCategoria} />
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitle}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>🔎</Text>
          </View>
          <Text style={styles.cardTitleText}>Seleccionar Referencia</Text>
        </View>
        {categoriaActual ? (
          <ReferenciaSelector
            referencias={categoriaActual.referencias}
            seleccionada={referencia}
            onSelect={setReferencia}
          />
        ) : (
          <Text style={styles.hintText}>Seleccione una categoría primero</Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitle}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>📦</Text>
          </View>
          <Text style={styles.cardTitleText}>Tipo de Contenedor</Text>
        </View>
        <ContainerSelector tara={tara} onSelect={handleSelectContainer} />
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitle}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>⚖️</Text>
          </View>
          <Text style={styles.cardTitleText}>Registro de Peso</Text>
        </View>
        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Peso Bruto <Text style={{ color: COLORS.danger }}>*</Text></Text>
            <TouchableOpacity style={styles.scaleBtn} onPress={() => setScaleReaderVisible(true)} activeOpacity={0.7}>
              <Text style={styles.scaleBtnText}>📷 Leer báscula</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.input, styles.inputLarge]}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={pesoBruto}
              onChangeText={setPesoBruto}
              onFocus={() => scrollTo(580)}
            />
            <Text style={styles.suffix}>kg</Text>
          </View>
        </View>
        <WeightDisplay bruto={bruto} tara={tara} neto={neto} />
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitle}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>📷</Text>
          </View>
          <Text style={styles.cardTitleText}>Evidencia Fotográfica</Text>
        </View>
        <PhotoGrid
          fotos={fotos}
          onTakePhoto={handleTakePhoto}
          onRemovePhoto={handleRemovePhoto}
        />
      </View>

      <View style={styles.card}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Observaciones</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Notas adicionales sobre el material..."
            multiline
            numberOfLines={3}
            value={observaciones}
            onChangeText={setObservaciones}
            onFocus={() => scrollTo(840)}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, (!netoValido || saving) && styles.saveBtnDisabled]}
        onPress={handleGuardar}
        disabled={!netoValido || saving}
        activeOpacity={0.8}
      >
        <Text style={styles.saveBtnText}>
          {saving ? 'Guardando...' : '💾 Guardar Registro'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 120 }} />
    </ScrollView>
      </KeyboardAvoidingView>
      <QrScanner
        visible={qrVisible}
        onClose={() => setQrVisible(false)}
        onScan={handleQrScan}
      />
      </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 15,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 16,
    color: 'white',
  },
  cardTitleText: {
    fontSize: 17,
    fontWeight: '700',
  },
  formGroup: {
    marginBottom: 18,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontWeight: '600',
    fontSize: 14,
    color: COLORS.text,
  },
  scaleBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: SIZES.radiusSm,
  },
  scaleBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  inputWrapper: {
    position: 'relative',
  },
  input: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    padding: 14,
    fontSize: 16,
    backgroundColor: COLORS.card,
  },
  inputLarge: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 2,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  suffix: {
    position: 'absolute',
    right: 16,
    top: 14,
    color: COLORS.textLight,
    fontWeight: '600',
    fontSize: 18,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    marginTop: 5,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  hintText: {
    color: COLORS.textLight,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 30,
  },
  sesionBar: {
    backgroundColor: COLORS.primary,
    padding: 10,
    borderRadius: SIZES.radiusSm,
    marginBottom: 10,
  },
  sesionBarText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
  referenciaActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F4E79',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#15375A',
  },
  referenciaActiveLeft: {
    flex: 1,
  },
  referenciaActiveCode: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  referenciaActiveDesc: {
    color: '#B8D4F0',
    fontSize: 13,
    marginTop: 2,
  },
  referenciaActiveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  referenciaActiveBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: SIZES.radiusSm,
  },
  qrBtnIcon: {
    fontSize: 16,
  },
  qrBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  barcodeBadge: {
    backgroundColor: '#15375A',
    paddingVertical: 6,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#0F2A42',
  },
  barcodeBadgeText: {
    color: '#8BB8E0',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
})
