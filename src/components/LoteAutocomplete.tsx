import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { Lote } from '../types'
import { COLORS, SIZES } from '../constants/theme'

interface Props {
  sugerencias: Lote[]
  onSelect: (codigo: string) => void
}

export default function LoteAutocomplete({ sugerencias, onSelect }: Props) {
  if (sugerencias.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.emptyText}>Sin coincidencias en la lista cargada</Text>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
        {sugerencias.map(l => (
          <TouchableOpacity key={l.id} style={styles.item} onPress={() => onSelect(l.codigo)} activeOpacity={0.7}>
            <Text style={styles.itemIcon}>{l.estado === 'pesado' ? '✅' : '⏳'}</Text>
            <Text style={styles.itemCodigo}>{l.codigo}</Text>
            {l.estado === 'pesado' && <Text style={styles.itemHint}>ya pesado</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.bg,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 10,
    maxHeight: 200,
  },
  list: {
    maxHeight: 200,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemIcon: {
    fontSize: 13,
  },
  itemCodigo: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  itemHint: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  emptyText: {
    padding: 12,
    color: COLORS.textLight,
    fontSize: 13,
    textAlign: 'center',
  },
})
