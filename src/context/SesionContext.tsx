import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { Sesion } from '../types'
import { getDatabase } from '../services/database'
import { subirSesionInmediato, liberarSesionInmediato } from '../services/supabase'
import { randomUUID } from 'expo-crypto'
import { hoyLocalISO } from '../utils/fechas'

interface SesionContextType {
  sesion: Sesion | null
  sesiones: Sesion[]
  mostrarSelector: boolean
  abrirSelector: () => void
  ocultarSelector: () => void
  crearSesion: (nombre: string, areaId: string) => Promise<Sesion>
  seleccionarSesion: (s: Sesion) => Promise<void>
  salirSesion: () => Promise<boolean>
  recargarSesiones: () => Promise<void>
}

const SesionContext = createContext<SesionContextType>({
  sesion: null,
  sesiones: [],
  mostrarSelector: true,
  abrirSelector: () => {},
  ocultarSelector: () => {},
  crearSesion: async () => ({ id: '', nombre_operador: '', area_id: '', fecha: '', activa: 1, created_at: '' }),
  seleccionarSesion: async () => {},
  salirSesion: async () => false,
  recargarSesiones: async () => {},
})

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [sesiones, setSesiones] = useState<Sesion[]>([])
  const [mostrarSelector, setMostrarSelector] = useState(true)

  function abrirSelector() { setMostrarSelector(true) }
  function ocultarSelector() { setMostrarSelector(false) }

  /**
   * Libera una sesión y, si falla por falta de señal, la deja marcada
   * localmente como "pendiente de liberar" para que
   * reintentarLiberacionesPendientes() (sync.ts) la reintente después. Sin
   * esto, un cambio de área con mala señal dejaba la sala anterior abierta
   * para siempre sin ninguna segunda oportunidad — así se acumulaban varias
   * sesiones "fantasma" del mismo celular en distintas áreas.
   */
  async function liberarConReintento(sesionId: string): Promise<boolean> {
    const ok = await liberarSesionInmediato(sesionId)
    if (!ok) {
      try {
        await getDatabase().runAsync('UPDATE inv_sesiones SET pendiente_liberar = 1 WHERE id = ?', [sesionId])
      } catch {}
    }
    return ok
  }

  useEffect(() => {
    recargarSesiones()
  }, [])

  async function recargarSesiones() {
    try {
      const db = getDatabase()
      const rows = await db.getAllAsync<any>(
        `SELECT s.*, 
          (SELECT COUNT(*) FROM inv_registros WHERE sesion_id = s.id) as total_registros,
          (SELECT COALESCE(SUM(peso_neto), 0) FROM inv_registros WHERE sesion_id = s.id) as total_neto
         FROM inv_sesiones s ORDER BY s.created_at DESC`
      )
      setSesiones(rows)

      const activa = rows.find((r: any) => r.activa === 1)
      if (activa) {
        const esDeHoy = String(activa.fecha || activa.created_at || '').slice(0, 10) === hoyLocalISO()
        if (esDeHoy) {
          setSesion(activa)
          // Si ya hay una sesión activa de HOY guardada en el teléfono (ej.
          // tras un reload de la app), no tapar la pantalla con el
          // selector — que retome el inventario directo. El botón del
          // header sigue disponible para cambiar de sala manualmente.
          setMostrarSelector(false)
        }
        // Si la última sesión activa es de un día anterior, NO se retoma
        // sola — se deja ver el lobby para confirmar quién es hoy. Esto
        // evita que un celular reutilizado días después (u otra persona
        // usando el mismo teléfono) quede "disfrazado" con el nombre de
        // quien lo usó la última vez, sin darse cuenta.
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function crearSesion(nombre: string, areaId: string): Promise<Sesion> {
    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()

    // Si venías de otra área, libera esa sesión sola — nadie puede estar
    // físicamente en 2 áreas a la vez. Best-effort: si falla por falta de
    // señal, no bloquea entrar a la nueva área (queda marcada pendiente y
    // se reintenta sola, ver liberarConReintento).
    if (sesion && sesion.area_id !== areaId) {
      liberarConReintento(sesion.id)
    }

    await db.runAsync(
      'UPDATE inv_sesiones SET activa = 0 WHERE activa = 1'
    )

    await db.runAsync(
      'INSERT INTO inv_sesiones (id, nombre_operador, area_id, fecha, activa, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      [id, nombre, areaId, now, now]
    )

    const nueva: Sesion = {
      id, nombre_operador: nombre, area_id: areaId, fecha: now,
      activa: 1, created_at: now,
      total_registros: 0, total_neto: 0,
    }

    // Best-effort, sin bloquear la creación de la sesión: si falla por falta
    // de señal (frecuente en áreas como Cargue), queda synced=0 y
    // reintentarSesionesPendientes() (sync.ts) la reintenta después — antes
    // no había segunda oportunidad y la sesión quedaba invisible para
    // siempre en el lobby de otros celulares.
    subirSesionInmediato({ id, nombre_operador: nombre, area_id: areaId, fecha: now, activa: 1, created_at: now })
      .then(ok => {
        if (ok) db.runAsync('UPDATE inv_sesiones SET synced = 1 WHERE id = ?', [id]).catch(() => {})
      })

    setSesion(nueva)
    await recargarSesiones()
    return nueva
  }

  async function seleccionarSesion(s: Sesion) {
    // Mismo caso que en crearSesion: si cambiaste de área, libera la sala
    // anterior sola (best-effort, con reintento si falla).
    if (sesion && sesion.id !== s.id && sesion.area_id !== s.area_id) {
      liberarConReintento(sesion.id)
    }

    const db = getDatabase()
    await db.runAsync('UPDATE inv_sesiones SET activa = 0 WHERE activa = 1')
    await db.runAsync('UPDATE inv_sesiones SET activa = 1 WHERE id = ?', [s.id])
    setSesion({ ...s, activa: 1 })
    await recargarSesiones()
  }

  /**
   * Libera el candado de la sesión actual (botón "Salir"). Si falla por
   * falta de señal, NO cierra la sesión localmente — así la sala nunca
   * queda bloqueada para los demás sin que el operador se entere. Además
   * queda marcada pendiente para reintentarse sola más tarde, por si el
   * operador no vuelve a intentar "Salir" manualmente.
   */
  async function salirSesion(): Promise<boolean> {
    if (!sesion) return true
    const ok = await liberarConReintento(sesion.id)
    if (!ok) return false

    const db = getDatabase()
    await db.runAsync('UPDATE inv_sesiones SET activa = 0 WHERE id = ?', [sesion.id])
    setSesion(null)
    await recargarSesiones()
    return true
  }

  return (
    <SesionContext.Provider value={{ sesion, sesiones, mostrarSelector, abrirSelector, ocultarSelector, crearSesion, seleccionarSesion, salirSesion, recargarSesiones }}>
      {children}
    </SesionContext.Provider>
  )
}

export const useSesion = () => useContext(SesionContext)
