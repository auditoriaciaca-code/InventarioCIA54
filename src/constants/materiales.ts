import { Material } from '../types'

export const MATERIALES: Material[] = [
  { id: 'cobre', nombre: 'Cobre', codigo: 'CB-001', icono: '🟤', color: '#b87333' },
  { id: 'pote', nombre: 'Pote', codigo: 'PT-002', icono: '⚪', color: '#95a5a6' },
  { id: 'aluminio', nombre: 'Aluminio', codigo: 'AL-003', icono: '⚙️', color: '#bdc3c7' },
  { id: 'bronce', nombre: 'Bronce', codigo: 'BR-004', icono: '🟠', color: '#cd7f32' },
  { id: 'laton', nombre: 'Latón', codigo: 'LT-005', icono: '🟡', color: '#d4af37' },
  { id: 'acero', nombre: 'Acero', codigo: 'AC-006', icono: '⚫', color: '#7f8c8d' },
]

export const MATERIAL_MAP = new Map(MATERIALES.map(m => [m.id, m]))
