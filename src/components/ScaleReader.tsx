import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { COLORS, SIZES } from '../constants/theme'

interface Props {
  onClose: () => void
  onWeight: (kg: number) => void
}

type Step = 'guide' | 'camera' | 'processing' | 'result' | 'error'

export default function ScaleReader({ onClose, onWeight }: Props) {
  const [step, setStep] = useState<Step>('guide')
  const [errorMsg, setErrorMsg] = useState('')
  const [pesoEditado, setPesoEditado] = useState('')

  async function handleStart() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      setErrorMsg('Permiso de cámara denegado'); setStep('error')
      return
    }
    setStep('camera')
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        mediaTypes: ['images'],
      })
      if (result.canceled) { setStep('guide'); return }

      setStep('processing')
      let uri = result.assets[0].uri
      const w = result.assets[0].width
      const h = result.assets[0].height

      // Recortar centro 60% + redimensionar a 600px
      try {
        const cw = Math.round(w * 0.6)
        const ch = Math.round(h * 0.6)
        const ox = Math.round((w - cw) / 2)
        const oy = Math.round((h - ch) / 2)
        const proc = await manipulateAsync(uri, [
          { crop: { originX: ox, originY: oy, width: cw, height: ch } },
          { resize: { width: 600 } },
        ], { format: SaveFormat.JPEG, compress: 0.8 })
        if (proc?.uri) uri = proc.uri
      } catch {}

      const body = new FormData()
      body.append('file', { uri, type: 'image/jpeg', name: 'scale.jpg' } as any)
      body.append('apikey', 'K81864006288957')
      body.append('language', 'eng')
      body.append('OCREngine', '2')
      body.append('scale', 'true')

      const resp = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body,
      })
      const data = await resp.json()
      const text = data?.ParsedResults?.[0]?.ParsedText || ''
      const peso = extraerPeso(text)
      if (peso > 0) {
        setPesoEditado(peso.toString())
        setStep('result')
      } else {
        setErrorMsg('No se detectó el peso. Intenta de nuevo.')
        setStep('error')
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error al procesar')
      setStep('error')
    }
  }

  function handleConfirm() {
    const kg = parseFloat(pesoEditado)
    if (!isNaN(kg) && kg > 0) {
      onWeight(Math.round(kg * 100) / 100)
      onClose()
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Lector de Báscula</Text>
        <TouchableOpacity onPress={onClose}><Text style={styles.topClose}>✕</Text></TouchableOpacity>
      </View>

      <View style={styles.body}>
        {step === 'guide' && (
          <>
            <Text style={styles.icon}>⚖️</Text>
            <View style={styles.frameGuide}>
              <View style={styles.frameCornerTL} />
              <View style={styles.frameCornerTR} />
              <View style={styles.frameCornerBL} />
              <View style={styles.frameCornerBR} />
              <Text style={styles.frameText}>Display LED</Text>
            </View>
            <Text style={styles.desc}>
              Toma una foto clara del display de la báscula.{'\n'}
              Procura centrar los números rojos en el recuadro.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={handleStart} activeOpacity={0.7}>
              <Text style={styles.btnText}>📷 Tomar Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ marginTop: 15 }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Cancelar</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'camera' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2ecc71" />
            <Text style={styles.processText}>Abre la cámara...</Text>
          </View>
        )}

        {step === 'processing' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2ecc71" />
            <Text style={styles.processText}>Reconociendo peso...</Text>
          </View>
        )}

        {step === 'result' && (
          <>
            <Text style={styles.icon}>⚖️</Text>
            <Text style={styles.resultLabel}>Peso reconocido:</Text>
            <View style={styles.resultBox}>
              <TextInput
                style={styles.resultInput}
                value={pesoEditado}
                onChangeText={setPesoEditado}
                keyboardType="decimal-pad"
                selectTextOnFocus
                autoFocus
              />
              <Text style={styles.resultUnit}>kg</Text>
            </View>
            <Text style={styles.resultHint}>Corrige si es necesario y confirma</Text>
            <View style={styles.resultBtns}>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleConfirm} activeOpacity={0.7}>
                <Text style={styles.btnText}>✅ Confirmar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnRetry} onPress={() => setStep('guide')} activeOpacity={0.7}>
                <Text style={styles.btnRetryText}>🔄 Repetir</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 'error' && (
          <>
            <Text style={{ fontSize: 48, marginBottom: 15 }}>⚠️</Text>
            <Text style={{ color: '#e74c3c', fontSize: 14, textAlign: 'center', marginBottom: 20, paddingHorizontal: 20 }}>{errorMsg}</Text>
            <TouchableOpacity style={styles.btn} onPress={handleStart} activeOpacity={0.7}>
              <Text style={styles.btnText}>Reintentar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ marginTop: 15 }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Cancelar</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

