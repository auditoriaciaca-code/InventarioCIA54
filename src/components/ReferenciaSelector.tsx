import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { Referencia } from '../types'
import { COLORS, SIZES } from '../constants/theme'
import { formatDescripcion } from '../utils/format'

interface Props {
  referencias: Referencia[]
  seleccionada: Referencia | null
  onSelect: (ref: Referencia) => void
}

export default function ReferenciaSelector({ referencias, seleccionada, onSelect }: Props) {
  const [busqueda, setBusqueda] = useState('')

  const filtradas = busqueda
    ? referencias.filter(
        r =>
          r.codigo.includes(busqueda) ||
          r.descripcion.toLowerCase().includes(busqueda.toLowerCase())
      )
    : referencias

  return (
    <View>
      <View style={styles.searchWrapper}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por código o descripción..."
          placeholderTextColor={COLORS.textLight}
          value={busqueda}
          onChangeText={setBusqueda}
        />
        {busqueda ? (
          <TouchableOpacity style={styles.clearBtn} onPress={() => setBusqueda('')}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {seleccionada && seleccionada.codigo ? (
        <View style={styles.selectedBadge}>
          <Text style={styles.selectedText}>
            {seleccionada.codigo} - {formatDescripcion(seleccionada.descripcion)}
          </Text>
          <TouchableOpacity onPress={() => onSelect({ codigo: '', descripcion: '' })}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView style={styles.list} nestedScrollEnabled>
        <View style={styles.listContent}>
          {filtradas.length === 0 ? (
            <Text style={styles.emptyText}>
              {busqueda ? 'Sin resultados' : 'Selecciona una categoría primero'}
            </Text>
          ) : (
            filtradas.map(item => {
              const isSelected = seleccionada?.codigo === item.codigo
              return (
                <TouchableOpacity
                  key={item.codigo}
                  style={[styles.item, isSelected && styles.itemSelected]}
                  onPress={() => onSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemLeft}>
                    <Text style={styles.codigo}>{item.codigo}</Text>
                    <Text style={styles.descripcion} numberOfLines={2}>
                      {formatDescripcion(item.descripcion)}
                    </Text>
                  </View>
                  {isSelected && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              )
            })
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  searchWrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  searchInput: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    padding: 14,
    paddingRight: 40,
    fontSize: 15,
    backgroundColor: COLORS.bg,
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: SIZES.radius,
    marginBottom: 10,
  },
  selectedText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
  },
  list: {
    maxHeight: 300,
  },
  listContent: {
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.card,
  },
  itemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(26,95,42,0.05)',
  },
  itemLeft: {
    flex: 1,
  },
  codigo: {
    fontWeight: '800',
    fontSize: 14,
    color: COLORS.primary,
    marginBottom: 2,
  },
  descripcion: {
    fontSize: 13,
    color: COLORS.text,
  },
  check: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '700',
    marginLeft: 10,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textLight,
    paddingVertical: 30,
    fontSize: 14,
  },
})
