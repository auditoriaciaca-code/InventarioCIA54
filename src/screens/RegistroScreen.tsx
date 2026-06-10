import { useState, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Alert, StyleSheet
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { v4 as uuidv4 } from 'uuid'
import MaterialGrid from '../components/MaterialGrid'
import ContainerSelector from '../components/ContainerSelector'
import WeightDisplay from '../components/WeightDisplay'
import PhotoGrid from '../components/PhotoGrid'
import { getDatabase } from '../services/database'
import { COLORS, SIZES } from '../constants/theme'

type FotoItem = { uri: string } | null

export default function RegistroScreen() {
  const [materialId, setMaterialId] = useState('cobre')
  const [tara, setTara] = useState(0.5)
  const [contenedor, setContenedor] = useState('Saco')
  const [pesoBruto, setPesoBruto] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [fotos, setFotos] = useState<FotoItem[]>([null, null, null])
  const [saving, setSaving] = useState(false)

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
      allowsEditing: true,
      aspect: [4, 3],
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
    if (!pesoBruto || bruto <= 0) {
      Alert.alert('Campo requerido', 'Por favor ingrese un peso bruto válido')
      return
    }
    if (neto < 0) {
      Alert.alert('Error', 'El peso neto no puede ser negativo')
      return
    }

    setSaving(true)
    try {
      const db = getDatabase()
      const id = uuidv4()
      const now = new Date().toISOString()
      const fotosValidas = fotos.filter(f => f !== null)

      await db.runAsync(
        `INSERT INTO inv_registros (id, material_id, contenedor, tara, peso_bruto, peso_neto, observaciones, fotos_count, created_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [id, materialId, contenedor, tara, bruto, neto, observaciones, fotosValidas.length, now]
      )

      for (let i = 0; i < fotosValidas.length; i++) {
        await db.runAsync(
          'INSERT INTO inv_fotos (id, registro_id, path_local, orden) VALUES (?, ?, ?, ?)',
          [uuidv4(), id, fotosValidas[i]!.uri, i]
        )
      }

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
    setMaterialId('cobre')
    setTara(0.5)
    setContenedor('Saco')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardTitle}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>🏗️</Text>
          </View>
          <Text style={styles.cardTitleText}>Seleccionar Material</Text>
        </View>
        <MaterialGrid seleccionado={materialId} onSelect={setMaterialId} />
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
          <Text style={styles.label}>Peso Bruto <Text style={{ color: COLORS.danger }}>*</Text></Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.input, styles.inputLarge]}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={pesoBruto}
              onChangeText={setPesoBruto}
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

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
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
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 15,
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
  label: {
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 8,
    color: COLORS.text,
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
})
