import { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import MaterialGrid from './MaterialGrid'
import { CATEGORIA_MAP } from '../constants/materiales'
import { ReferenciaFlat } from '../types'
import { COLORS, SIZES } from '../constants/theme'
import { formatDescripcion } from '../utils/format'

interface Props {
  recientes: ReferenciaFlat[]
  activo: ReferenciaFlat | null
  onSelect: (ref: ReferenciaFlat) => void
}

export default function MaterialPickerPanel({ recientes, activo, onSelect }: Props) {
  const [categoriaId, setCategoriaId] = useState('')
  const categoria = CATEGORIA_MAP.get(categoriaId)

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>🔀 Elegir material</Text>

      {recientes.length > 0 && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Recientes de hoy</Text>
          <View style={styles.chipsWrap}>
            {recientes.map(r => {
              const esActivo = activo?.codigo === r.codigo
              return (
                <TouchableOpacity
                  key={r.codigo}
                  style={[styles.chip, esActivo && styles.chipActivo]}
                  onPress={() => onSelect(r)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipTexto, esActivo && styles.chipTextoActivo]} numberOfLines={1}>
                    {r.icono} {r.codigo} · {formatDescripcion(r.descripcion)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Categorías</Text>
        <MaterialGrid seleccionado={categoriaId} onSelect={setCategoriaId} />
      </View>

      {categoria && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>{categoria.icono} {categoria.nombre}</Text>
          <View style={styles.refGrid}>
            {categoria.referencias.map(ref => {
              const esActivo = activo?.codigo === ref.codigo
              return (
                <TouchableOpacity
                  key={ref.codigo}
                  style={[styles.refCard, esActivo && styles.refCardActivo]}
                  onPress={() => onSelect({
                    categoriaId: categoria.id,
                    categoriaNombre: categoria.nombre,
                    icono: categoria.icono,
                    color: categoria.color,
                    codigo: ref.codigo,
                    descripcion: ref.descripcion,
                  })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.refCodigo, esActivo && styles.refCodigoActivo]}>{ref.codigo}</Text>
                  <Text style={styles.refDesc} numberOfLines={2}>{formatDescripcion(ref.descripcion)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 15,
  },
  titulo: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 15,
  },
  seccion: {
    marginBottom: 20,
  },
  seccionTitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: '100%',
  },
  chipActivo: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipTexto: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  chipTextoActivo: {
    color: 'white',
  },
  refGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  refCard: {
    width: '48%',
    padding: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.card,
  },
  refCardActivo: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(26,95,42,0.06)',
  },
  refCodigo: {
    fontWeight: '800',
    fontSize: 14,
    color: COLORS.primary,
    marginBottom: 2,
  },
  refCodigoActivo: {
    color: COLORS.primary,
  },
  refDesc: {
    fontSize: 12,
    color: COLORS.text,
  },
})
