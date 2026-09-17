/**
 * Quita el prefijo "CHATARRA DE " de una descripción para mostrarla más
 * corta — mismo criterio que usa la app móvil (src/utils/format.ts).
 */
export function formatDescripcion(descripcion: string): string {
  return descripcion.replace(/^CHATARRA DE\s+/i, '').trim()
}
