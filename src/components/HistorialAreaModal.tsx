import { useEffect, useState } from 'react'
import { View, Text, Modal, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { obtenerHistorialArea, obtenerSesionesPorArea } from '../services/supabase'
import { SesionRemota } from '../context/SesionContext'
import { nombreArea } from '../constants/areas'
import { COLORS, SIZES } from '../constants/theme'

interface FilaSesion {
  sesion: SesionRemota
  totalNeto: number
  cantidad: number
  ultimaPesada: string | null
}

interface Props {
  areaId: string | null
  onClose: () => void
  onContinuar: (s: SesionRemota) => void
}

function formatearFecha(fechaISO: string): string {
  const d = new Date(fechaISO)
  const hoy = new Date().toISOString().slice(0, 10)
  const soloFecha = fechaISO.slice(0, 10)
  if (soloFecha === hoy) return 'Hoy'
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function HistorialAreaModal({ areaId, onClose, onContinuar }: Props) {
  const [cargando, setCargando] = useState(false)
  const [filas, setFilas] = useState<FilaSesion[]>([])

  useEffect(() => {
    if (!areaId) {
      setFilas([])
      return
    }
    let activo = true
    setCargando(true)
    Promise.all([obtenerHistorialArea(areaId), obtenerSesionesPorArea(areaId)]).then(([registros, sesiones]) => {
      if (!activo) return
      const agregados = new Map<string, { totalNeto: number; cantidad: number; ultimaPesada: string }>()
      for (const r of registros) {
        if (!r.sesion_id) continue
        const actual = agregados.get(r.sesion_id) || { totalNeto: 0, cantidad: 0, ultimaPesada: r.created_at }
        actual.totalNeto += (r.peso_bruto || 0) - (r.tara || 0)
        actual.cantidad++
        if (r.created_at > actual.ultimaPesada) actual.ultimaPesada = r.created_at
        agregados.set(r.sesion_id, actual)
      }
      const lista: FilaSesion[] = sesiones.map(s => {
        const ag = agregados.get(s.id)
        return {
          sesion: s,
          totalNeto: ag?.totalNeto || 0,
          cantidad: ag?.cantidad || 0,
          ultimaPesada: ag?.ultimaPesada || null,
        }
      })
      lista.sort((a, b) => (b.ultimaPesada || b.sesion.created_at).localeCompare(a.ultimaPesada || a.sesion.created_at))
      setFilas(lista)
      setCargando(false)
    })
    return () => {
      activo = false
    }
  }, [areaId])

  const totalGeneral = filas.reduce((s, f) => s + f.totalNeto, 0)
  const pesadasGeneral = filas.reduce((s, f) => s + f.cantidad, 0)

  return (
    <Modal visible={!!areaId} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity onPress={onClose} style={styles.backRow}>
            <Text style={styles.backText}>← Volver a salas</Text>
          </TouchableOpacity>

          <Text style={styles.title}>📜 Historial · {nombreArea(areaId)}</Text>
          <Text style={styles.subtitle}>
            {cargando ? 'Cargando…' : `${filas.length} sesión(es) · todos los celulares · toca una para continuarla`}
          </Text>

          {cargando ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={filas}
              keyExtractor={item => item.sesion.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<Text style={styles.emptyText}>Sin sesiones registradas en esta área todavía</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.diaRow}
                  onPress={() => onContinuar(item.sesion)}
                  activeOpacity={0.7}
                >
                  <View style={styles.diaLeft}>
                    <Text style={styles.diaFecha} numberOfLines={1}>
                      {item.sesion.nombre_operador} · {formatearFecha(item.ultimaPesada || item.sesion.created_at)}
                    </Text>
                    <Text style={styles.diaMeta} numberOfLines={1}>
                      {item.cantidad} pesada(s)
                      {item.ultimaPesada && item.ultimaPesada.slice(0, 10) !== item.sesion.created_at.slice(0, 10)
                        ? ` · iniciada ${formatearFecha(item.sesion.created_at)}`
                        : ''}
                    </Text>
                  </View>
                  <View style={styles.diaRight}>
                    <Text style={styles.diaKg}>
                      {item.totalNeto.toFixed(0)}
                      <Text style={styles.diaKgUnidad}> kg</Text>
                    </Text>
                    <Text style={styles.continuarText}>Continuar →</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}

          {!cargando && filas.length > 0 && (
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
  },
  diaMeta: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  diaRight: {
    alignItems: 'flex-end',
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
  continuarText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 2,
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
