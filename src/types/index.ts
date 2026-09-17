export interface Material {
  id: string
  nombre: string
  codigo: string
  icono: string
  color: string
}

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

export interface Sesion {
  id: string
  nombre_operador: string
  area_id?: string
  fecha: string
  activa: number
  created_at: string
  liberada_at?: string | null
  total_registros?: number
  total_neto?: number
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
  synced: boolean
}

export interface Lote {
  id: string
  codigo: string
  area_id: string
  estado: 'pendiente' | 'pesado'
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

export interface ReferenciaFlat {
  categoriaId: string
  categoriaNombre: string
  icono: string
  color: string
  codigo: string
  descripcion: string
}

export interface ChatPendingMessage {
  localId: string
  textoOriginal: string
  createdAt: string
  fotoUris?: string[]
  pesoBrutoDetectado?: number
  taraOverrideDetectado?: number
  loteCodigo?: string
}

export type ChatListItem =
  | { kind: 'registro'; key: string; createdAt: string; registro: RegistroPesada }
  | { kind: 'pending'; key: string; createdAt: string; pending: ChatPendingMessage }
  | { kind: 'system'; key: string; createdAt: string; texto: string }

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
