import { buscarPorCodigoExacto, encontrarMejorReferencia } from './referenciaSearch'
import { Referencia } from '../types'

export type ParsedMensaje =
  | { tipo: 'peso'; pesoBruto: number; taraOverride?: number }
  | { tipo: 'referencia'; referencia: Referencia; categoriaId: string; pesoBruto?: number; taraOverride?: number }
  | { tipo: 'sin_match'; textoOriginal: string; pesoBrutoDetectado?: number; taraOverrideDetectado?: number }

/**
 * Interpreta un mensaje del chat rápido. Nunca descarta información en
 * silencio: si no se puede resolver a un peso o una referencia, devuelve
 * 'sin_match' conservando lo que sí se haya detectado (peso/tara) para que
 * la pantalla lo ofrezca en la corrección manual.
 */
export function parseMensaje(textoOriginal: string): ParsedMensaje {
  const texto = textoOriginal.trim()

  // Un código completo (5+ dígitos) siempre es un cambio de referencia, nunca un peso.
  const codigoDirecto = buscarPorCodigoExacto(texto)
  if (codigoDirecto) {
    return {
      tipo: 'referencia',
      referencia: { codigo: codigoDirecto.codigo, descripcion: codigoDirecto.descripcion },
      categoriaId: codigoDirecto.categoriaId,
    }
  }

  // Override de tara: "t2", "T 2.5", etc.
  const taraMatch = texto.match(/\bt\.?\s*(\d+(?:[.,]\d+)?)\b/i)
  const taraOverride = taraMatch ? parseFloat(taraMatch[1].replace(',', '.')) : undefined
  const sinTara = taraMatch
    ? (texto.slice(0, taraMatch.index!) + texto.slice(taraMatch.index! + taraMatch[0].length)).trim()
    : texto

  // Número suelto delimitado por espacios/inicio/fin = peso candidato.
  const numMatch = sinTara.match(/(?:^|\s)(\d+(?:[.,]\d+)?)(?=\s|$)/)
  const pesoBruto = numMatch ? parseFloat(numMatch[1].replace(',', '.')) : undefined
  const resto = numMatch
    ? (sinTara.slice(0, numMatch.index!) + sinTara.slice(numMatch.index! + numMatch[0].length)).trim()
    : sinTara.trim()

  // Solo un número (nada de texto alrededor) => usa la referencia activa.
  if (pesoBruto !== undefined && resto === '') {
    return { tipo: 'peso', pesoBruto, taraOverride }
  }

  // Queda texto: intentar resolverlo a una referencia (sin el número de peso,
  // para no exigir que el peso también aparezca dentro de la descripción).
  if (resto !== '') {
    const match = encontrarMejorReferencia(resto)
    if (match) {
      return {
        tipo: 'referencia',
        referencia: { codigo: match.codigo, descripcion: match.descripcion },
        categoriaId: match.categoriaId,
        pesoBruto,
        taraOverride,
      }
    }
  }

  return {
    tipo: 'sin_match',
    textoOriginal,
    pesoBrutoDetectado: pesoBruto,
    taraOverrideDetectado: taraOverride,
  }
}
