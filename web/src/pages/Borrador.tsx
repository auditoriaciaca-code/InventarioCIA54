import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { nombreArea } from '../constants/areas'
import { useAreas } from '../lib/useAreas'
import { hoyLocalISO, rangoDelDia, formatoFechaLarga } from '../lib/fechas'
import { agruparPorReferencia, generarXls, descargarXls } from '../lib/plantillaExcel'
import type { RegistroPesada } from '../types'

export default function Borrador() {
  const areas = useAreas()
  const [fecha, setFecha] = useState(hoyLocalISO())
  const [areaId, setAreaId] = useState('')
  const [registros, setRegistros] = useState<RegistroPesada[]>([])
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
      .order('created_at', { ascending: true })

    if (areaId) query = query.eq('area_id', areaId)

    query.then(({ data, error }) => {
      if (!activo) return
      if (!error && data) setRegistros(data as RegistroPesada[])
      setCargando(false)
    })

    return () => {
      activo = false
    }
  }, [fecha, areaId])

  const grupos = useMemo(() => agruparPorReferencia(registros), [registros])
  const totalNeto = useMemo(() => grupos.reduce((s, g) => s + g.pesos.reduce((a, b) => a + b, 0), 0), [grupos])
  const operadores = useMemo(() => {
    const nombres = Array.from(new Set(registros.map(r => r.created_by).filter(Boolean))) as string[]
    return nombres.length > 0 ? nombres.join(', ') : '—'
  }, [registros])
  const zona = areaId ? nombreArea(areaId) : 'Todas las áreas'

  function handleDescargar() {
    const xls = generarXls({
      fecha: new Date(`${fecha}T12:00:00`),
      operadores,
      area: zona,
      grupos,
    })
    descargarXls(xls, `inventario_${fecha}${areaId ? '_' + areaId : ''}.xls`)
  }

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
        <button className="btn-primario" onClick={handleDescargar} disabled={cargando || registros.length === 0}>
          📥 Generar Excel definitivo
        </button>
      </div>

      <p className="ayuda">
        Vista previa de cómo quedará la plantilla. Nada se descarga ni se comparte hasta que
        presiones «Generar Excel definitivo».
      </p>

      <div className="hoja-preview">
        <div className="hoja-fila hoja-cabecera">
          <span>DÍA {new Date(`${fecha}T12:00:00`).getDate()}</span>
          <span>MES {new Date(`${fecha}T12:00:00`).getMonth() + 1}</span>
          <span>AÑO {new Date(`${fecha}T12:00:00`).getFullYear()}</span>
          <span className="hoja-consecutivo">CONSECUTIVO No. 001</span>
        </div>
        <div className="hoja-fila">BODEGA _____________</div>
        <div className="hoja-fila">
          <span>REALIZADO POR: {operadores}</span>
          <span>GRUPO No.</span>
        </div>
        <div className="hoja-fila">
          <span>RESPONSABLE DEL ÁREA: ______________</span>
          <span>ZONA: {zona}</span>
        </div>

        <div className="hoja-tabla-wrap">
          <table className="hoja-tabla">
            <thead>
              <tr>
                <th>CODIGO</th>
                <th>MATERIALES</th>
                {Array.from({ length: 13 }, (_, i) => (
                  <th key={i}>P{i + 1}</th>
                ))}
                <th>P NETO</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(grupo =>
                Array.from({ length: Math.max(1, Math.ceil(grupo.pesos.length / 13)) }, (_, bloque) => {
                  const start = bloque * 13
                  const slice = grupo.pesos.slice(start, start + 13)
                  const rowSum = slice.reduce((a, b) => a + b, 0)
                  return (
                    <tr key={`${grupo.codigo}-${bloque}`}>
                      <td>{grupo.codigo}</td>
                      <td className="celda-desc">{grupo.desc}</td>
                      {Array.from({ length: 13 }, (_, i) => (
                        <td key={i} className="celda-num">
                          {slice[i] !== undefined ? slice[i].toFixed(1) : ''}
                        </td>
                      ))}
                      <td className="celda-neto">{rowSum.toFixed(1)}</td>
                    </tr>
                  )
                })
              )}
              {grupos.length === 0 && (
                <tr>
                  <td colSpan={16} className="vacio">
                    Sin pesadas para {formatoFechaLarga(fecha)}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="hoja-total">TOTAL RECIBIDO: {totalNeto.toFixed(2)} kg</div>

        <div className="hoja-firmas">
          {['ENTREGÓ:', 'ELABORÓ:', 'SISTEMATIZÓ:', 'CONTABILIZÓ:'].map(f => (
            <div key={f} className="firma-linea">
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
