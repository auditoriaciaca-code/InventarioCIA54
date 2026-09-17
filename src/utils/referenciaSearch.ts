import { CATEGORIAS } from '../constants/materiales'
import { ReferenciaFlat } from '../types'

const REFERENCIAS_FLAT: ReferenciaFlat[] = CATEGORIAS.flatMap(c =>
  c.referencias.map(r => ({
    categoriaId: c.id,
    categoriaNombre: c.nombre,
    icono: c.icono,
    color: c.color,
    codigo: r.codigo,
    descripcion: r.descripcion,
  }))
)

const DIACRITICOS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')

export function normalizarTexto(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .replace(/\bN[°ºO]?\.?\s*(?=\d)/g, 'NO ')
    .replace(/\bNRO\.?\s*(?=\d)/g, 'NO ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface IndexedReferencia extends ReferenciaFlat {
  searchText: string
}

const INDEX: IndexedReferencia[] = REFERENCIAS_FLAT.map(r => ({
  ...r,
  searchText: normalizarTexto(`${r.codigo} ${r.descripcion}`),
}))

const CODIGO_MAP = new Map(REFERENCIAS_FLAT.map(r => [r.codigo, r]))

function buscarConPuntaje(query: string): { ref: ReferenciaFlat; score: number }[] {
  const qNorm = normalizarTexto(query)
  if (qNorm.length < 2) return []

  const tokens = qNorm.split(' ').filter(Boolean)
  const queryTrim = query.trim()
  const scored: { ref: ReferenciaFlat; score: number }[] = []

  for (const entry of INDEX) {
    if (!tokens.every(t => entry.searchText.includes(t))) continue

    let score = 100 + 10 * tokens.length
    if (queryTrim === entry.codigo) score += 1000
    if (entry.searchText.startsWith(qNorm)) score += 500
    else if (entry.searchText.includes(qNorm)) score += 200

    scored.push({ ref: entry, score })
  }

  scored.sort((a, b) => b.score - a.score || a.ref.descripcion.length - b.ref.descripcion.length)
  return scored
}

/** Referencias que coinciden con la búsqueda, ordenadas por relevancia. */
export function buscarReferencias(query: string, limit = 8): ReferenciaFlat[] {
  return buscarConPuntaje(query).slice(0, limit).map(s => s.ref)
}

/**
 * Devuelve la referencia más probable, o null si no hay ninguna coincidencia
 * clara (por ejemplo, si dos referencias empatan en relevancia) — mejor pedir
 * que se corrija a mano que adivinar mal el material.
 */
export function encontrarMejorReferencia(query: string): ReferenciaFlat | null {
  const scored = buscarConPuntaje(query)
  if (scored.length === 0) return null
  if (scored.length === 1) return scored[0].ref
  if (scored[0].score === scored[1].score) return null
  return scored[0].ref
}

/**
 * Lookup exacto por código. Solo aplica a textos de puros dígitos con 5+
 * caracteres — todos los códigos del catálogo tienen 5-6 dígitos, mientras
 * que los pesos que lee el OCR de la báscula van de 1 a 4 dígitos (ver
 * AGENTS.md), así que esto evita confundir un peso con un código real.
 */
export function buscarPorCodigoExacto(texto: string): ReferenciaFlat | null {
  const trimmed = texto.trim()
  if (!/^\d{5,}$/.test(trimmed)) return null
  return CODIGO_MAP.get(trimmed) || null
}