function extraerPeso(text: string): number {
  const LABELS = ['gross','net','hold','total','hi','ok','kg','lb','g','t','stable','zero','center','tare','piece','count','weight','cap','set','function','mode','unit','print','m+','mr','mc','power','on','off']
  const tokens = text.split(/[\s\n\r]+/).filter(t => t.trim())
  for (const t of tokens) {
    if (LABELS.includes(t.toLowerCase().trim())) continue
    const limpio = t.replace(/[^0-9.]/g, '')
    if (!limpio || limpio === '.') continue
    if (limpio.split('.').length > 2) continue
    const n = parseFloat(limpio)
    if (!isNaN(n) && n > 0 && n < 9999) return n
  }
  const grupos = text.match(/\d{1,4}/g)
  if (grupos) {
    grupos.sort((a, b) => b.length - a.length || parseInt(b) - parseInt(a))
    const n = parseInt(grupos[0], 10)
    if (n > 0 && n < 9999) return n
  }
  return 0
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  topBar: { position: 'absolute', top: 50, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  topClose: { color: '#fff', fontSize: 22, fontWeight: '700', width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 36, overflow: 'hidden' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  center: { alignItems: 'center' },
  icon: { fontSize: 64, marginBottom: 20 },
  frameGuide: { width: 220, height: 100, borderWidth: 2, borderColor: '#2ecc71', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 20, position: 'relative' },
  frameCornerTL: { position: 'absolute', top: -2, left: -2, width: 20, height: 20, borderTopWidth: 4, borderLeftWidth: 4, borderColor: '#2ecc71' },
  frameCornerTR: { position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderTopWidth: 4, borderRightWidth: 4, borderColor: '#2ecc71' },
  frameCornerBL: { position: 'absolute', bottom: -2, left: -2, width: 20, height: 20, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: '#2ecc71' },
  frameCornerBR: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderBottomWidth: 4, borderRightWidth: 4, borderColor: '#2ecc71' },
  frameText: { color: '#2ecc71', fontSize: 12, fontWeight: '600', letterSpacing: 2 },
  desc: { color: '#ccc', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 25 },
  btn: { backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 30, borderRadius: SIZES.radius },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  processText: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 20, textAlign: 'center' },
  resultLabel: { color: '#ccc', fontSize: 15, marginBottom: 10 },
  resultBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  resultInput: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, fontSize: 32, fontWeight: '800', color: '#000', width: 160, textAlign: 'center' },
  resultUnit: { color: '#fff', fontSize: 20, fontWeight: '700', marginLeft: 8 },
  resultHint: { color: '#888', fontSize: 13, marginBottom: 20 },
  resultBtns: { flexDirection: 'row', gap: 12 },
  btnConfirm: { backgroundColor: '#2ecc71', paddingVertical: 14, paddingHorizontal: 24, borderRadius: SIZES.radius },
  btnRetry: { backgroundColor: 'transparent', paddingVertical: 14, paddingHorizontal: 24, borderRadius: SIZES.radius, borderWidth: 1, borderColor: '#555' },
  btnRetryText: { color: '#ccc', fontWeight: '700', fontSize: 16 },
})
