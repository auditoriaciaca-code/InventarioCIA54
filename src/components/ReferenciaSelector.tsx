import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { Referencia } from '../types'
import { COLORS, SIZES } from '../constants/theme'
import { formatDescripcion } from '../utils/format'
import { crearMaterialOtroLocal } from '../services/sync'

interface Props {
  referencias: Referencia[]
  seleccionada: Referencia | null
  onSelect: (ref: Referencia) => void
  categoriaId?: string
  creadoPor?: string
}

export default function ReferenciaSelector({ referencias, seleccionada, onSelect, categoriaId, creadoPor }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [creandoNuevo, setCreandoNuevo] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [creando, setCreando] = useState(false)
  const esOtros = categoriaId === 'otros'

  async function handleCrearNuevo() {
    const nombre = nombreNuevo.trim()
    if (!nombre || creando) return
    setCreando(true)
    try {
      const ref = await crearMaterialOtroLocal(nombre, creadoPor || '')
      setNombreNuevo('')
      setCreandoNuevo(false)
      onSelect(ref)
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo crear el material')
    } finally {
      setCreando(false)
    }
  }

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
            {esOtros ? formatDescripcion(seleccionada.descripcion) : `${seleccionada.codigo} - ${formatDescripcion(seleccionada.descripcion)}`}
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
              {busqueda ? 'Sin resultados' : esOtros ? 'Todavía no hay nada aquí — crea el primero abajo' : 'Selecciona una categoría primero'}
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
                    {!esOtros && <Text style={styles.codigo}>{item.codigo}</Text>}
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

      {esOtros && (
        creandoNuevo ? (
          <View style={styles.crearNuevoRow}>
            <TextInput
              style={styles.crearNuevoInput}
              placeholder="Nombre del material (ej. Bastidores)..."
              placeholderTextColor={COLORS.textLight}
              value={nombreNuevo}
              onChangeText={setNombreNuevo}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.crearNuevoBtn, (!nombreNuevo.trim() || creando) && styles.crearNuevoBtnDisabled]}
              onPress={handleCrearNuevo}
              disabled={!nombreNuevo.trim() || creando}
            >
              <Text style={styles.crearNuevoBtnText}>{creando ? '...' : 'Crear'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.crearNuevoToggle} onPress={() => setCreandoNuevo(true)} activeOpacity={0.7}>
            <Text style={styles.crearNuevoToggleText}>➕ Crear material nuevo</Text>
          </TouchableOpacity>
        )
      )}
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
  crearNuevoToggle: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: SIZES.radius,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  crearNuevoToggleText: {
    fontWeight: '700',
    fontSize: 14,
    color: COLORS.primary,
  },
  crearNuevoRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  crearNuevoInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: SIZES.radiusSm,
    padding: 10,
    fontSize: 14,
    backgroundColor: COLORS.card,
    color: COLORS.text,
  },
  crearNuevoBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crearNuevoBtnDisabled: {
    opacity: 0.5,
  },
  crearNuevoBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 13,
  },
})
