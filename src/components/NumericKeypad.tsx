import { forwardRef, useImperativeHandle, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native'
import { COLORS, SIZES } from '../constants/theme'

export interface NumericKeypadHandle {
  setValor: (v: string) => void
}

interface Props {
  onSubmit: (pesoBruto: number) => boolean | void | Promise<boolean | void>
  disabled?: boolean
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

// Alto de tecla calculado a mano (no con aspectRatio): en Android, aspectRatio
// combinado con ancho en % dentro de un contenedor con flexWrap a veces no
// coincide entre lo que Yoga mide y lo que realmente se pinta en pantalla,
// dejando hueco debajo de las teclas. Un alto fijo en px no tiene esa ambigüedad.
const CONTAINER_PADDING = 6
const GRID_GAP = 6
const COLS = 3
const { width: screenWidth } = Dimensions.get('window')
const TECLA_ANCHO = (screenWidth - CONTAINER_PADDING * 2 - GRID_GAP * (COLS - 1)) / COLS
const TECLA_ALTO = TECLA_ANCHO / 2.3

// El valor tecleado vive aquí adentro (no en la pantalla completa de Rápido)
// para que cada tecla solo vuelva a dibujar este teclado y no todo el chat.
const NumericKeypad = forwardRef<NumericKeypadHandle, Props>(function NumericKeypad(
  { onSubmit, disabled },
  ref
) {
  const [value, setValue] = useState('')

  useImperativeHandle(ref, () => ({
    setValor: (v: string) => setValue(v),
  }))

  function presionar(tecla: string) {
    if (tecla === '⌫') {
      setValue(v => v.slice(0, -1))
      return
    }
    if (tecla === '.' && value.includes('.')) return
    if (value.length >= 8) return
    setValue(v => v + tecla)
  }

  async function handleSubmit() {
    const n = parseFloat(value)
    if (!(n > 0)) return
    const limpiar = await onSubmit(n)
    if (limpiar !== false) setValue('')
  }

  const submitDisabled = disabled || !(parseFloat(value) > 0)

  return (
    <View style={styles.container}>
      <View style={styles.pantallaRow}>
        <View style={styles.pantalla}>
          <Text style={styles.pantallaValor} numberOfLines={1}>{value || '0'}</Text>
          <Text style={styles.pantallaUnidad}>kg</Text>
        </View>
        <TouchableOpacity
          style={[styles.enviarBtn, submitDisabled && styles.enviarBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitDisabled}
          activeOpacity={0.8}
        >
          <Text style={styles.enviarBtnIcon}>➤</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        {TECLAS.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tecla, t === '⌫' && styles.teclaBorrar]}
            onPress={() => presionar(t)}
            activeOpacity={0.6}
          >
            <Text style={[styles.teclaTexto, t === '⌫' && styles.teclaBorrarTexto]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
})

export default NumericKeypad

const styles = StyleSheet.create({
  container: {
    padding: 6,
    backgroundColor: COLORS.card,
  },
  pantallaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    marginBottom: 6,
  },
  pantalla: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 6,
  },
  pantallaValor: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 1,
  },
  pantallaUnidad: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textLight,
    marginLeft: 5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tecla: {
    width: TECLA_ANCHO,
    height: TECLA_ALTO,
    backgroundColor: COLORS.bg,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teclaBorrar: {
    backgroundColor: 'rgba(231,76,60,0.08)',
    borderColor: 'rgba(231,76,60,0.3)',
  },
  teclaTexto: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  teclaBorrarTexto: {
    color: COLORS.danger,
  },
  enviarBtn: {
    width: 60,
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enviarBtnDisabled: {
    opacity: 0.4,
  },
  enviarBtnIcon: {
    color: 'white',
    fontSize: 26,
    fontWeight: '800',
  },
})
