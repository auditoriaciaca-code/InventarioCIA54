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
  const [operadorActivo, setOperadorActivo] = useState<string | null>(null)

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

  const operadoresLista = useMemo(() => {
    const vistos = new Set<string>()
    const lista: string[] = []
    for (const r of registros) {
      if (r.created_by && !vistos.has(r.created_by)) {
        vistos.add(r.created_by)
        lista.push(r.created_by)
      }
    }
    return lista
  }, [registros])

  useEffect(() => {
    if (operadoresLista.length === 0) {
      setOperadorActivo(null)
    } else if (!operadorActivo || !operadoresLista.includes(operadorActivo)) {
      setOperadorActivo(operadoresLista[0])
    }
  }, [operadoresLista])

  const registrosOperador = useMemo(
    () => (operadorActivo ? registros.filter(r => r.created_by === operadorActivo) : []),
    [registros, operadorActivo]
  )

  const grupos = useMemo(() => agruparPorReferencia(registrosOperador), [registrosOperador])
  const totalNeto = useMemo(() => grupos.reduce((s, g) => s + g.pesos.reduce((a, b) => a + b, 0), 0), [grupos])
  const zona = areaId ? nombreArea(areaId) : 'Todas las áreas'

  function handleDescargar() {
    if (!operadorActivo) return
    const xls = generarXls({
      fecha: new Date(`${fecha}T12:00:00`),
      operadores: operadorActivo,
      area: zona,
      grupos,
    })
    descargarXls(xls, `inventario_${fecha}${areaId ? '_' + areaId : ''}_${operadorActivo}.xls`)
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
        <button className="btn-primario" onClick={handleDescargar} disabled={cargando || !operadorActivo}>
          📥 Generar Excel definitivo
        </button>
      </div>

      <p className="ayuda">
        Vista previa de cómo quedará la plantilla. Nada se descarga ni se comparte hasta que
        presiones «Generar Excel definitivo». Cada operador tiene su propia hoja — el doble conteo
        ciego queda separado, no mezclado.
      </p>

      {operadoresLista.length > 0 && (
        <div className="operador-tabs">
          {operadoresLista.map(op => (
            <button
              key={op}
              className={`operador-tab${op === operadorActivo ? ' active' : ''}`}
              onClick={() => setOperadorActivo(op)}
            >
              👤 {op}
            </button>
          ))}
        </div>
      )}

      <div className="hoja-preview">
        <div className="hoja-fila hoja-cabecera">
          <span>DÍA {new Date(`${fecha}T12:00:00`).getDate()}</span>
          <span>MES {new Date(`${fecha}T12:00:00`).getMonth() + 1}</span>
          <span>AÑO {new Date(`${fecha}T12:00:00`).getFullYear()}</span>
          <span className="hoja-consecutivo">CONSECUTIVO No. 001</span>
        </div>
        <div className="hoja-fila">BODEGA _____________</div>
        <div className="hoja-fila">
          <span>REALIZADO POR: {operadorActivo || '—'}</span>
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
