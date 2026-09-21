import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAreas } from '../lib/useAreas'
import type { Lote } from '../types'

function parsearCodigos(texto: string): string[] {
  // Acepta CSV/TXT (coma) y pegado directo desde Excel (columnas separadas
  // por tabulador) — en ambos casos se toma solo la primera columna.
  const codigos = texto
    .split(/\r?\n/)
    .map(linea => linea.split(/[,\t]/)[0].trim().replace(/^"|"$/g, ''))
    .filter(c => c.length > 0)
  return Array.from(new Set(codigos))
}

export default function Lotes() {
  const areas = useAreas()
  const [areaId, setAreaId] = useState('')
  const [lotes, setLotes] = useState<Lote[]>([])
  const [conectado, setConectado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [pegadoVisible, setPegadoVisible] = useState(false)
  const [textoPegado, setTextoPegado] = useState('')
  const [excluidosPegado, setExcluidosPegado] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!areaId && areas.length > 0) setAreaId(areas[0].id)
  }, [areas, areaId])

  useEffect(() => {
    if (!areaId) return
    let activo = true
    setCargando(true)
    setMensaje(null)

    supabase
      .from('inv_lotes')
      .select('*')
      .eq('area_id', areaId)
      .order('cargado_at', { ascending: true })
      .then(({ data, error }) => {
        if (!activo) return
        if (!error && data) setLotes(data as Lote[])
        setCargando(false)
      })

    const canal = supabase
      .channel(`lotes-${areaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inv_lotes', filter: `area_id=eq.${areaId}` },
        payload => {
          const l = payload.new as Lote
          setLotes(prev => (prev.some(p => p.id === l.id) ? prev : [...prev, l]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inv_lotes', filter: `area_id=eq.${areaId}` },
        payload => {
          const l = payload.new as Lote
          setLotes(prev => prev.map(p => (p.id === l.id ? l : p)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'inv_lotes', filter: `area_id=eq.${areaId}` },
        payload => {
          const idBorrado = (payload.old as Lote).id
          setLotes(prev => prev.filter(p => p.id !== idBorrado))
        }
      )
      .subscribe(status => setConectado(status === 'SUBSCRIBED'))

    return () => {
      activo = false
      supabase.removeChannel(canal)
    }
  }, [areaId])

  const pendientes = useMemo(() => lotes.filter(l => l.estado === 'pendiente'), [lotes])
  const pesados = useMemo(() => lotes.filter(l => l.estado === 'pesado'), [lotes])
  const ordenados = useMemo(
    () => [...lotes].sort((a, b) => a.estado.localeCompare(b.estado) || a.codigo.localeCompare(b.codigo)),
    [lotes]
  )

  async function subirCodigos(codigos: string[]): Promise<boolean> {
    if (codigos.length === 0) {
      setMensaje('No hay códigos válidos para cargar.')
      return false
    }
    setSubiendo(true)
    setMensaje(null)
    try {
      const filas = codigos.map(codigo => ({ codigo, area_id: areaId, estado: 'pendiente' as const }))
      const { error } = await supabase
        .from('inv_lotes')
        .upsert(filas, { onConflict: 'area_id,codigo', ignoreDuplicates: true })
      if (error) {
        setMensaje(`Error al cargar: ${error.message}`)
        return false
      }
      setMensaje(`Se cargaron ${codigos.length} código(s). Los que ya existían no se modificaron.`)
      const { data } = await supabase.from('inv_lotes').select('*').eq('area_id', areaId).order('cargado_at', { ascending: true })
      if (data) setLotes(data as Lote[])
      return true
    } catch (e: any) {
      setMensaje(`Error al cargar: ${e?.message || e}`)
      return false
    } finally {
      setSubiendo(false)
    }
  }

  async function handleArchivo(file: File) {
    try {
      const texto = await file.text()
      await subirCodigos(parsearCodigos(texto))
    } catch (e: any) {
      setMensaje(`Error al leer el archivo: ${e?.message || e}`)
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const codigosPegados = useMemo(() => parsearCodigos(textoPegado), [textoPegado])
  const codigosAIncluir = useMemo(
    () => codigosPegados.filter(c => !excluidosPegado.has(c)),
    [codigosPegados, excluidosPegado]
  )

  function toggleExcluidoPegado(codigo: string) {
    setExcluidosPegado(prev => {
      const siguiente = new Set(prev)
      if (siguiente.has(codigo)) siguiente.delete(codigo)
      else siguiente.add(codigo)
      return siguiente
    })
  }

  async function handleSubirPegado() {
    const ok = await subirCodigos(codigosAIncluir)
    if (ok) {
      setTextoPegado('')
      setExcluidosPegado(new Set())
      setPegadoVisible(false)
    }
  }

  async function handleVaciar() {
    if (!confirm(`¿Vaciar toda la lista de lotes de esta área? Esto no se puede deshacer.`)) return
    const { error } = await supabase.from('inv_lotes').delete().eq('area_id', areaId)
    if (error) {
      setMensaje(`Error al vaciar: ${error.message}`)
      return
    }
    setLotes([])
    setMensaje('Lista vaciada.')
  }

  return (
    <div className="page">
      <div className="filtros">
        <label>
          Área
          <select value={areaId} onChange={e => setAreaId(e.target.value)}>
            {areas.map(a => (
              <option key={a.id} value={a.id}>
                {a.icono} {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cargar lista (.csv / .txt)
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt"
            disabled={subiendo}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleArchivo(file)
            }}
          />
        </label>
        <button className="btn-secundario" onClick={() => setPegadoVisible(v => !v)}>
          📋 Pegar desde Excel
        </button>
        <button className="btn-secundario" onClick={handleVaciar} disabled={lotes.length === 0}>
          🗑️ Vaciar lista
        </button>
        <span className={`estado ${conectado ? 'ok' : 'off'}`}>
          {conectado ? '🟢 En vivo' : '🔴 Conectando…'}
        </span>
      </div>

      {mensaje && <p className="ayuda">{mensaje}</p>}
      <p className="ayuda">
        Un código por línea (o primera columna si es CSV). Volver a cargar el mismo archivo no
        reinicia los lotes que ya fueron pesados.
      </p>

      {pegadoVisible && (
        <div className="pegado-card">
          <p className="ayuda">
            Selecciona la columna de lotes en Excel, cópiala (Ctrl+C) y pégala aquí (Ctrl+V).
          </p>
          <textarea
            className="pegado-textarea"
            placeholder="Pega aquí las celdas copiadas de Excel…"
            value={textoPegado}
            onChange={e => setTextoPegado(e.target.value)}
            rows={6}
          />

          {textoPegado.trim().length > 0 && (
            <div className="pegado-preview">
              <p className="ayuda">
                Vista previa — se van a cargar <strong>{codigosAIncluir.length}</strong> de{' '}
                {codigosPegados.length} código(s) detectado(s). Toca uno para excluirlo (ej. si es un
                encabezado como "LOTE" o algo que no corresponde).
              </p>
              <div className="pegado-chips">
                {codigosPegados.map(c => (
                  <span
                    key={c}
                    className={`pegado-chip${excluidosPegado.has(c) ? ' pegado-chip-excluido' : ''}`}
                    onClick={() => toggleExcluidoPegado(c)}
                  >
                    {c} {excluidosPegado.has(c) ? '↺' : '✕'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pegado-btns">
            <button
              className="btn-primario"
              onClick={handleSubirPegado}
              disabled={subiendo || codigosAIncluir.length === 0}
            >
              📥 Cargar {codigosAIncluir.length > 0 ? codigosAIncluir.length : ''} lote(s)
            </button>
            <button
              className="btn-secundario"
              onClick={() => {
                setTextoPegado('')
                setExcluidosPegado(new Set())
                setPegadoVisible(false)
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="resumen-cards">
        <div className="card-mini">
          <span className="card-mini-label">Total cargados</span>
          <span className="card-mini-value">{lotes.length}</span>
        </div>
        <div className="card-mini card-mini-alerta">
          <span className="card-mini-label">⏳ Pendientes</span>
          <span className="card-mini-value">{pendientes.length}</span>
        </div>
        <div className="card-mini card-mini-ok">
          <span className="card-mini-label">✅ Pesados</span>
          <span className="card-mini-value">{pesados.length}</span>
        </div>
      </div>

      <div className="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Código de lote</th>
              <th>Estado</th>
              <th>Cargado</th>
              <th>Pesado</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map(l => (
              <tr key={l.id} className={l.estado === 'pesado' ? 'fila-pesada' : ''}>
                <td>{l.codigo}</td>
                <td>
                  <span className={`badge-estado ${l.estado === 'pesado' ? 'badge-ok' : 'badge-alerta'}`}>
                    {l.estado === 'pesado' ? '✅ Pesado' : '⏳ Pendiente'}
                  </span>
                </td>
                <td>{new Date(l.cargado_at).toLocaleString('es-CO')}</td>
                <td>{l.pesado_at ? new Date(l.pesado_at).toLocaleString('es-CO') : '—'}</td>
              </tr>
            ))}
            {!cargando && ordenados.length === 0 && (
              <tr>
                <td colSpan={4} className="vacio">
                  Sin lotes cargados para esta área. Sube un archivo para empezar.
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
