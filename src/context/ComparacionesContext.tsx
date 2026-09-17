import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert } from 'react-native'
import { useSesion } from './SesionContext'
import { supabase } from '../services/supabase'
import { Comparacion } from '../types'
import { nombreArea } from '../constants/areas'

const POLL_INTERVAL_MS = 20000

interface ComparacionesContextType {
  porRegistro: Record<string, Comparacion>
}

const ComparacionesContext = createContext<ComparacionesContextType>({ porRegistro: {} })

/**
 * Aplica una comparación al mapa registro→comparación. Si viene 'anulada'
 * (el trigger le "robó" el lugar a una mejor pareja), se quita del mapa en
 * vez de dejar pegado el semáforo/alerta viejo — pero solo si lo que hay
 * guardado ahí sigue siendo justo esa comparación anulada (para no borrar
 * por accidente una más nueva que ya haya llegado).
 */
function aplicarComparacion(mapa: Record<string, Comparacion>, c: Comparacion): Record<string, Comparacion> {
  const siguiente = { ...mapa }
  if (c.estado === 'anulada') {
    if (siguiente[c.registro_a_id]?.id === c.id) delete siguiente[c.registro_a_id]
    if (siguiente[c.registro_b_id]?.id === c.id) delete siguiente[c.registro_b_id]
  } else {
    siguiente[c.registro_a_id] = c
    siguiente[c.registro_b_id] = c
  }
  return siguiente
}

export function ComparacionesProvider({ children }: { children: ReactNode }) {
  const { sesion } = useSesion()
  const areaId = sesion?.area_id || ''
  const [porRegistro, setPorRegistro] = useState<Record<string, Comparacion>>({})
  const conectadoRef = useRef(false)
  const vistasRef = useRef<Set<string>>(new Set())
  const desdeRef = useRef<string>(new Date().toISOString())

  useEffect(() => {
    setPorRegistro({})
    if (!areaId) return

    conectadoRef.current = false
    vistasRef.current = new Set()
    desdeRef.current = new Date().toISOString()

    function manejarComparacion(c: Comparacion) {
      setPorRegistro(prev => aplicarComparacion(prev, c))

      if (c.estado !== 'alerta') return
      const clave = `${c.id}:${c.diferencia}`
      if (vistasRef.current.has(clave)) return
      vistasRef.current.add(clave)

      if (c.created_at > desdeRef.current) desdeRef.current = c.created_at

      Alert.alert(
        '⚠️ Diferencia de peso',
        `Área: ${nombreArea(c.area_id)}\n` +
        `Material: ${c.referencia_a || c.material_id}${c.misma_referencia ? '' : ` (comparado con ${c.referencia_b})`}\n\n` +
        `${c.operador_a || 'Operador A'}: ${c.peso_a.toFixed(1)} kg\n` +
        `${c.operador_b || 'Operador B'}: ${c.peso_b.toFixed(1)} kg\n\n` +
        `Diferencia: ${c.diferencia.toFixed(1)} kg (tolerancia ${c.tolerancia} kg)\n\n` +
        `Verifiquen la última pesada.`,
        [{ text: 'Entendido' }]
      )
    }

    const canal = supabase
      .channel(`comparaciones-${areaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inv_comparaciones', filter: `area_id=eq.${areaId}` },
        payload => manejarComparacion(payload.new as Comparacion)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inv_comparaciones', filter: `area_id=eq.${areaId}` },
        payload => manejarComparacion(payload.new as Comparacion)
      )
      .subscribe(status => {
        conectadoRef.current = status === 'SUBSCRIBED'
      })

    // Trae lo que ya existía antes de montar el listener (ej. al reabrir la
    // app). Orden cronológico: si una comparación fue anulada y remplazada,
    // hay que aplicar los cambios en el mismo orden en que pasaron.
    supabase
      .from('inv_comparaciones')
      .select('*')
      .eq('area_id', areaId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data) return
        setPorRegistro(prev => (data as Comparacion[]).reduce(aplicarComparacion, prev))
      })

    const intervalo = setInterval(async () => {
      if (conectadoRef.current) return
      try {
        const { data, error } = await supabase
          .from('inv_comparaciones')
          .select('*')
          .eq('area_id', areaId)
          .gt('created_at', desdeRef.current)
          .order('created_at', { ascending: true })
        if (error || !data) return
        for (const c of data as Comparacion[]) manejarComparacion(c)
      } catch {}
    }, POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalo)
      supabase.removeChannel(canal)
    }
  }, [areaId])

  return (
    <ComparacionesContext.Provider value={{ porRegistro }}>
      {children}
    </ComparacionesContext.Provider>
  )
}

export const useComparaciones = () => useContext(ComparacionesContext)
