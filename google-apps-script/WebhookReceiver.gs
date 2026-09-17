/**
 * Receptor de webhooks de Supabase para el tablero del supervisor.
 * Ver google-apps-script/README.md para los pasos de despliegue.
 *
 * No se importa desde la app (Metro ignora .gs) — este archivo se pega
 * manualmente en script.google.com.
 */

// ==== CONFIGURACIÓN — completar antes de desplegar ====
const TOKEN = 'CAMBIAR_POR_UN_TOKEN_SECRETO'
const SHEET_ID = 'CAMBIAR_POR_EL_ID_DE_LA_HOJA'
const SUPABASE_URL = 'https://lkrjzpxzxurzjoswpeku.supabase.co'
const SUPABASE_KEY = 'sb_publishable_6cWubKMz8T6lJqVE6HadnA_MX47WHQz'
// ========================================================

const HOJA_REGISTROS = 'Registros'
const HOJA_COMPARACIONES = 'Comparaciones'
const HOJA_LOG = 'Log'

const AREAS = {
  produccion: 'Producción',
  cargue: 'Cargue',
  tarjeta: 'Tarjeta',
  descargue_sur: 'Descargue Sur',
  descargue_norte: 'Descargue Norte',
}

function areaNombre_(id) {
  return AREAS[id] || id || ''
}

function hoja_(nombre, encabezados) {
  const libro = SpreadsheetApp.openById(SHEET_ID)
  let hoja = libro.getSheetByName(nombre)
  if (!hoja) {
    hoja = libro.insertSheet(nombre)
    hoja.appendRow(encabezados)
    hoja.setFrozenRows(1)
  }
  return hoja
}

function idsExistentes_(hoja, colIndex) {
  const filas = hoja.getLastRow()
  if (filas < 2) return new Set()
  const valores = hoja.getRange(2, colIndex, filas - 1, 1).getValues()
  return new Set(valores.map(v => String(v[0])))
}

function anexarRegistro_(r) {
  const hoja = hoja_(HOJA_REGISTROS, [
    'Fecha', 'Área', 'Operador', 'Material', 'Referencia código',
    'Referencia descripción', 'Contenedor', 'Bruto', 'Tara', 'Neto', 'ID',
  ])
  const existentes = idsExistentes_(hoja, 11)
  if (existentes.has(String(r.id))) return
  hoja.appendRow([
    r.created_at, areaNombre_(r.area_id), r.created_by || '', r.material_id,
    r.referencia_codigo || '', r.referencia_descripcion || '', r.contenedor,
    r.peso_bruto, r.tara, r.peso_neto, r.id,
  ])
}

function anexarOActualizarComparacion_(c) {
  const hoja = hoja_(HOJA_COMPARACIONES, [
    'Fecha', 'Área', 'Operador A', 'Operador B', 'Material',
    'Referencia A', 'Referencia B', 'Peso A', 'Peso B', 'Diferencia', 'Estado', 'ID',
  ])
  const filas = hoja.getLastRow()
  let filaExistente = -1
  if (filas >= 2) {
    const ids = hoja.getRange(2, 12, filas - 1, 1).getValues()
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(c.id)) { filaExistente = i + 2; break }
    }
  }

  const valores = [
    c.created_at, areaNombre_(c.area_id), c.operador_a || '', c.operador_b || '',
    c.material_id, c.referencia_a || '', c.referencia_b || '',
    c.peso_a, c.peso_b, c.diferencia, c.estado, c.id,
  ]

  let numeroFila
  if (filaExistente > 0) {
    numeroFila = filaExistente
    hoja.getRange(numeroFila, 1, 1, valores.length).setValues([valores])
  } else {
    hoja.appendRow(valores)
    numeroFila = hoja.getLastRow()
  }

  const rango = hoja.getRange(numeroFila, 1, 1, valores.length)
  rango.setBackground(c.estado === 'alerta' ? '#f8d7da' : null)
  if (c.misma_referencia === false) {
    hoja.getRange(numeroFila, 6, 1, 2).setBackground('#fde3cf')
  }
}

function registrarError_(contexto, error) {
  try {
    const hoja = hoja_(HOJA_LOG, ['Fecha', 'Contexto', 'Error'])
    hoja.appendRow([new Date().toISOString(), contexto, String(error)])
  } catch (e) {
    // si ni el log funciona, no hay más que hacer
  }
}

function doPost(e) {
  try {
    if (!e || !e.parameter || e.parameter.token !== TOKEN) {
      return ContentService.createTextOutput('forbidden')
    }
    const body = JSON.parse(e.postData.contents)

    if (body.table === 'inv_registros' && body.type === 'INSERT') {
      anexarRegistro_(body.record)
    } else if (body.table === 'inv_comparaciones' && (body.type === 'INSERT' || body.type === 'UPDATE')) {
      anexarOActualizarComparacion_(body.record)
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON)
  } catch (error) {
    registrarError_('doPost', error)
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

/**
 * Respaldo: por si un webhook se pierde, esta función (con un trigger de
 * tiempo cada 1 minuto) vuelve a leer directamente de Supabase.
 */
function sincronizarDesdeSupabase() {
  const props = PropertiesService.getScriptProperties()
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  const inicioIso = inicio.toISOString()

  const cursorRegistros = props.getProperty('cursor_registros') || inicioIso
  const cursorComparaciones = props.getProperty('cursor_comparaciones') || inicioIso

  try {
    const registros = fetchSupabase_('inv_registros', cursorRegistros)
    registros.forEach(anexarRegistro_)
    if (registros.length > 0) {
      props.setProperty('cursor_registros', registros[registros.length - 1].created_at)
    }
  } catch (error) {
    registrarError_('sincronizarDesdeSupabase:registros', error)
  }

  try {
    const comparaciones = fetchSupabase_('inv_comparaciones', cursorComparaciones)
    comparaciones.forEach(anexarOActualizarComparacion_)
    if (comparaciones.length > 0) {
      props.setProperty('cursor_comparaciones', comparaciones[comparaciones.length - 1].created_at)
    }
  } catch (error) {
    registrarError_('sincronizarDesdeSupabase:comparaciones', error)
  }
}

function fetchSupabase_(tabla, desde) {
  const url = `${SUPABASE_URL}/rest/v1/${tabla}?select=*&created_at=gt.${encodeURIComponent(desde)}&order=created_at.asc&limit=500`
  const resp = UrlFetchApp.fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    muteHttpExceptions: true,
  })
  if (resp.getResponseCode() >= 300) throw new Error(`Supabase ${tabla}: ${resp.getContentText()}`)
  return JSON.parse(resp.getContentText())
}

/**
 * Ejecutar UNA vez manualmente desde el editor de Apps Script: crea las
 * pestañas con encabezados y programa el trigger de respaldo cada 1 minuto.
 */
function inicializar() {
  hoja_(HOJA_REGISTROS, [
    'Fecha', 'Área', 'Operador', 'Material', 'Referencia código',
    'Referencia descripción', 'Contenedor', 'Bruto', 'Tara', 'Neto', 'ID',
  ])
  hoja_(HOJA_COMPARACIONES, [
    'Fecha', 'Área', 'Operador A', 'Operador B', 'Material',
    'Referencia A', 'Referencia B', 'Peso A', 'Peso B', 'Diferencia', 'Estado', 'ID',
  ])
  hoja_(HOJA_LOG, ['Fecha', 'Contexto', 'Error'])

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sincronizarDesdeSupabase')
    .forEach(t => ScriptApp.deleteTrigger(t))

  ScriptApp.newTrigger('sincronizarDesdeSupabase').timeBased().everyMinutes(1).create()
}
