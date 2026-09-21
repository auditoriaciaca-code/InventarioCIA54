export function hoyLocalISO(): string {
  const ahora = new Date()
  const offsetMs = ahora.getTimezoneOffset() * 60000
  return new Date(ahora.getTime() - offsetMs).toISOString().slice(0, 10)
}
