import { getDatabase } from './database'
import { syncRegistros, syncFotos } from './supabase'

export async function sincronizar(): Promise<{ ok: boolean; mensaje: string }> {
  try {
    const db = getDatabase()

    const registrosPendientes = await db.getAllAsync<any>(
      "SELECT * FROM inv_registros WHERE synced = 0"
    )

    if (registrosPendientes.length === 0) {
      return { ok: true, mensaje: 'Todo sincronizado' }
    }

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

    return { ok: true, mensaje: `${registrosPendientes.length} registro(s) sincronizado(s)` }
  } catch (error: any) {
    return { ok: false, mensaje: error?.message || 'Error de sincronización' }
  }
}
