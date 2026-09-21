import { getDatabase } from './database'
import {
  syncRegistros,
  syncFotos,
  subirRegistroInmediato,
  obtenerLotesPorArea,
  subirFotoStorage,
  obtenerAreas,
  obtenerCierresHoy,
} from './supabase'
import { hoyLocalISO } from '../utils/fechas'
import { actualizarAreas } from '../constants/areas'

/**
 * Dispara la subida de un registro recién guardado en segundo plano
 * (no bloquea el flujo de guardado). Solo marca synced=1 si el registro no
 * tiene fotos: los que tienen fotos deben seguir pasando por sincronizar()
 * para que también suban sus filas de inv_fotos.
 */
export function subirEnSegundoPlano(registro: any): void {
  subirRegistroInmediato(registro)
    .then(async ok => {
      if (!ok) return
      if ((registro.fotos_count ?? 0) > 0) return
      try {
        await getDatabase().runAsync('UPDATE inv_registros SET synced = 1 WHERE id = ?', [registro.id])
      } catch {}
    })
    .catch(() => {})
}

/**
 * Sube el archivo de cada foto recién guardada al bucket de Storage, en
 * segundo plano (no bloquea el guardado). Best-effort: si falla, la foto
 * queda con url='' y sincronizar() la recoge después.
 */
export function subirFotosEnSegundoPlano(
  fotos: { id: string; registro_id: string; path_local: string; orden: number }[]
): void {
  for (const foto of fotos) {
    subirFotoStorage(foto.id, foto.path_local)
      .then(async url => {
        if (!url) return
        try {
          const db = getDatabase()
          await db.runAsync('UPDATE inv_fotos SET url = ? WHERE id = ?', [url, foto.id])
          await syncFotos([{ ...foto, url }])
        } catch {}
      })
      .catch(() => {})
  }
}

/**
 * Refresca la copia local (SQLite) de los lotes cargados para un área, para
 * poder validar códigos escaneados sin internet. Best-effort: si falla (sin
 * señal), deja la copia local tal como estaba en vez de vaciarla.
 */
export async function sincronizarLotes(areaId: string): Promise<void> {
  if (!areaId) return
  const lotes = await obtenerLotesPorArea(areaId)
  if (lotes === null) return
  try {
    const db = getDatabase()
    await db.runAsync('DELETE FROM inv_lotes WHERE area_id = ?', [areaId])
    for (const l of lotes) {
      await db.runAsync(
        'INSERT INTO inv_lotes (id, codigo, area_id, estado) VALUES (?, ?, ?, ?)',
        [l.id, l.codigo, l.area_id, l.estado]
      )
    }
  } catch {}
}

/**
 * Refresca la copia local del catálogo de áreas (fuente de verdad:
 * Supabase). Si falla, deja la copia local (las 5 de siempre, o lo último
 * sincronizado) tal como estaba — nunca deja el lobby sin áreas por un
 * corte de señal.
 */
export async function sincronizarAreas(): Promise<void> {
  const areas = await obtenerAreas()
  if (areas === null || areas.length === 0) return
  try {
    const db = getDatabase()
    for (const a of areas) {
      await db.runAsync(
        `INSERT INTO inv_areas_cache (id, nombre, icono, orden) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, icono = excluded.icono, orden = excluded.orden`,
        [a.id, a.nombre, a.icono, a.orden]
      )
    }
    actualizarAreas(areas)
  } catch {}
}

/**
 * Carga el catálogo de áreas guardado en SQLite (lo último sincronizado)
 * hacia la memoria — se llama al arrancar la app, antes de que la
 * sincronización por red termine, para que el lobby no muestre solo las 5
 * semillas si ya se habían sincronizado más áreas en una sesión anterior.
 */
export async function cargarAreasLocal(): Promise<void> {
  try {
    const db = getDatabase()
    const areas = await db.getAllAsync<any>('SELECT * FROM inv_areas_cache ORDER BY orden ASC')
    actualizarAreas(areas)
  } catch {}
}

