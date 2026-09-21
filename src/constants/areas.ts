import { Area } from '../types'

// Semillas iniciales, para que la app tenga algo que mostrar antes de la
// primera sincronización con Supabase (fuente de verdad real desde ahora
// — ver actualizarAreas(), llamada por sincronizarAreas() en sync.ts).
// Son bindings mutables a propósito: todo el código que hace
// `import { AREAS, nombreArea } from '../constants/areas'` lee siempre el
// valor más reciente, incluyendo áreas creadas desde la app.
export let AREAS: Area[] = [
  { id: 'produccion', nombre: 'Producción', icono: '🏭', color: '#1a5f2a' },
  { id: 'cargue', nombre: 'Cargue', icono: '⬆️', color: '#2980b9' },
  { id: 'tarjeta', nombre: 'Tarjeta', icono: '🎫', color: '#8e44ad' },
  { id: 'descargue_sur', nombre: 'Descargue Sur', icono: '🔽', color: '#d35400' },
  { id: 'descargue_norte', nombre: 'Descargue Norte', icono: '🔼', color: '#16a085' },
]

export let AREA_MAP = new Map<string, Area>(AREAS.map(a => [a.id, a]))

const PALETA_COLORES = ['#1a5f2a', '#2980b9', '#8e44ad', '#d35400', '#16a085', '#c0392b', '#7f8c8d', '#e67e22']

/** Reemplaza el catálogo en memoria con lo que llegó de Supabase. */
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
