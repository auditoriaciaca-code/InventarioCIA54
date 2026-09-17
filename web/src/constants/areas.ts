import type { Area } from '../types'

export const AREAS: Area[] = [
  { id: 'produccion', nombre: 'Producción', icono: '🏭', color: '#1a5f2a' },
  { id: 'cargue', nombre: 'Cargue', icono: '⬆️', color: '#2980b9' },
  { id: 'tarjeta', nombre: 'Tarjeta', icono: '🎫', color: '#8e44ad' },
  { id: 'descargue_sur', nombre: 'Descargue Sur', icono: '🔽', color: '#d35400' },
  { id: 'descargue_norte', nombre: 'Descargue Norte', icono: '🔼', color: '#16a085' },
]

export const AREA_MAP = new Map<string, Area>(AREAS.map(a => [a.id, a]))

export function nombreArea(id?: string | null): string {
  if (!id) return 'Sin área'
  return AREA_MAP.get(id)?.nombre ?? id
}
