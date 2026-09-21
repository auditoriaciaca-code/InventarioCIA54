import { useEffect, useState } from 'react'
import { View, Text, Modal, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { obtenerHistorialArea } from '../services/supabase'
import { nombreArea } from '../constants/areas'
import { COLORS, SIZES } from '../constants/theme'

interface DiaResumen {
  fecha: string
  totalNeto: number
  cantidad: number
  operadores: string[]
}

interface Props {
  areaId: string | null
  onClose: () => void
}

function formatearFecha(fechaISO: string): string {
  const d = new Date(`${fechaISO}T12:00:00`)
  const hoy = new Date().toISOString().slice(0, 10)
  if (fechaISO === hoy) return 'Hoy'
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' })
}

export default function HistorialAreaModal({ areaId, onClose }: Props) {
  const [cargando, setCargando] = useState(false)
  const [dias, setDias] = useState<DiaResumen[]>([])

  useEffect(() => {
    if (!areaId) {
      setDias([])
      return
    }
    let activo = true
    setCargando(true)
    obtenerHistorialArea(areaId).then(registros => {
      if (!activo) return
      const mapa = new Map<string, { totalNeto: number; cantidad: number; operadores: Set<string> }>()
      for (const r of registros) {
        const fecha = String(r.created_at).slice(0, 10)
        const actual = mapa.get(fecha) || { totalNeto: 0, cantidad: 0, operadores: new Set<string>() }
        actual.totalNeto += (r.peso_bruto || 0) - (r.tara || 0)
        actual.cantidad++
        if (r.created_by) actual.operadores.add(r.created_by)
        mapa.set(fecha, actual)
      }
      const lista = Array.from(mapa.entries())
        .map(([fecha, v]) => ({
          fecha,
          totalNeto: v.totalNeto,
          cantidad: v.cantidad,
          operadores: Array.from(v.operadores),
        }))
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
      setDias(lista)
      setCargando(false)
    })
    return () => {
      activo = false
    }
  }, [areaId])

  const totalGeneral = dias.reduce((s, d) => s + d.totalNeto, 0)
  const pesadasGeneral = dias.reduce((s, d) => s + d.cantidad, 0)

  return (
    <Modal visible={!!areaId} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity onPress={onClose} style={styles.backRow}>
            <Text style={styles.backText}>← Volver a salas</Text>
          </TouchableOpacity>

          <Text style={styles.title}>📜 Historial · {nombreArea(areaId)}</Text>
          <Text style={styles.subtitle}>
            {cargando ? 'Cargando…' : `${dias.length} jornada(s) registrada(s) · todos los celulares`}
          </Text>

          {cargando ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={dias}
              keyExtractor={item => item.fecha}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<Text style={styles.emptyText}>Sin pesadas registradas en esta área todavía</Text>}
              renderItem={({ item }) => (
                <View style={styles.diaRow}>
                  <View style={styles.diaLeft}>
                    <Text style={styles.diaFecha}>{formatearFecha(item.fecha)}</Text>
                    <Text style={styles.diaMeta} numberOfLines={1}>
                      {item.operadores.join(', ') || 'Sin operador'} · {item.cantidad} pesada(s)
                    </Text>
                  </View>
                  <Text style={styles.diaKg}>
                    {item.totalNeto.toFixed(0)}
                    <Text style={styles.diaKgUnidad}> kg</Text>
                  </Text>
                </View>
              )}
            />
          )}

          {!cargando && dias.length > 0 && (
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Total del período</Text>
              <Text style={styles.totalValue}>
                {totalGeneral.toFixed(0)} kg · {pesadasGeneral} pesadas
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
    minHeight: '55%',
  },
  backRow: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  backText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: 12.5,
    color: COLORS.textLight,
    marginTop: 2,
    marginBottom: 14,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 8,
    paddingBottom: 10,
  },
  diaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    padding: 13,
    gap: 10,
  },
  diaLeft: {
    flex: 1,
    minWidth: 0,
  },
  diaFecha: {
    fontWeight: '700',
    fontSize: 14,
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  diaMeta: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  diaKg: {
    fontWeight: '800',
    fontSize: 17,
    color: COLORS.primary,
  },
  diaKgUnidad: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textLight,
    paddingVertical: 30,
  },
  totalBox: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  totalLabel: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 2,
  },
})
