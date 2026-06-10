export interface Material {
  id: string
  nombre: string
  codigo: string
  icono: string
  color: string
}

export interface RegistroPesada {
  id: string
  material_id: string
  contenedor: string
  tara: number
  peso_bruto: number
  peso_neto: number
  observaciones: string
  fotos_count: number
  created_at: string
  created_by?: string
  synced: boolean
}

export interface Foto {
  id: string
  registro_id: string
  url: string
  path_local: string
  orden: number
}

export interface ResumenMaterial {
  material_id: string
  material_nombre: string
  material_icono: string
  total_neto: number
  cantidad: number
  porcentaje: number
}
