import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { ReferenciaFlat } from '../types'
import { COLORS } from '../constants/theme'
import { formatDescripcion } from '../utils/format'

interface Props {
  chips: ReferenciaFlat[]
  activo: ReferenciaFlat | null
  onSelectChip: (ref: ReferenciaFlat) => void
}

export default function ReferenciaChipsBar({ chips, activo, onSelectChip }: Props) {
  if (chips.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Escribe un material o código para empezar</Text>
      </View>
    )
  }

  return (
    <ScrollView
      horizontal
      style={styles.scroll}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {chips.map(c => {
        const isActive = activo?.codigo === c.codigo
        return (
          <TouchableOpacity
            key={c.codigo}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onSelectChip(c)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]} numberOfLines={1}>
              {c.icono} {c.codigo} · {formatDescripcion(c.descripcion)}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chip: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: 200,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
  },
  chipTextActive: {
    color: 'white',
  },
  emptyWrap: {
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 11,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
})
