import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AREAS, nombreArea } from '../constants/areas'
import { CATEGORIA_MAP } from '../constants/materiales'
import { formatDescripcion } from '../lib/format'
import { hoyLocalISO, rangoDelDia, formatoHora } from '../lib/fechas'
import type { Comparacion } from '../types'

function nombreCorto(materialId: string, referenciaCodigo: string): string {
  if (!referenciaCodigo) return '—'
  const categoria = CATEGORIA_MAP.get(materialId)
  const ref = categoria?.referencias.find(r => r.codigo === referenciaCodigo)
  return ref ? formatDescripcion(ref.descripcion) : referenciaCodigo
}

export default function DobleConteo() {
  const [fecha, setFecha] = useState(hoyLocalISO())
  const [areaId, setAreaId] = useState('')
  const [mostrarAnuladas, setMostrarAnuladas] = useState(false)
  const [comparaciones, setComparaciones] = useState<Comparacion[]>([])
  const [conectado, setConectado] = useState(false)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    setCargando(true)
    const { inicio, fin } = rangoDelDia(fecha)

    let query = supabase
      .from('inv_comparaciones')
      .select('*')
      .gte('created_at', inicio)
      .lte('created_at', fin)
      .order('created_at', { ascending: false })

    if (areaId) query = query.eq('area_id', areaId)

    query.then(({ data, error }) => {
      if (!activo) return
      if (!error && data) setComparaciones(data as Comparacion[])
      setCargando(false)
    })

    const canal = supabase
      .channel(`doble-conteo-${fecha}-${areaId || 'todas'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inv_comparaciones' },
        payload => {
          const c = payload.new as Comparacion
          const dentroDelDia = c.created_at >= inicio && c.created_at <= fin
          const coincideArea = !areaId || c.area_id === areaId
          if (dentroDelDia && coincideArea) {
            setComparaciones(prev => [c, ...prev.filter(p => p.id !== c.id)])
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inv_comparaciones' },
        payload => {
          const c = payload.new as Comparacion
          setComparaciones(prev => (prev.some(p => p.id === c.id) ? prev.map(p => (p.id === c.id ? c : p)) : prev))
        }
      )
      .subscribe(status => setConectado(status === 'SUBSCRIBED'))

    return () => {
      activo = false
      supabase.removeChannel(canal)
    }
  }, [fecha, areaId])

  const visibles = useMemo(
    () => comparaciones.filter(c => mostrarAnuladas || c.estado !== 'anulada'),
    [comparaciones, mostrarAnuladas]
  )
  const alertas = useMemo(() => visibles.filter(c => c.estado === 'alerta'), [visibles])
  const ok = useMemo(() => visibles.filter(c => c.estado === 'ok'), [visibles])

  return (
    <div className="page">
      <div className="filtros">
        <label>
          Fecha
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </label>
        <label>
          Área
          <select value={areaId} onChange={e => setAreaId(e.target.value)}>
            <option value="">Todas</option>
            {AREAS.map(a => (
              <option key={a.id} value={a.id}>
                {a.icono} {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={mostrarAnuladas} onChange={e => setMostrarAnuladas(e.target.checked)} />
          Mostrar corregidas
        </label>
        <span className={`estado ${conectado ? 'ok' : 'off'}`}>
          {conectado ? '🟢 En vivo' : '🔴 Conectando…'}
        </span>
      </div>

      <div className="resumen-cards">
        <div className="card-mini">
          <span className="card-mini-label">Comparaciones</span>
          <span className="card-mini-value">{visibles.length}</span>
        </div>
        <div className="card-mini card-mini-alerta">
          <span className="card-mini-label">⚠️ Con diferencia</span>
          <span className="card-mini-value">{alertas.length}</span>
        </div>
        <div className="card-mini card-mini-ok">
          <span className="card-mini-label">✅ Coinciden</span>
          <span className="card-mini-value">{ok.length}</span>
        </div>
      </div>

      <div className="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Área</th>
              <th>Operador A</th>
              <th>Peso A</th>
              <th>Operador B</th>
              <th>Peso B</th>
              <th>Referencia</th>
              <th>Diferencia</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(c => (
              <tr key={c.id} className={`fila-${c.estado}`}>
                <td>{formatoHora(c.actualizado_at || c.created_at)}</td>
                <td>{nombreArea(c.area_id)}</td>
                <td>{c.operador_a || '—'}</td>
                <td>{c.peso_a.toFixed(2)}</td>
                <td>{c.operador_b || '—'}</td>
                <td>{c.peso_b.toFixed(2)}</td>
                <td>
                  {nombreCorto(c.material_id, c.referencia_a)}
                  {!c.misma_referencia && (
                    <span className="badge-distinta"> ≠ {nombreCorto(c.material_id, c.referencia_b)}</span>
                  )}
                </td>
                <td className="neto">{c.diferencia.toFixed(2)} kg</td>
                <td>
                  <span className={`badge-estado badge-${c.estado}`}>
                    {c.estado === 'alerta' ? '⚠️ Alerta' : c.estado === 'ok' ? '✅ OK' : '🔄 Corregida'}
                  </span>
                </td>
              </tr>
            ))}
            {!cargando && visibles.length === 0 && (
              <tr>
                <td colSpan={9} className="vacio">
                  Sin comparaciones registradas para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {cargando && <div className="cargando">Cargando…</div>}
      </div>
    </div>
  )
}
