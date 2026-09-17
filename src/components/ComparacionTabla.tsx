import { useCallback, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native'
import { COLORS, SIZES } from '../constants/theme'
import { formatDescripcion } from '../utils/format'
import { CATEGORIA_MAP } from '../constants/materiales'
import { obtenerRegistrosHoyPorArea, obtenerComparacionesHoyPorArea, obtenerOperadoresHoyPorArea } from '../services/supabase'

interface Props {
  areaId: string
  miNombre: string
  onCerrar: () => void
}

interface Fila {
  key: string
  cuando: string
  materialId: string
  miReferencia: string | null
  miPeso: number | null
  suReferencia: string | null
  suPeso: number | null
  diferencia: number | null
}

const REFRESH_MS = 15000

function colorFila(dif: number | null): string {
  if (dif === null) return COLORS.border
  if (dif === 0) return '#2ecc71'
  if (dif < 2) return '#f1c40f'
  return COLORS.danger
}

/** Nombre corto de una referencia (ej. "COBRE 1C") resuelto desde el
 * catálogo local por código — inv_comparaciones solo guarda el código, no
 * la descripción, así que se resuelve del lado del cliente. */
function nombreCorto(materialId: string, referenciaCodigo: string | null): string {
  if (!referenciaCodigo) return ''
  const categoria = CATEGORIA_MAP.get(materialId)
  const ref = categoria?.referencias.find(r => r.codigo === referenciaCodigo)
  return ref ? formatDescripcion(ref.descripcion) : referenciaCodigo
}

export default function ComparacionTabla({ areaId, miNombre, onCerrar }: Props) {
  const [filas, setFilas] = useState<Fila[]>([])
  const [suNombre, setSuNombre] = useState('')
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    const [registros, comparaciones, operadoresPorArea] = await Promise.all([
      obtenerRegistrosHoyPorArea(areaId),
      obtenerComparacionesHoyPorArea(areaId),
      obtenerOperadoresHoyPorArea(),
    ])

    // Misma fuente confiable que ya usa el header (respeta el candado de
    // sala) — no depende de que el compañero ya haya pesado algo, y no se
    // confunde con datos viejos de pruebas que puedan quedar en inv_registros.
    const ocupantes = operadoresPorArea[areaId] || []
    const otroNombre = ocupantes.find(n => n.toLowerCase() !== miNombre.toLowerCase())
    setSuNombre(otroNombre || 'sin compañero aún')

    const idsEmparejados = new Set<string>()
    const nuevasFilas: Fila[] = []

    for (const c of comparaciones) {
      if (c.estado === 'anulada') continue
      idsEmparejados.add(c.registro_a_id)
      idsEmparejados.add(c.registro_b_id)
      const yoEsA = (c.operador_a || '').toLowerCase() === miNombre.toLowerCase()
      nuevasFilas.push({
        key: c.id,
        cuando: c.actualizado_at || c.created_at,
        materialId: c.material_id,
        miReferencia: yoEsA ? c.referencia_a : c.referencia_b,
        miPeso: yoEsA ? c.peso_a : c.peso_b,
        suReferencia: yoEsA ? c.referencia_b : c.referencia_a,
        suPeso: yoEsA ? c.peso_b : c.peso_a,
        diferencia: c.diferencia,
      })
    }

    for (const r of registros) {
      if (idsEmparejados.has(r.id)) continue
      const esMio = (r.created_by || '').toLowerCase() === miNombre.toLowerCase()
      nuevasFilas.push({
        key: r.id,
        cuando: r.created_at,
        materialId: r.material_id,
        miReferencia: esMio ? r.referencia_codigo : null,
        miPeso: esMio ? r.peso_neto : null,
        suReferencia: esMio ? null : r.referencia_codigo,
        suPeso: esMio ? null : r.peso_neto,
        diferencia: null,
      })
    }

    nuevasFilas.sort((a, b) => a.cuando.localeCompare(b.cuando))
    setFilas(nuevasFilas)
    setCargando(false)
  }, [areaId, miNombre])

  useEffect(() => {
    cargar()
    const intervalo = setInterval(cargar, REFRESH_MS)
    return () => clearInterval(intervalo)
  }, [cargar])

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCerrar} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backBtnText}>← Chat</Text>
        </TouchableOpacity>
        <Text style={styles.titulo} numberOfLines={1}>
          {miNombre} vs {suNombre || '...'}
        </Text>
      </View>

      <FlatList
        data={filas}
        keyExtractor={f => f.key}
        contentContainerStyle={styles.lista}
        refreshing={cargando}
        onRefresh={cargar}
        ListEmptyComponent={<Text style={styles.vacioGeneral}>Sin pesadas hoy en esta área</Text>}
        renderItem={({ item }) => (
          <View style={styles.fila}>
            <View style={[styles.punto, { backgroundColor: colorFila(item.diferencia) }]} />
            <View style={styles.lado}>
              {item.miReferencia ? (
                <>
                  <Text style={styles.referencia} numberOfLines={2}>
                    {nombreCorto(item.materialId, item.miReferencia)}
                  </Text>
                  <Text style={styles.peso}>{item.miPeso?.toFixed(2)} kg</Text>
                </>
              ) : (
                <Text style={styles.vacio}>VACÍO</Text>
              )}
            </View>
            <Text style={styles.vs}>vs</Text>
            <View style={styles.lado}>
              {item.suReferencia ? (
                <>
                  <Text style={styles.referencia} numberOfLines={2}>
                    {nombreCorto(item.materialId, item.suReferencia)}
                  </Text>
                  <Text style={styles.peso}>{item.suPeso?.toFixed(2)} kg</Text>
                </>
              ) : (
                <Text style={styles.vacio}>VACÍO</Text>
              )}
            </View>
            <View style={styles.difBox}>
              <Text style={[styles.difTexto, { color: colorFila(item.diferencia) }]}>
                {item.diferencia !== null ? `${item.diferencia.toFixed(2)} kg` : '—'}
              </Text>
            </View>
          </View>
        )}
      />
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
    padding: 12,
    gap: 8,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 8,
  },
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lado: {
    flex: 1,
    alignItems: 'center',
  },
  referencia: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  peso: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 2,
  },
  vacio: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  vs: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  difBox: {
    minWidth: 56,
    alignItems: 'flex-end',
  },
  difTexto: {
    fontSize: 12,
    fontWeight: '800',
  },
  vacioGeneral: {
    textAlign: 'center',
    color: COLORS.textLight,
    paddingVertical: 40,
  },
})
