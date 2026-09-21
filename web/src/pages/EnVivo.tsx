import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { nombreArea } from '../constants/areas'
import { useAreas } from '../lib/useAreas'
import { MATERIAL_MAP } from '../constants/materiales'
import { hoyLocalISO, rangoDelDia, formatoHora, formatoFechaLarga } from '../lib/fechas'
import type { Foto, RegistroPesada } from '../types'

function mergeFoto(mapa: Map<string, Foto[]>, foto: Foto): Map<string, Foto[]> {
  if (!foto.url) return mapa
  const siguiente = new Map(mapa)
  const lista = (siguiente.get(foto.registro_id) || []).filter(f => f.id !== foto.id)
  lista.push(foto)
  lista.sort((a, b) => a.orden - b.orden)
  siguiente.set(foto.registro_id, lista)
  return siguiente
}

export default function EnVivo() {
  const areas = useAreas()
  const [fecha, setFecha] = useState(hoyLocalISO())
  const [areaId, setAreaId] = useState('')
  const [registros, setRegistros] = useState<RegistroPesada[]>([])
  const [fotosPorRegistro, setFotosPorRegistro] = useState<Map<string, Foto[]>>(new Map())
  const [conectado, setConectado] = useState(false)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    setCargando(true)
    const { inicio, fin } = rangoDelDia(fecha)

    let query = supabase
      .from('inv_registros')
      .select('*')
      .gte('created_at', inicio)
      .lte('created_at', fin)
      .order('created_at', { ascending: false })

    if (areaId) query = query.eq('area_id', areaId)

    query.then(({ data, error }) => {
      if (!activo) return
      if (!error && data) setRegistros(data as RegistroPesada[])
      setCargando(false)
    })

    const canal = supabase
      .channel(`envivo-${fecha}-${areaId || 'todas'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inv_registros' },
        payload => {
          const r = payload.new as RegistroPesada
          const dentroDelDia = r.created_at >= inicio && r.created_at <= fin
          const coincideArea = !areaId || r.area_id === areaId
          if (dentroDelDia && coincideArea) {
            setRegistros(prev => [r, ...prev.filter(p => p.id !== r.id)])
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inv_fotos' },
        payload => setFotosPorRegistro(prev => mergeFoto(prev, payload.new as Foto))
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inv_fotos' },
        payload => setFotosPorRegistro(prev => mergeFoto(prev, payload.new as Foto))
      )
      .subscribe(status => setConectado(status === 'SUBSCRIBED'))

    return () => {
      activo = false
      supabase.removeChannel(canal)
    }
  }, [fecha, areaId])

  useEffect(() => {
    const ids = registros.filter(r => r.fotos_count > 0).map(r => r.id)
    if (ids.length === 0) {
      setFotosPorRegistro(new Map())
      return
    }
    let activo = true
    supabase
      .from('inv_fotos')
      .select('id, registro_id, url, orden')
      .in('registro_id', ids)
      .neq('url', '')
      .order('orden', { ascending: true })
      .then(({ data, error }) => {
        if (!activo || error || !data) return
        const mapa = new Map<string, Foto[]>()
        for (const f of data as Foto[]) {
          const lista = mapa.get(f.registro_id) || []
          lista.push(f)
          mapa.set(f.registro_id, lista)
        }
        setFotosPorRegistro(mapa)
      })
    return () => {
      activo = false
    }
  }, [registros])

  const totalNeto = useMemo(() => registros.reduce((s, r) => s + (r.peso_bruto - r.tara), 0), [registros])

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
            {areas.map(a => (
              <option key={a.id} value={a.id}>
                {a.icono} {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <span className={`estado ${conectado ? 'ok' : 'off'}`}>
          {conectado ? '🟢 En vivo' : '🔴 Conectando…'}
        </span>
      </div>

      <div className="resumen-cards">
        <div className="card-mini">
          <span className="card-mini-label">Fecha</span>
          <span className="card-mini-value cap">{formatoFechaLarga(fecha)}</span>
        </div>
        <div className="card-mini">
          <span className="card-mini-label">Pesadas</span>
          <span className="card-mini-value">{registros.length}</span>
        </div>
        <div className="card-mini">
          <span className="card-mini-label">Total neto</span>
          <span className="card-mini-value">{totalNeto.toFixed(2)} kg</span>
        </div>
      </div>

      <div className="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Área</th>
              <th>Operador</th>
              <th>Referencia</th>
              <th>Bruto</th>
              <th>Tara</th>
              <th>Neto</th>
              <th>Foto</th>
            </tr>
          </thead>
          <tbody>
            {registros.map(r => {
              const mat = MATERIAL_MAP.get(r.material_id)
              const fotos = fotosPorRegistro.get(r.id) || []
              return (
                <tr key={r.id}>
                  <td>{formatoHora(r.created_at)}</td>
                  <td>{nombreArea(r.area_id)}</td>
                  <td>{r.created_by || '—'}</td>
                  <td>
                    {mat?.icono || '📦'} {r.referencia_descripcion || r.referencia_codigo || mat?.nombre}
                  </td>
                  <td>{r.peso_bruto.toFixed(2)}</td>
                  <td>{r.tara.toFixed(2)}</td>
                  <td className="neto">{(r.peso_bruto - r.tara).toFixed(2)}</td>
                  <td>
                    {fotos.length > 0 ? (
                      <a href={fotos[0].url} target="_blank" rel="noreferrer" className="foto-link">
                        <img src={fotos[0].url} alt="Foto de la pesada" className="foto-thumb" />
                        {fotos.length > 1 && <span className="foto-badge">+{fotos.length - 1}</span>}
                      </a>
                    ) : r.fotos_count > 0 ? (
                      <span className="foto-pendiente" title="La foto aún no se ha subido desde el celular">⏳</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
            {!cargando && registros.length === 0 && (
              <tr>
                <td colSpan={8} className="vacio">
                  Sin pesadas registradas para este filtro.
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
