import { useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, Alert, Modal, TextInput, ScrollView, StyleSheet } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { RegistroPesada, Foto, Referencia } from '../types'
import { CATEGORIA_MAP, MATERIAL_MAP } from '../constants/materiales'
import InventoryItem from '../components/InventoryItem'
import PhotoViewer from '../components/PhotoViewer'
import MaterialGrid from '../components/MaterialGrid'
import ReferenciaSelector from '../components/ReferenciaSelector'
import { getDatabase } from '../services/database'
import { COLORS, SIZES } from '../constants/theme'
import { sincronizar } from '../services/sync'
import { useSesion } from '../context/SesionContext'

export default function InventarioScreen() {
  const { sesion } = useSesion()
  const [registros, setRegistros] = useState<RegistroPesada[]>([])
  const [filtro, setFiltro] = useState<string | null>(null)
  const [busquedaPeso, setBusquedaPeso] = useState('')
  const [totalNeto, setTotalNeto] = useState(0)
  const [fotosVisible, setFotosVisible] = useState(false)
  const [fotosActuales, setFotosActuales] = useState<Foto[]>([])
  const [editando, setEditando] = useState<RegistroPesada | null>(null)
  const [editPesoBruto, setEditPesoBruto] = useState('')
  const [editTara, setEditTara] = useState('')
  const [editContenedor, setEditContenedor] = useState('')
  const [editObservaciones, setEditObservaciones] = useState('')
  const [editMaterialId, setEditMaterialId] = useState('')
  const [editReferencia, setEditReferencia] = useState<Referencia | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (sesion) cargarRegistros()
    }, [sesion])
  )

  async function cargarRegistros() {
    try {
      const db = getDatabase()
      const rows = await db.getAllAsync<RegistroPesada>(
        'SELECT * FROM inv_registros WHERE sesion_id = ? ORDER BY created_at DESC',
        [sesion?.id || '']
      )
      setRegistros(rows)
      const total = rows.reduce((sum, r) => sum + r.peso_neto, 0)
      setTotalNeto(total)
    } catch (error) {
      console.error(error)
    }
  }

  const registrosFiltrados = registros.filter(r => {
    if (filtro && r.material_id !== filtro) return false
    if (busquedaPeso.trim()) {
      const num = busquedaPeso.trim().replace(',', '.')
      const pesos = [r.peso_bruto, r.tara, r.peso_neto].map(p => p.toString())
      if (!pesos.some(p => p.includes(num))) return false
    }
    return true
  })

  const materialesUnicos = Array.from(new Set(registros.map(r => r.material_id)))
    .map(id => MATERIAL_MAP.get(id))
    .filter(Boolean)

  const totalFiltrado = registrosFiltrados.reduce((sum, r) => sum + r.peso_neto, 0)

  function handleEdit(id: string) {
    const reg = registros.find(r => r.id === id)
    if (!reg) return
    setEditando(reg)
    setEditPesoBruto(reg.peso_bruto.toString())
    setEditTara(reg.tara.toString())
    setEditContenedor(reg.contenedor)
    setEditObservaciones(reg.observaciones)
    setEditMaterialId(reg.material_id)
    setEditReferencia(reg.referencia_codigo ? { codigo: reg.referencia_codigo, descripcion: reg.referencia_descripcion } : null)
  }

  async function handleSaveEdit() {
    if (!editando) return
    const pb = parseFloat(editPesoBruto)
    const t = parseFloat(editTara)
    if (isNaN(pb) || pb <= 0) { Alert.alert('Error', 'Peso bruto inválido'); return }
    if (isNaN(t) || t < 0) { Alert.alert('Error', 'Tara inválida'); return }
    try {
      const db = getDatabase()
      await db.runAsync(
        'UPDATE inv_registros SET material_id = ?, referencia_codigo = ?, referencia_descripcion = ?, peso_bruto = ?, tara = ?, contenedor = ?, observaciones = ?, peso_neto = ?, synced = 0 WHERE id = ?',
        [editMaterialId, editReferencia?.codigo || '', editReferencia?.descripcion || '', pb, t, editContenedor, editObservaciones, pb - t, editando.id]
      )
      setEditando(null)
      cargarRegistros()
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar')
    }
  }

  async function handleViewPhotos(id: string) {
    const reg = registros.find(r => r.id === id)
    if (!reg || reg.fotos_count === 0) {
      Alert.alert('Sin fotos', 'Este registro no tiene fotos')
      return
    }
    try {
      const db = getDatabase()
      const fotos = await db.getAllAsync<Foto>(
        'SELECT * FROM inv_fotos WHERE registro_id = ? ORDER BY orden ASC',
        [id]
      )
      setFotosActuales(fotos)
      setFotosVisible(true)
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron cargar las fotos')
    }
  }

  function handleDelete(id: string) {
    Alert.alert(
      '¿Eliminar Registro?',
      'Esta acción no se puede deshacer',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = getDatabase()
              await db.runAsync('DELETE FROM inv_fotos WHERE registro_id = ?', [id])
              await db.runAsync('DELETE FROM inv_registros WHERE id = ?', [id])
              cargarRegistros()
            } catch (error: any) {
              Alert.alert('Error', error?.message)
            }
          },
        },
      ]
    )
  }

  async function handleSync() {
    const result = await sincronizar()
    if (result.ok) {
      Alert.alert('Sincronizado', result.mensaje)
    } else {
      Alert.alert('Error de sincronización', result.mensaje)
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={registrosFiltrados}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle}>Inventario del Día</Text>
                <TouchableOpacity onPress={handleSync}>
                  <Text style={styles.syncBtn}>🔄 Sincronizar</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.summaryTotal}>
                <Text style={styles.summaryLabel}>Total Neto Acumulado</Text>
                <Text style={styles.summaryValue}>
                  {totalFiltrado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} kg
                </Text>
              </View>
              <View style={styles.breakdown}>
                {materialesUnicos.map(m => {
                  const totalMat = registros
                    .filter(r => r.material_id === m!.id)
                    .reduce((s, r) => s + r.peso_neto, 0)
                  const cant = registros.filter(r => r.material_id === m!.id).length
                  return (
                    <View key={m!.id} style={styles.breakItem}>
                      <Text style={styles.breakMat}>{m!.icono} {m!.nombre}</Text>
                      <Text style={styles.breakWeight}>{totalMat.toFixed(2)} kg</Text>
                      <Text style={styles.breakCount}>{cant} registro(s)</Text>
                    </View>
                  )
                })}
                {materialesUnicos.length === 0 && (
                  <Text style={styles.emptyText}>Sin registros hoy</Text>
                )}
              </View>
            </View>

            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterChip, !filtro && styles.filterChipActive]}
                onPress={() => setFiltro(null)}
              >
                <Text style={[styles.filterText, !filtro && styles.filterTextActive]}>
                  Todos
                </Text>
              </TouchableOpacity>
              {materialesUnicos.map(m => (
                <TouchableOpacity
                  key={m!.id}
                  style={[styles.filterChip, filtro === m!.id && styles.filterChipActive]}
                  onPress={() => setFiltro(m!.id)}
                >
                  <Text style={[styles.filterText, filtro === m!.id && styles.filterTextActive]}>
                    {m!.icono} {m!.nombre}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.searchRow}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por peso (kg)..."
                placeholderTextColor={COLORS.textLight}
                value={busquedaPeso}
                onChangeText={setBusquedaPeso}
                keyboardType="decimal-pad"
              />
              {busquedaPeso.length > 0 && (
                <TouchableOpacity onPress={() => setBusquedaPeso('')} style={styles.searchClear}>
                  <Text style={styles.searchClearText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Sin registros</Text>
            <Text style={styles.emptyDesc}>Registra tu primera pesada</Text>
          </View>
        }
        renderItem={({ item }) => (
          <InventoryItem
            item={item}
            onEdit={handleEdit}
            onViewPhotos={handleViewPhotos}
            onDelete={handleDelete}
          />
        )}
      />
      <PhotoViewer
        visible={fotosVisible}
        fotos={fotosActuales}
        onClose={() => setFotosVisible(false)}
      />

      <Modal visible={!!editando} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>✏️ Editar Registro</Text>

            {editando && (
              <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
                <MaterialGrid seleccionado={editMaterialId} onSelect={setEditMaterialId} />
                {editMaterialId && (
                  <View style={styles.modalRefSection}>
                    <ReferenciaSelector
                      referencias={CATEGORIA_MAP.get(editMaterialId)?.referencias || []}
                      seleccionada={editReferencia}
                      onSelect={setEditReferencia}
                    />
                  </View>
                )}

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Peso Bruto (kg) *</Text>
                  <TextInput style={styles.input} value={editPesoBruto} onChangeText={setEditPesoBruto} keyboardType="decimal-pad" />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Tara (kg) *</Text>
                  <TextInput style={styles.input} value={editTara} onChangeText={setEditTara} keyboardType="decimal-pad" />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Contenedor</Text>
                  <TextInput style={styles.input} value={editContenedor} onChangeText={setEditContenedor} />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Observaciones</Text>
                  <TextInput style={[styles.input, styles.textArea]} value={editObservaciones} onChangeText={setEditObservaciones} multiline numberOfLines={2} />
                </View>

                <View style={{ height: 20 }} />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit} activeOpacity={0.8}>
                    <Text style={styles.saveBtnText}>💾 Guardar Cambios</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditando(null)}>
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  list: {
    padding: 15,
    paddingBottom: 100,
  },
  summaryCard: {
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radiusLg,
    padding: 20,
    marginBottom: 20,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
  },
  syncBtn: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryTotal: {
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
    marginBottom: 15,
  },
  summaryLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: '800',
    color: 'white',
  },
  breakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  breakItem: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 10,
    borderRadius: 10,
  },
  breakMat: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  breakWeight: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
  },
  breakCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  searchClear: {
    padding: 4,
  },
  searchClearText: {
    fontSize: 16,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.bg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  filterTextActive: {
    color: 'white',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    opacity: 0.3,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textLight,
    marginBottom: 10,
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    padding: 25,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 500,
  },
  modalRefSection: {
    marginTop: 10,
    marginBottom: 10,
  },
  modalInfo: {
    marginBottom: 6,
  },
  modalLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  modalValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 5,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modalBtns: {
    marginTop: 15,
    gap: 10,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radius,
    padding: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelBtn: {
    alignItems: 'center',
    padding: 10,
  },
  cancelBtnText: {
    color: COLORS.textLight,
    fontWeight: '600',
    fontSize: 14,
  },
})
