import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { AREAS, actualizarAreas } from '../constants/areas'
import type { Area } from '../types'

async function refrescar(): Promise<Area[] | null> {
  const { data, error } = await supabase.from('inv_areas').select('id, nombre, icono, orden').order('orden', { ascending: true })
  if (error || !data) return null
  actualizarAreas(data)
  return AREAS
}

/** Catálogo de áreas en vivo — se actualiza solo si alguien crea una nueva desde el celular. */
export function useAreas(): Area[] {
  const [areas, setAreas] = useState<Area[]>(AREAS)

  useEffect(() => {
    let activo = true
    refrescar().then(nuevas => {
      if (activo && nuevas) setAreas(nuevas)
    })

    const canal = supabase
      .channel('areas-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inv_areas' }, () => {
        refrescar().then(nuevas => {
          if (activo && nuevas) setAreas(nuevas)
        })
      })
      .subscribe()

    return () => {
      activo = false
      supabase.removeChannel(canal)
    }
  }, [])

  return areas
}
