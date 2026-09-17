/**
 * Quita el prefijo "CHATARRA DE " de una descripción para mostrarla más
 * corta en pantalla. Es solo formato de visualización — el valor guardado
 * en la base de datos y el que sale en los reportes Excel/PDF conserva el
 * texto completo tal como está en el catálogo.
 */
export function formatDescripcion(descripcion: string): string {
  return descripcion.replace(/^CHATARRA DE\s+/i, '').trim()
}
