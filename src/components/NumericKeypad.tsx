import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { COLORS, SIZES } from '../constants/theme'

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  submitLabel?: string
  submitDisabled?: boolean
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

export default function NumericKeypad({ value, onChange, onSubmit, submitLabel = 'Enviar', submitDisabled }: Props) {
  function presionar(tecla: string) {
    if (tecla === '⌫') {
      onChange(value.slice(0, -1))
      return
    }
    if (tecla === '.' && value.includes('.')) return
    if (value.length >= 8) return
    onChange(value + tecla)
  }

  return (
    <View style={styles.container}>
      <View style={styles.pantalla}>
        <Text style={styles.pantallaValor} numberOfLines={1}>{value || '0'}</Text>
        <Text style={styles.pantallaUnidad}>kg</Text>
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
      <TouchableOpacity
        style={[styles.enviarBtn, submitDisabled && styles.enviarBtnDisabled]}
        onPress={onSubmit}
        disabled={submitDisabled}
        activeOpacity={0.8}
      >
        <Text style={styles.enviarBtnText}>{submitLabel}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: COLORS.card,
  },
  pantalla: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    marginBottom: 10,
  },
  pantallaValor: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 1,
  },
  pantallaUnidad: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textLight,
    marginLeft: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tecla: {
    width: '31.5%',
    aspectRatio: 1.7,
    backgroundColor: COLORS.bg,
    borderRadius: SIZES.radius,
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
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  teclaBorrarTexto: {
    color: COLORS.danger,
  },
  enviarBtn: {
    marginTop: 10,
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  enviarBtnDisabled: {
    opacity: 0.4,
  },
  enviarBtnText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '800',
  },
})
