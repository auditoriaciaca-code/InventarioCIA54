export function hoyLocalISO(): string {
  const ahora = new Date()
  const offsetMs = ahora.getTimezoneOffset() * 60000
  return new Date(ahora.getTime() - offsetMs).toISOString().slice(0, 10)
}

export function rangoDelDia(fechaISO: string): { inicio: string; fin: string } {
  const inicio = new Date(`${fechaISO}T00:00:00`)
  const fin = new Date(`${fechaISO}T23:59:59.999`)
  return { inicio: inicio.toISOString(), fin: fin.toISOString() }
}

export function formatoHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatoFechaLarga(fechaISO: string): string {
  return new Date(`${fechaISO}T12:00:00`).toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
