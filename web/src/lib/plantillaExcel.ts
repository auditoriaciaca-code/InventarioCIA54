import type { RegistroPesada } from '../types'

export interface GrupoReferencia {
  codigo: string
  desc: string
  pesos: number[]
}

export function agruparPorReferencia(registros: RegistroPesada[]): GrupoReferencia[] {
  const grouped = new Map<string, GrupoReferencia>()
  for (const r of registros) {
    const key = r.referencia_codigo || r.material_id
    if (!grouped.has(key)) {
      grouped.set(key, { codigo: key, desc: r.referencia_descripcion || key, pesos: [] })
    }
    grouped.get(key)!.pesos.push(r.peso_bruto - r.tara)
  }
  return Array.from(grouped.values())
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Genera el mismo formato XML Spreadsheet 2003 que usa la app móvil
 * (ResumenScreen.exportarExcel) para que el .xls descargado desde la web
 * sea idéntico al que generan los operadores en el celular.
 */
export function generarXls(params: {
  fecha: Date
  operadores: string
  area: string
  grupos: GrupoReferencia[]
}): string {
  const { fecha, operadores, area, grupos } = params
  const dia = fecha.getDate()
  const mes = fecha.getMonth() + 1
  const anio = fecha.getFullYear()

  let xls = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="Default"/>
  <Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1F4E79" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>
  <Style ss:ID="num"><Alignment ss:Horizontal="Center"/><NumberFormat ss:Format="#,##0"/></Style>
  <Style ss:ID="alt"><Interior ss:Color="#F5F8FC" ss:Pattern="Solid"/></Style>
  <Style ss:ID="altn"><Interior ss:Color="#F5F8FC" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/><NumberFormat ss:Format="#,##0"/></Style>
  <Style ss:ID="neto"><Font ss:Bold="1" ss:Color="#1F4E79"/><Alignment ss:Horizontal="Center"/><NumberFormat ss:Format="#,##0"/></Style>
  <Style ss:ID="neta"><Font ss:Bold="1" ss:Color="#1F4E79"/><Alignment ss:Horizontal="Center"/><Interior ss:Color="#F5F8FC" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0"/></Style>
  <Style ss:ID="tot"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="12"/><Interior ss:Color="#1F4E79" ss:Pattern="Solid"/></Style>
  <Style ss:ID="totn"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="12"/><Interior ss:Color="#1F4E79" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/><NumberFormat ss:Format="#,##0"/></Style>
  <Style ss:ID="sign"><Font ss:Bold="1" ss:Color="#1F4E79"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Color="#999999"/></Borders></Style>
</Styles>
<Worksheet ss:Name="Inventario"><Table>`

  const colW = [12, 30, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 12]
  colW.forEach(w => {
    xls += `<Column ss:Width="${w * 6}"/>`
  })

  xls += `<Row>${['DÍA ' + dia, 'MES ' + mes, 'AÑO ' + anio]
    .map(v => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(v)}</Data></Cell>`)
    .join('')}<Cell ss:MergeAcross="4"><Data ss:Type="String">CONSECUTIVO</Data></Cell><Cell ss:MergeAcross="2"><Data ss:Type="String">No. 001</Data></Cell></Row>`
  xls += `<Row><Cell ss:Index="4"><Data ss:Type="String">BODEGA _____________</Data></Cell></Row><Row/>`
  xls += `<Row><Cell><Data ss:Type="String">${esc('REALIZADO POR: ' + operadores)}</Data></Cell><Cell ss:Index="7"><Data ss:Type="String">GRUPO No.</Data></Cell></Row>`
  xls += `<Row><Cell><Data ss:Type="String">RESPONSABLE DEL ÁREA:</Data></Cell><Cell ss:Index="9"><Data ss:Type="String">${esc('ZONA: ' + area)}</Data></Cell></Row><Row/>`

  const hdrs = ['CODIGO', 'MATERIALES', ...Array.from({ length: 13 }, (_, i) => 'P' + (i + 1)), 'P NETO']
  xls += `<Row>${hdrs.map(h => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('')}</Row>`

  let totalNeto = 0
  let rowIdx = 0
  for (const grupo of grupos) {
    for (let start = 0; start < grupo.pesos.length; start += 13) {
      const alt = rowIdx % 2 === 1
      xls += '<Row>'
      xls += `<Cell${alt ? ' ss:StyleID="alt"' : ''}><Data ss:Type="String">${esc(grupo.codigo)}</Data></Cell>`
      xls += `<Cell${alt ? ' ss:StyleID="alt"' : ''}><Data ss:Type="String">${esc(grupo.desc)}</Data></Cell>`
      let rowSum = 0
      for (let i = 0; i < 13; i++) {
        const idx = start + i
        if (idx < grupo.pesos.length) {
          xls += `<Cell ss:StyleID="${alt ? 'altn' : 'num'}"><Data ss:Type="Number">${grupo.pesos[idx]}</Data></Cell>`
          rowSum += grupo.pesos[idx]
        } else {
          xls += `<Cell ss:StyleID="${alt ? 'altn' : 'num'}"/>`
        }
      }
      xls += `<Cell ss:StyleID="${alt ? 'neta' : 'neto'}"><Data ss:Type="Number">${rowSum}</Data></Cell>`
      xls += '</Row>'
      totalNeto += rowSum
      rowIdx++
    }
  }

  xls += '<Row/><Row>'
  xls += '<Cell ss:StyleID="tot" ss:MergeAcross="14"><Data ss:Type="String">TOTAL RECIBIDO</Data></Cell>'
  xls += `<Cell ss:StyleID="totn"><Data ss:Type="Number">${totalNeto}</Data></Cell>`
  xls += '</Row><Row/><Row/>'
  ;['ENTREGÓ:', 'ELABORÓ:', 'SISTEMATIZÓ:', 'CONTABILIZÓ:'].forEach(l => {
    xls += `<Row><Cell ss:StyleID="sign"><Data ss:Type="String">${esc(l)}</Data></Cell></Row><Row/>`
  })

  xls += '</Table></Worksheet></Workbook>'
  return xls
}

export function descargarXls(xls: string, nombreArchivo: string) {
  const blob = new Blob([xls], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
