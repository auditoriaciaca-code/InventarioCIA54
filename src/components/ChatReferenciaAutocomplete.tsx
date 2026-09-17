import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { ReferenciaFlat } from '../types'
import { buscarReferencias } from '../utils/referenciaSearch'
import { COLORS, SIZES } from '../constants/theme'
import { formatDescripcion } from '../utils/format'

interface Props {
  query: string
  onSelect: (ref: ReferenciaFlat) => void
}

export default function ChatReferenciaAutocomplete({ query, onSelect }: Props) {
  const resultados = buscarReferencias(query, 8)

  return (
    <View style={styles.wrap}>
      {resultados.length === 0 ? (
        <Text style={styles.emptyText}>Sin coincidencias</Text>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
          {resultados.map(r => (
            <TouchableOpacity key={r.codigo} style={styles.item} onPress={() => onSelect(r)} activeOpacity={0.7}>
              <Text style={styles.itemIcon}>{r.icono}</Text>
              <View style={styles.itemBody}>
                <Text style={styles.itemCodigo}>{r.codigo} · {r.categoriaNombre}</Text>
                <Text style={styles.itemDesc} numberOfLines={2}>{formatDescripcion(r.descripcion)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: '100%',
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 6,
    maxHeight: 260,
    elevation: 6,
  },
  list: {
    maxHeight: 260,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemIcon: {
    fontSize: 20,
  },
  itemBody: {
    flex: 1,
  },
  itemCodigo: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  itemDesc: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 2,
  },
  emptyText: {
    padding: 12,
    color: COLORS.textLight,
    fontSize: 13,
    textAlign: 'center',
  },
})
