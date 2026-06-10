import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native'
import { useState } from 'react'
import { COLORS, SIZES } from '../constants/theme'

interface Props {
  tara: number
  onSelect: (tara: number, nombre: string) => void
}

export default function ContainerSelector({ tara, onSelect }: Props) {
  const [custom, setCustom] = useState(false)

  const opciones = [
    { id: 'saco', nombre: 'Saco', tara: 0.5, icono: '🛍️' },
    { id: 'cajon', nombre: 'Cajón', tara: 2.3, icono: '📦' },
    { id: 'otro', nombre: 'Otro', tara: 0, icono: '⚖️' },
  ]

  const selectedTara = custom ? 0 : tara

  function handlePress(op: typeof opciones[0]) {
    if (op.id === 'otro') {
      setCustom(true)
      onSelect(0, 'Personalizado')
    } else {
      setCustom(false)
      onSelect(op.tara, op.nombre)
    }
  }

  return (
    <View>
      <View style={styles.row}>
        {opciones.map(op => {
          const isSelected = !custom && tara === op.tara && op.tara > 0
          return (
            <TouchableOpacity
              key={op.id}
              style={[styles.btn, isSelected && styles.btnSelected]}
              onPress={() => handlePress(op)}
              activeOpacity={0.7}
            >
              <Text style={styles.icon}>{op.icono}</Text>
              <Text style={styles.nombre}>{op.nombre}</Text>
              <Text style={styles.taraText}>
                {op.id === 'otro' ? 'Personalizado' : `Tara: ${op.tara} kg`}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
      {custom && (
        <View style={styles.customRow}>
          <Text style={styles.label}>Tara personalizada (kg)</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              keyboardType="decimal-pad"
              onChangeText={val => onSelect(parseFloat(val) || 0, 'Personalizado')}
            />
            <Text style={styles.suffix}>kg</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    padding: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  btnSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(26,95,42,0.05)',
  },
  icon: {
    fontSize: 24,
    marginBottom: 4,
  },
  nombre: {
    fontWeight: '600',
    fontSize: 13,
  },
  taraText: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
  },
  customRow: {
    marginTop: 10,
  },
  label: {
    fontWeight: '600',
    fontSize: 13,
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
  },
  suffix: {
    position: 'absolute',
    right: 16,
    top: 14,
    color: COLORS.textLight,
    fontWeight: '600',
  },
})
