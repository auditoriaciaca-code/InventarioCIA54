import { createClient } from '@supabase/supabase-js'
import { Comparacion } from '../types'

const supabaseUrl = 'https://lkrjzpxzxurzjoswpeku.supabase.co'
const supabaseAnonKey = 'sb_publishable_6cWubKMz8T6lJqVE6HadnA_MX47WHQz'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function syncRegistros(registros: any[]): Promise<void> {
  if (registros.length === 0) return
  const { error } = await supabase.from('inv_registros').upsert(registros)
  if (error) throw error
}

export async function syncFotos(fotos: any[]): Promise<void> {
  if (fotos.length === 0) return
  const { error } = await supabase.from('inv_fotos').upsert(fotos)
  if (error) throw error
}

const TIMEOUT_SUBIDA_MS = 6000

/**
 * Sube un registro a Supabase justo después de guardarlo en SQLite, para que
 * el emparejamiento de doble conteo (trigger en Supabase) sea casi en vivo.
 * Nunca lanza: si falla (sin señal, timeout), el registro queda con
 * synced=0 y sincronizar() lo recoge después.
 */
export async function subirRegistroInmediato(registro: any): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_SUBIDA_MS)
    const { error } = await supabase
      .from('inv_registros')
      .upsert([{ ...registro, synced: undefined }])
      .abortSignal(ctrl.signal)
    clearTimeout(t)
    return !error
  } catch {
    return false
  }
}

/**
 * Sube una sala/sesión recién creada a Supabase (best-effort, nunca lanza),
 * para que otros celulares puedan ver quién ya está trabajando en cada área.
 */
export async function subirSesionInmediato(sesion: any): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_SUBIDA_MS)
    const { error } = await supabase.from('inv_sesiones').upsert([sesion]).abortSignal(ctrl.signal)
    clearTimeout(t)
    return !error
  } catch {
    return false
  }
}

/**
 * Operadores que siguen "ocupando" cada área hoy (su sesión más reciente en
 * esa área todavía no fue liberada con el botón "Salir"). Si falla (sin
 * señal), devuelve {} y el selector simplemente no bloquea ni muestra nada
 * — no debe romper el flujo offline-first.
 */
export async function obtenerOperadoresHoyPorArea(): Promise<Record<string, string[]>> {
  try {
    const inicio = new Date()
    inicio.setHours(0, 0, 0, 0)
    const { data, error } = await supabase
      .from('inv_sesiones')
      .select('area_id, nombre_operador, created_at, liberada_at')
      .gte('fecha', inicio.toISOString())
      .order('created_at', { ascending: true })
    if (error || !data) return {}

    // Nos quedamos con la fila más reciente por (área, nombre) — al estar
    // ordenado ascendente, la última sobreescribe a las anteriores.
    const ultimaPorClave = new Map<string, any>()
    for (const row of data as any[]) {
      if (!row.area_id) continue
      const clave = `${row.area_id}::${String(row.nombre_operador).toLowerCase()}`
      ultimaPorClave.set(clave, row)
    }

    const mapa: Record<string, string[]> = {}
    for (const row of ultimaPorClave.values()) {
      if (row.liberada_at) continue // ya salió, no ocupa la sala
      const lista = mapa[row.area_id] || (mapa[row.area_id] = [])
      lista.push(row.nombre_operador)
    }
    return mapa
  } catch {
    return {}
  }
}

/**
 * Todas las pesadas de hoy de un área, de CUALQUIER operador — el chat de
 * Rápido solo carga las de la sesión propia; la vista "1 vs 1" necesita ver
 * ambos lados.
 */
export async function obtenerRegistrosHoyPorArea(areaId: string): Promise<any[]> {
  try {
    const inicio = new Date()
    inicio.setHours(0, 0, 0, 0)
    const { data, error } = await supabase
      .from('inv_registros')
      .select('*')
      .eq('area_id', areaId)
      .gte('created_at', inicio.toISOString())
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data
  } catch {
    return []
  }
}

/** Comparaciones de hoy de un área (incluye 'anulada', se filtra en la vista). */
export async function obtenerComparacionesHoyPorArea(areaId: string): Promise<Comparacion[]> {
  try {
    const inicio = new Date()
    inicio.setHours(0, 0, 0, 0)
    const { data, error } = await supabase
      .from('inv_comparaciones')
      .select('*')
      .eq('area_id', areaId)
      .gte('created_at', inicio.toISOString())
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data as Comparacion[]
  } catch {
    return []
  }
}

/**
 * Trae los lotes cargados para un área (desde la plataforma web). Devuelve
 * null si falló (sin señal) para que sincronizarLotes() sepa que debe
 * conservar la copia local en vez de vaciarla; [] significa que sí se
 * pudo consultar y simplemente no hay lotes cargados para esa área.
 */
export async function obtenerLotesPorArea(
  areaId: string
): Promise<Array<{ id: string; codigo: string; area_id: string; estado: string }> | null> {
  try {
    const { data, error } = await supabase
      .from('inv_lotes')
      .select('id, codigo, area_id, estado')
      .eq('area_id', areaId)
    if (error) return null
    return data ?? []
  } catch {
    return null
  }
}

/**
 * Libera el candado de una sesión (botón "Salir"). A propósito NO hay
 * liberación automática por inactividad — si esto falla (sin señal), hay
 * que avisar al usuario y NO cerrar su sesión localmente, para que la sala
 * no quede bloqueada para los demás sin que él lo sepa.
 */
export async function liberarSesionInmediato(sesionId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('inv_sesiones')
      .update({ liberada_at: new Date().toISOString() })
      .eq('id', sesionId)
    return !error
  } catch {
    return false
  }
}
