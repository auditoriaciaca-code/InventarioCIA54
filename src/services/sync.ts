import { getDatabase } from './database'
import { syncRegistros, syncFotos, subirRegistroInmediato, obtenerLotesPorArea, subirFotoStorage } from './supabase'

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
