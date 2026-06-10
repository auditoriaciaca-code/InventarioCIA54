import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { MATERIALES } from '../constants/materiales'
import { COLORS, SIZES } from '../constants/theme'

interface Props {
  seleccionado: string
  onSelect: (id: string) => void
}

export default function MaterialGrid({ seleccionado, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {MATERIALES.map(m => {
        const isSelected = m.id === seleccionado
        return (
          <TouchableOpacity
            key={m.id}
            style={[styles.btn, isSelected && styles.btnSelected]}
            onPress={() => onSelect(m.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.bar, { backgroundColor: m.color, opacity: isSelected ? 1 : 0 }]} />
            <Text style={styles.icon}>{m.icono}</Text>
            <Text style={styles.nombre}>{m.nombre}</Text>
            <Text style={styles.codigo}>{m.codigo}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  btn: {
    width: '48%',
    padding: 15,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    backgroundColor: COLORS.card,
    overflow: 'hidden',
    position: 'relative',
  },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  btnSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(26,95,42,0.05)',
  },
  icon: {
    fontSize: 28,
    marginBottom: 5,
  },
  nombre: {
    fontWeight: '700',
    fontSize: 14,
    color: COLORS.text,
  },
  codigo: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
  },
})
