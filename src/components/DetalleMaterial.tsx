import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Image, FlatList, StyleSheet } from 'react-native'
import { COLORS, SIZES } from '../constants/theme'
import { formatDescripcion } from '../utils/format'
import { getDatabase } from '../services/database'
import { RegistroPesada, Foto } from '../types'
import PhotoViewer from './PhotoViewer'

interface Props {
  materialId: string
  materialNombre: string
  materialIcono: string
  registros: RegistroPesada[]
  onCerrar: () => void
}

interface Pesada {
  id: string
  neto: number
  fotosCount: number
}

interface DetalleReferencia {
  codigo: string
  nombreCorto: string
  total: number
  pesadas: Pesada[]
}

function getDetalleReferencias(registros: RegistroPesada[], materialId: string): DetalleReferencia[] {
  const map = new Map<string, { descripcion: string; pesadas: Pesada[] }>()
  for (const r of registros) {
    if (r.material_id !== materialId) continue
    const codigo = r.referencia_codigo || '(sin referencia)'
    const entry = map.get(codigo) || { descripcion: r.referencia_descripcion || codigo, pesadas: [] }
    entry.pesadas.push({ id: r.id, neto: r.peso_bruto - r.tara, fotosCount: r.fotos_count })
    map.set(codigo, entry)
  }
  return Array.from(map.entries())
    .map(([codigo, v]) => ({
      codigo,
      nombreCorto: formatDescripcion(v.descripcion),
      total: v.pesadas.reduce((s, p) => s + p.neto, 0),
      pesadas: v.pesadas,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
}

export default function DetalleMaterial({ materialId, materialNombre, materialIcono, registros, onCerrar }: Props) {
  const [referenciaAbierta, setReferenciaAbierta] = useState<string | null>(null)
  const [fotosPorRegistro, setFotosPorRegistro] = useState<Map<string, Foto[]>>(new Map())
  const [fotosVisibles, setFotosVisibles] = useState<Foto[]>([])
  const [visorAbierto, setVisorAbierto] = useState(false)
  const referencias = getDetalleReferencias(registros, materialId)
  const totalMaterial = referencias.reduce((s, r) => s + r.total, 0)

  useEffect(() => {
    const ids = registros.filter(r => r.material_id === materialId && r.fotos_count > 0).map(r => r.id)
    if (ids.length === 0) {
      setFotosPorRegistro(new Map())
      return
    }
    const placeholders = ids.map(() => '?').join(',')
    getDatabase()
      .getAllAsync<Foto>(`SELECT * FROM inv_fotos WHERE registro_id IN (${placeholders}) ORDER BY orden ASC`, ids)
      .then(fotos => {
        const map = new Map<string, Foto[]>()
        for (const f of fotos) {
          const arr = map.get(f.registro_id) || []
          arr.push(f)
          map.set(f.registro_id, arr)
        }
        setFotosPorRegistro(map)
      })
      .catch(() => {})
  }, [registros, materialId])

  function verFotos(registroId: string) {
    const fotos = fotosPorRegistro.get(registroId)
    if (!fotos || fotos.length === 0) return
    setFotosVisibles(fotos)
    setVisorAbierto(true)
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCerrar} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backBtnText}>← Resumen</Text>
        </TouchableOpacity>
        <Text style={styles.titulo} numberOfLines={1}>{materialIcono} {materialNombre}</Text>
      </View>

      <FlatList
        data={referencias}
        keyExtractor={r => r.codigo}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total {materialNombre}</Text>
            <Text style={styles.totalValue}>{totalMaterial.toFixed(2)} kg</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.vacioTexto}>Sin pesadas de este material</Text>}
        renderItem={({ item }) => {
          const abierta = referenciaAbierta === item.codigo
          return (
            <View style={styles.grupo}>
              <TouchableOpacity
                style={styles.referenciaRow}
                onPress={() => setReferenciaAbierta(abierta ? null : item.codigo)}
                activeOpacity={0.7}
              >
                <Text style={styles.flecha}>{abierta ? '▾' : '▸'}</Text>
                <Text style={styles.referenciaNombre} numberOfLines={1}>{item.nombreCorto}</Text>
                <View style={styles.referenciaDerecha}>
                  <Text style={styles.referenciaCount}>{item.pesadas.length} pesada(s)</Text>
                  <Text style={styles.referenciaTotal}>{item.total.toFixed(2)} kg</Text>
                </View>
              </TouchableOpacity>

              {abierta && (
                <View style={styles.pesadasBox}>
                  {item.pesadas.map((p, i) => (
                    <View key={p.id} style={styles.pesadaRow}>
                      <Text style={styles.pesadaLabel}>P{i + 1}</Text>
                      <View style={styles.pesadaDerecha}>
                        <Text style={styles.pesadaValor}>{p.neto.toFixed(2)} kg</Text>
                        {p.fotosCount > 0 && (
                          <TouchableOpacity
                            style={styles.fotoBtn}
                            onPress={() => verFotos(p.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.fotoBtnIcon}>📷</Text>
                            {p.fotosCount > 1 && <Text style={styles.fotoBtnCount}>{p.fotosCount}</Text>}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )
        }}
      />

      <PhotoViewer visible={visorAbierto} fotos={fotosVisibles} onClose={() => setVisorAbierto(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
  },
  backBtn: {
    paddingVertical: 4,
  },
  backBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  titulo: {
    flex: 1,
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
  },
  lista: {
    padding: 15,
    gap: 10,
  },
  totalBox: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusLg,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  totalLabel: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.primary,
  },
  grupo: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  referenciaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  flecha: {
    fontSize: 12,
    color: COLORS.textLight,
    width: 14,
  },
  referenciaNombre: {
    flex: 1,
    fontWeight: '700',
    fontSize: 14,
    color: COLORS.text,
  },
  referenciaDerecha: {
    alignItems: 'flex-end',
  },
  referenciaCount: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  referenciaTotal: {
    fontWeight: '800',
    fontSize: 14,
    color: COLORS.primary,
  },
  pesadasBox: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pesadaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  pesadaLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  pesadaValor: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  pesadaDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  fotoBtnIcon: {
    fontSize: 13,
  },
  fotoBtnCount: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  vacioTexto: {
    textAlign: 'center',
    color: COLORS.textLight,
    paddingVertical: 30,
  },
})