/**
 * Refresca la copia local de qué áreas están finalizadas HOY, para que el
 * lobby y el bloqueo de registro funcionen igual con o sin señal.
 */
export async function sincronizarCierresHoy(): Promise<void> {
  const mapa = await obtenerCierresHoy()
  try {
    const db = getDatabase()
    const hoy = hoyLocalISO()
    await db.runAsync('DELETE FROM inv_cierres_cache WHERE fecha = ?', [hoy])
    for (const areaId of Object.keys(mapa)) {
      const c = mapa[areaId]
      await db.runAsync(
        'INSERT INTO inv_cierres_cache (area_id, fecha, cerrado, cerrado_por, cerrado_at) VALUES (?, ?, ?, ?, ?)',
        [areaId, hoy, c.cerrado ? 1 : 0, c.cerrado_por || '', c.cerrado_at || '']
      )
    }
  } catch {}
}

/**
 * Consulta local (offline-first) si un área ya fue finalizada hoy, para
 * bloquear el guardado/edición de pesadas. Se apoya en la copia sincronizada
 * por sincronizarCierresHoy() — si nunca sincronizó, asume que no está
 * cerrada (no debe bloquear por falta de señal).
 */
export async function estaAreaCerradaHoy(areaId: string): Promise<boolean> {
  if (!areaId) return false
  try {
    const db = getDatabase()
    const hoy = hoyLocalISO()
    const row = await db.getFirstAsync<{ cerrado: number }>(
      'SELECT cerrado FROM inv_cierres_cache WHERE area_id = ? AND fecha = ?',
      [areaId, hoy]
    )
    return !!row && row.cerrado === 1
  } catch {
    return false
  }
}

export async function sincronizar(): Promise<{ ok: boolean; mensaje: string }> {
  try {
    const db = getDatabase()

    const registrosPendientes = await db.getAllAsync<any>(
      "SELECT * FROM inv_registros WHERE synced = 0"
    )

    if (registrosPendientes.length > 0) {
      const registrosParaSync = registrosPendientes.map(r => ({
        ...r,
        synced: undefined,
      }))

      await syncRegistros(registrosParaSync)

      for (const reg of registrosPendientes) {
        const fotos = await db.getAllAsync<any>(
          'SELECT * FROM inv_fotos WHERE registro_id = ?',
          [reg.id]
        )
        await syncFotos(fotos)
      }

      const ids = registrosPendientes.map(r => r.id)
      for (const id of ids) {
        await db.runAsync('UPDATE inv_registros SET synced = 1 WHERE id = ?', [id])
      }
    }

    // Fotos cuyo archivo nunca se logró subir (la subida inmediata falló o
    // no había señal) — se reintentan aquí, sin importar si su registro ya
    // estaba sincronizado.
    const fotosSinSubir = await db.getAllAsync<any>(
      "SELECT * FROM inv_fotos WHERE url = '' OR url IS NULL"
    )
    let fotosSubidas = 0
    for (const foto of fotosSinSubir) {
      const url = await subirFotoStorage(foto.id, foto.path_local)
      if (url) {
        await db.runAsync('UPDATE inv_fotos SET url = ? WHERE id = ?', [url, foto.id])
        await syncFotos([{ ...foto, url }])
        fotosSubidas++
      }
    }

    if (registrosPendientes.length === 0 && fotosSubidas === 0) {
      return { ok: true, mensaje: 'Todo sincronizado' }
    }

    const partes: string[] = []
    if (registrosPendientes.length > 0) partes.push(`${registrosPendientes.length} registro(s)`)
    if (fotosSubidas > 0) partes.push(`${fotosSubidas} foto(s)`)
    return { ok: true, mensaje: `${partes.join(' y ')} sincronizado(s)` }
  } catch (error: any) {
    return { ok: false, mensaje: error?.message || 'Error de sincronización' }
  }
}
