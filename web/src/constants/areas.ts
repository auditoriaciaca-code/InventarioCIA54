import type { Area } from '../types'

// Semillas iniciales, antes de la primera consulta a Supabase (fuente de
// verdad real — ver useAreas() en lib/useAreas.ts). Bindings mutables a
// propósito: nombreArea() siempre lee el valor más reciente.
export let AREAS: Area[] = [
  { id: 'produccion', nombre: 'Producción', icono: '🏭', color: '#1a5f2a' },
  { id: 'cargue', nombre: 'Cargue', icono: '⬆️', color: '#2980b9' },
  { id: 'tarjeta', nombre: 'Tarjeta', icono: '🎫', color: '#8e44ad' },
  { id: 'descargue_sur', nombre: 'Descargue Sur', icono: '🔽', color: '#d35400' },
  { id: 'descargue_norte', nombre: 'Descargue Norte', icono: '🔼', color: '#16a085' },
]

export let AREA_MAP = new Map<string, Area>(AREAS.map(a => [a.id, a]))

const PALETA_COLORES = ['#1a5f2a', '#2980b9', '#8e44ad', '#d35400', '#16a085', '#c0392b', '#7f8c8d', '#e67e22']

export function actualizarAreas(nuevas: { id: string; nombre: string; icono: string }[]): void {
  if (nuevas.length === 0) return
  AREAS = nuevas.map((a, i) => ({
    id: a.id,
    nombre: a.nombre,
    icono: a.icono,
    color: PALETA_COLORES[i % PALETA_COLORES.length],
  }))
  AREA_MAP = new Map(AREAS.map(a => [a.id, a]))
}

export function nombreArea(id?: string | null): string {
  if (!id) return 'Sin área'
  return AREA_MAP.get(id)?.nombre ?? id
}
