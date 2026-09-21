import { createClient } from '@supabase/supabase-js'
import { File } from 'expo-file-system'
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

/**
 * Sube el archivo de la foto (no solo su metadato) al bucket de Storage,
 * para que sea visible desde cualquier celular o desde la plataforma web
 * — antes solo se guardaba `path_local`, que no sirve fuera del celular
 * que tomó la foto. Devuelve la URL pública o null si falló (sin señal,
 * best-effort, nunca lanza).
 */
export async function subirFotoStorage(fotoId: string, pathLocal: string): Promise<string | null> {
  try {
    const ext = pathLocal.split('.').pop()?.toLowerCase() || 'jpg'
    const storagePath = `${fotoId}.${ext}`
    // fetch(uri).arrayBuffer() no es confiable con URIs file:// en Android;
    // expo-file-system sí lee el archivo local de forma directa y robusta.
    const bytes = await new File(pathLocal).bytes()
    const { error } = await supabase.storage
      .from('inv_fotos')
      .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('inv_fotos').getPublicUrl(storagePath)
    return data.publicUrl
  } catch {
    return null
  }
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

/**
 * Catálogo de áreas (ya no está fijo en el código — se sincroniza desde
 * Supabase, ver sincronizarAreas() en sync.ts). null = falló, [] = no hay
 * ninguna (no debería pasar, pero por si acaso).
 */
export async function obtenerAreas(): Promise<
  Array<{ id: string; nombre: string; icono: string; orden: number }> | null
> {
  try {
    const { data, error } = await supabase
      .from('inv_areas')
      .select('id, nombre, icono, orden')
      .order('orden', { ascending: true })
    if (error) return null
    return data ?? []
  } catch {
    return null
  }
}

/** Crea una nueva área permanente (botón "+ Crear nueva área" del lobby). */
export async function crearAreaRemota(area: {
  id: string
  nombre: string
  icono: string
  orden: number
}): Promise<boolean> {
  try {
    const { error } = await supabase.from('inv_areas').insert([area])
    return !error
  } catch {
    return false
  }
}

/**
 * Cierres de HOY para todas las áreas de un jalón (el lobby los necesita
 * todos a la vez). Devuelve un mapa area_id -> fila de cierre.
 */
export async function obtenerCierresHoy(): Promise<Record<string, any>> {
  try {
    const hoy = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase.from('inv_cierres').select('*').eq('fecha', hoy)
    if (error || !data) return {}
    const mapa: Record<string, any> = {}
    for (const row of data as any[]) mapa[row.area_id] = row
    return mapa
  } catch {
    return {}
  }
}

/** Marca un área como finalizada para una fecha puntual (no es permanente). */
export async function finalizarInventarioRemoto(
  areaId: string,
  fecha: string,
  operador: string
): Promise<boolean> {
  try {
    const { error } = await supabase.from('inv_cierres').upsert([
      {
        area_id: areaId,
        fecha,
        cerrado: true,
        cerrado_por: operador,
        cerrado_at: new Date().toISOString(),
      },
    ])
    return !error
  } catch {
    return false
  }
}

/** Reabre un área ya finalizada el mismo día (requiere clave de supervisor validada antes de llamar esto). */
export async function reabrirInventarioRemoto(
  areaId: string,
  fecha: string,
  operador: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('inv_cierres')
      .update({ cerrado: false, reabierto_por: operador, reabierto_at: new Date().toISOString() })
      .eq('area_id', areaId)
      .eq('fecha', fecha)
    return !error
  } catch {
    return false
  }
}

/** Hash guardado de la clave del supervisor (vacío si nunca se configuró). */
export async function obtenerClaveSupervisorHash(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('inv_config')
      .select('valor')
      .eq('clave', 'clave_supervisor_hash')
      .maybeSingle()
    if (error) return null
    return data?.valor ?? ''
  } catch {
    return null
  }
}

/** Configura (o cambia) la clave del supervisor — guarda solo el hash. */
export async function guardarClaveSupervisorHash(hash: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('inv_config')
      .upsert([{ clave: 'clave_supervisor_hash', valor: hash, actualizado_at: new Date().toISOString() }])
    return !error
  } catch {
    return false
  }
}

/**
 * Todas las pesadas históricas de un área (cualquier operador, cualquier
 * celular) para armar el historial por jornada. Se agrupan por día en el
 * cliente, igual que ya se hace para el resumen de una sesión.
 */
export async function obtenerHistorialArea(areaId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('inv_registros')
      .select('id, peso_bruto, tara, created_by, created_at')
      .eq('area_id', areaId)
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error || !data) return []
    return data
  } catch {
    return []
  }
}
