import { View, Text, StyleSheet } from 'react-native'
import { COLORS } from '../constants/theme'

interface Props {
  bruto: number
  tara: number
  neto: number
  usarTara?: boolean
}

export default function WeightDisplay({ bruto, tara, neto, usarTara = true }: Props) {
  const isNegative = neto < 0
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Peso Neto Calculado</Text>
      <Text style={[styles.value, isNegative && { color: COLORS.danger }]}>
        {isNegative ? '0.00' : neto.toFixed(2)}
      </Text>
      <Text style={styles.unit}>kg</Text>
      {usarTara && (
        <View style={styles.breakdown}>
          <View style={styles.item}>
            <Text style={styles.breakLabel}>Bruto</Text>
            <Text style={styles.breakValue}>{bruto.toFixed(2)}</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.breakLabel}>Tara</Text>
            <Text style={[styles.breakValue, { color: COLORS.danger }]}>-{tara.toFixed(2)}</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.breakLabel}>Neto</Text>
            <Text style={[styles.breakValue, isNegative && { color: COLORS.danger }]}>
              {isNegative ? '0.00' : neto.toFixed(2)}
            </Text>
          </View>
        </View>
      )}
      {isNegative && (
        <View style={styles.alert}>
          <Text style={styles.alertText}>⚠️ El peso neto es negativo. Verifique los datos.</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 25,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  label: {
    fontSize: 13,
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  value: {
    fontSize: 48,
    fontWeight: '800',
    color: COLORS.primary,
    lineHeight: 48,
  },
  unit: {
    fontSize: 18,
    color: COLORS.textLight,
    fontWeight: '600',
    marginTop: 4,
  },
  breakdown: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  item: {
    alignItems: 'center',
  },
  breakLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  breakValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  alert: {
    marginTop: 15,
    padding: 12,
    backgroundColor: 'rgba(230,126,34,0.1)',
    borderRadius: 10,
  },
  alertText: {
    color: COLORS.warning,
    fontWeight: '600',
    fontSize: 13,
  },
})
