export interface Referencia {
  codigo: string
  descripcion: string
}

export interface Categoria {
  id: string
  nombre: string
  icono: string
  color: string
  referencias: Referencia[]
}

export interface RegistroPesada {
  id: string
  sesion_id: string
  area_id?: string
  material_id: string
  referencia_codigo: string
  referencia_descripcion: string
  contenedor: string
  tara: number
  peso_bruto: number
  peso_neto: number
  observaciones: string
  codigo_barras?: string
  lote_codigo?: string
  fotos_count: number
  created_at: string
  created_by?: string
}

export interface Lote {
  id: string
  codigo: string
  area_id: string
  estado: 'pendiente' | 'pesado'
  registro_id?: string | null
  cargado_at: string
  pesado_at?: string | null
}

export interface Foto {
  id: string
  registro_id: string
  url: string
  orden: number
}

export interface Area {
  id: string
  nombre: string
  icono: string
  color: string
}

export interface Comparacion {
  id: string
  area_id: string
  material_id: string
  registro_a_id: string
  registro_b_id: string
  sesion_a_id: string
  sesion_b_id: string
  operador_a: string
  operador_b: string
  referencia_a: string
  referencia_b: string
  misma_referencia: boolean
  peso_a: number
  peso_b: number
  diferencia: number
  tolerancia: number
  estado: 'ok' | 'alerta' | 'anulada'
  created_at: string
  actualizado_at?: string
}
