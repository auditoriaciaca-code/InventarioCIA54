import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hbgagxuuftlzehfxodmi.supabase.co'
const supabaseAnonKey = 'sb_publishable_bxb4q8QqWoK1-Pznovkk2g_If6FuR2r'

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
