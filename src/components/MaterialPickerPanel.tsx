import { useMemo, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { CATEGORIAS, CATEGORIA_MAP } from '../constants/materiales'
import { ReferenciaFlat } from '../types'
import { COLORS, SIZES } from '../constants/theme'
import { formatDescripcion } from '../utils/format'

interface Props {
  recientes: ReferenciaFlat[]
  activo: ReferenciaFlat | null
  onSelect: (ref: ReferenciaFlat) => void
}

const MAX_RESULTADOS_BUSQUEDA = 40

export default function MaterialPickerPanel({ recientes, activo, onSelect }: Props) {
  const [categoriaId, setCategoriaId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const categoria = CATEGORIA_MAP.get(categoriaId)

  const resultadosBusqueda = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    const out: ReferenciaFlat[] = []
    for (const cat of CATEGORIAS) {
      for (const ref of cat.referencias) {
        if (ref.codigo.toLowerCase().includes(q) || ref.descripcion.toLowerCase().includes(q)) {
          out.push({
            categoriaId: cat.id,
            categoriaNombre: cat.nombre,
            icono: cat.icono,
            color: cat.color,
            codigo: ref.codigo,
            descripcion: ref.descripcion,
          })
          if (out.length >= MAX_RESULTADOS_BUSQUEDA) return out
        }
      }
    }
    return out
  }, [busqueda])

  const buscando = busqueda.trim().length > 0

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>🔀 Elegir material</Text>

      <View style={styles.buscadorWrap}>
        <TextInput
          style={styles.buscadorInput}
          placeholder="Buscar por código o nombre..."
          placeholderTextColor={COLORS.textLight}
          value={busqueda}
          onChangeText={setBusqueda}
        />
        {buscando && (
          <TouchableOpacity style={styles.buscadorClear} onPress={() => setBusqueda('')}>
            <Text style={styles.buscadorClearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {buscando ? (
        <View style={styles.seccion}>
          {resultadosBusqueda.length === 0 ? (
            <Text style={styles.sinResultados}>Sin resultados para "{busqueda}"</Text>
          ) : (
            resultadosBusqueda.map(ref => {
              const esActivo = activo?.codigo === ref.codigo
              return (
                <TouchableOpacity
                  key={`${ref.categoriaId}-${ref.codigo}`}
                  style={[styles.resultadoRow, esActivo && styles.resultadoRowActiva]}
                  onPress={() => onSelect(ref)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resultadoIcono}>{ref.icono}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultadoCodigo, esActivo && styles.resultadoCodigoActivo]}>{ref.codigo}</Text>
                    <Text style={styles.resultadoDesc} numberOfLines={1}>{formatDescripcion(ref.descripcion)}</Text>
                  </View>
                </TouchableOpacity>
              )
            })
          )}
        </View>
      ) : (
        <>
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
            <View style={styles.categoriaLista}>
              {CATEGORIAS.map(c => {
                const activa = c.id === categoriaId
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.categoriaRow, activa && styles.categoriaRowActiva]}
                    onPress={() => setCategoriaId(activa ? '' : c.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoriaRowIcono}>{c.icono}</Text>
                    <Text style={[styles.categoriaRowNombre, activa && styles.categoriaRowNombreActiva]}>{c.nombre}</Text>
                    <Text style={styles.categoriaRowFlecha}>{activa ? '▾' : '▸'}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
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
        </>
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
    marginBottom: 12,
  },
  buscadorWrap: {
    position: 'relative',
    marginBottom: 16,
  },
  buscadorInput: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    padding: 12,
    paddingRight: 36,
    fontSize: 14,
    backgroundColor: COLORS.card,
    color: COLORS.text,
  },
  buscadorClear: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buscadorClearText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  sinResultados: {
    textAlign: 'center',
    color: COLORS.textLight,
    paddingVertical: 20,
    fontSize: 13,
  },
  resultadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resultadoRowActiva: {
    backgroundColor: 'rgba(26,95,42,0.06)',
    borderRadius: SIZES.radiusSm,
  },
  resultadoIcono: {
    fontSize: 20,
  },
  resultadoCodigo: {
    fontWeight: '800',
    fontSize: 14,
    color: COLORS.primary,
  },
  resultadoCodigoActivo: {
    color: COLORS.primary,
  },
  resultadoDesc: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 1,
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
  categoriaLista: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
  },
  categoriaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  categoriaRowActiva: {
    backgroundColor: 'rgba(26,95,42,0.06)',
  },
  categoriaRowIcono: {
    fontSize: 20,
  },
  categoriaRowNombre: {
    flex: 1,
    fontWeight: '700',
    fontSize: 14,
    color: COLORS.text,
  },
  categoriaRowNombreActiva: {
    color: COLORS.primary,
  },
  categoriaRowFlecha: {
    fontSize: 13,
    color: COLORS.textLight,
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
