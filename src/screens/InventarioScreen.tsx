import { useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { RegistroPesada } from '../types'
import { MATERIAL_MAP } from '../constants/materiales'
import InventoryItem from '../components/InventoryItem'
import { getDatabase } from '../services/database'
import { COLORS, SIZES } from '../constants/theme'
import { sincronizar } from '../services/sync'

export default function InventarioScreen() {
  const [registros, setRegistros] = useState<RegistroPesada[]>([])
  const [filtro, setFiltro] = useState<string | null>(null)
  const [totalNeto, setTotalNeto] = useState(0)

  useFocusEffect(
    useCallback(() => {
      cargarRegistros()
    }, [])
  )

  async function cargarRegistros() {
    try {
      const db = getDatabase()
      const rows = await db.getAllAsync<RegistroPesada>(
        'SELECT * FROM inv_registros ORDER BY created_at DESC'
      )
      setRegistros(rows)
      const total = rows.reduce((sum, r) => sum + r.peso_neto, 0)
      setTotalNeto(total)
    } catch (error) {
      console.error(error)
    }
  }

  const registrosFiltrados = filtro
    ? registros.filter(r => r.material_id === filtro)
    : registros

  const materialesUnicos = Array.from(new Set(registros.map(r => r.material_id)))
    .map(id => MATERIAL_MAP.get(id))
    .filter(Boolean)

  const totalFiltrado = registrosFiltrados.reduce((sum, r) => sum + r.peso_neto, 0)

  function handleEdit(id: string) {
    Alert.alert('Editar', `Editar registro #${id.slice(0, 8)}`)
  }

  function handleViewPhotos(id: string) {
    const reg = registros.find(r => r.id === id)
    if (!reg || reg.fotos_count === 0) {
      Alert.alert('Sin fotos', 'Este registro no tiene fotos')
      return
    }
    Alert.alert('Fotos', `El registro #${id.slice(0, 8)} tiene ${reg.fotos_count} foto(s)`)
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
    marginBottom: 15,
    flexWrap: 'wrap',
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
})
