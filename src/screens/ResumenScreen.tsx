import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { ResumenMaterial, RegistroPesada } from '../types'
import { MATERIAL_MAP } from '../constants/materiales'
import { getDatabase } from '../services/database'
import { COLORS, SIZES } from '../constants/theme'
import { useSesion } from '../context/SesionContext'
import { File, Paths } from 'expo-file-system'
import DetalleMaterial from '../components/DetalleMaterial'
import { finalizarInventarioRemoto } from '../services/supabase'
import { estaAreaCerradaHoy, sincronizarCierresHoy } from '../services/sync'
import { hoyLocalISO } from '../utils/fechas'
import { nombreArea } from '../constants/areas'

export default function ResumenScreen() {
  const { sesion } = useSesion()
  const [registros, setRegistros] = useState<RegistroPesada[]>([])
  const [modoOffline, setModoOffline] = useState(true)
  const [sonido, setSonido] = useState(true)
  const [autoSync, setAutoSync] = useState(false)
  const [materialSeleccionado, setMaterialSeleccionado] = useState<ResumenMaterial | null>(null)
  const [cerrada, setCerrada] = useState(false)
  const [finalizando, setFinalizando] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (sesion) {
        cargarRegistros()
        sincronizarCierresHoy().then(() => {
          estaAreaCerradaHoy(sesion.area_id || '').then(setCerrada)
        })
      }
    }, [sesion])
  )

  async function handleFinalizar() {
    if (!sesion) return
    Alert.alert(
      '¿Finalizar inventario?',
      `Se bloqueará ${nombreArea(sesion.area_id)} por hoy — nadie podrá registrar ni modificar pesadas hasta que el supervisor lo reabra con su clave.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: async () => {
            setFinalizando(true)
            const ok = await finalizarInventarioRemoto(sesion.area_id || '', hoyLocalISO(), sesion.nombre_operador)
            setFinalizando(false)
            if (ok) {
              await sincronizarCierresHoy()
              setCerrada(true)
            } else {
              Alert.alert('Sin conexión', 'No se pudo finalizar. Intenta de nuevo.')
            }
          },
        },
      ]
    )
  }

  async function cargarRegistros() {
    try {
      const db = getDatabase()
      const rows = await db.getAllAsync<RegistroPesada>(
        'SELECT * FROM inv_registros WHERE sesion_id = ? ORDER BY created_at ASC',
        [sesion?.id || '']
      )
      setRegistros(rows)
    } catch (error) {
      console.error(error)
    }
  }

  const resumen = getResumen(registros)
  const total = resumen.reduce((s, r) => s + r.total_neto, 0)

  async function exportarPDF() {
    try {
      const refMap = new Map<string, { desc: string; total: number; count: number }>()
      for (const r of registros) {
        const key = r.referencia_codigo || r.material_id
        const neto = r.peso_bruto - r.tara
        const existing = refMap.get(key)
        if (existing) {
          existing.total += neto
          existing.count++
        } else {
          refMap.set(key, { desc: r.referencia_descripcion || key, total: neto, count: 1 })
        }
      }

      const sorted = Array.from(refMap.entries()).sort(([a], [b]) => a.localeCompare(b))
      const totalGeneral = sorted.reduce((s, [, v]) => s + v.total, 0)

      const rows = sorted
        .map(
          ([codigo, item]) =>
            `<tr>
              <td>${codigo}</td>
              <td>${item.desc}</td>
              <td>${item.count}</td>
              <td style="text-align:right">${item.total.toFixed(2)} kg</td>
            </tr>`
        )
        .join('')

      const html = `
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Courier New', monospace; padding: 30px; }
              h1 { text-align: center; font-size: 20px; color: #1F4E79; margin-bottom: 5px; }
              .subtitle { text-align: center; color: #666; font-size: 12px; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th { background: #1F4E79; color: #fff; padding: 8px; text-align: left; font-weight: bold; }
              td { border: 1px solid #ccc; padding: 6px; }
              tr:nth-child(even) { background: #f5f8fc; }
              .total-row td { font-weight: bold; background: #1F4E79; color: #fff; padding: 8px; font-size: 13px; }
              .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #999; }
            </style>
          </head>
          <body>
            <h1>CIA A.C.A</h1>
            <div class="subtitle">Inventario de Materiales</div>
            <div style="margin-bottom:15px; font-size:12px; color:#333;">
              <strong>Operador:</strong> ${sesion?.nombre_operador || '—'} &nbsp;|&nbsp;
              <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-MX')} &nbsp;|&nbsp;
              <strong>Total registros:</strong> ${registros.length}
            </div>
            <table>
              <thead>
                <tr><th>Código</th><th>Material</th><th>Pesadas</th><th>Total</th></tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="total-row">
                  <td colspan="3" style="text-align:right">TOTAL GENERAL</td>
                  <td style="text-align:right">${totalGeneral.toFixed(2)} kg</td>
                </tr>
              </tbody>
            </table>
            <div class="footer">Generado por Sistema de Inventario CIA — ${new Date().toLocaleString('es-MX')}</div>
          </body>
        </html>`

      const { uri } = await Print.printToFileAsync({ html })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf' })
      } else {
        Alert.alert('PDF generado', `Archivo guardado en: ${uri}`)
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo generar el PDF')
    }
  }

  async function exportarExcel() {
    try {
      const ahora = new Date()
      const dia = ahora.getDate()
      const mes = ahora.getMonth() + 1
      const anio = ahora.getFullYear()

      const grouped = new Map<string, { desc: string; pesos: number[] }>()
      for (const r of registros) {
        const key = r.referencia_codigo || r.material_id
        if (!grouped.has(key)) {
          grouped.set(key, {
            desc: r.referencia_descripcion || key,
            pesos: [],
          })
        }
        grouped.get(key)!.pesos.push(r.peso_bruto - r.tara)
      }

      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

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
      colW.forEach(w => { xls += `<Column ss:Width="${w * 6}"/>` })

      const addCell = (v: string | number, s: string) => {
        const t = typeof v === 'number' ? 'Number' : 'String'
        xls += `<Cell ss:StyleID="${s}"><Data ss:Type="${t}">${t === 'Number' ? v : esc(v as string)}</Data></Cell>`
      }

      xls += `<Row>${['DÍA ' + dia, 'MES ' + mes, 'AÑO ' + anio].map(v => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(v)}</Data></Cell>`).join('')}<Cell ss:MergeAcross="4"><Data ss:Type="String">CONSECUTIVO</Data></Cell><Cell ss:MergeAcross="2"><Data ss:Type="String">No. 001</Data></Cell></Row>`
      xls += `<Row><Cell ss:Index="4"><Data ss:Type="String">BODEGA _____________</Data></Cell></Row><Row/>`
      xls += `<Row>${addCell('REALIZADO POR: ' + esc(sesion?.nombre_operador || ''), '')}<Cell ss:Index="7"><Data ss:Type="String">GRUPO No.</Data></Cell></Row>`
      xls += `<Row><Cell><Data ss:Type="String">RESPONSABLE DEL ÁREA:</Data></Cell><Cell ss:Index="9"><Data ss:Type="String">ZONA:</Data></Cell></Row><Row/>`

      const hdrs = ['CODIGO','MATERIALES',...Array.from({length:13},(_,i)=>'P'+(i+1)),'P NETO']
      xls += `<Row>${hdrs.map(h => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('')}</Row>`

      let totalNeto = 0, rowIdx = 0
      for (const [codigo, item] of grouped) {
        for (let start = 0; start < item.pesos.length; start += 13) {
          const alt = rowIdx % 2 === 1
          xls += '<Row>'
          xls += `<Cell${alt ? ' ss:StyleID="alt"' : ''}><Data ss:Type="String">${esc(codigo)}</Data></Cell>`
          xls += `<Cell${alt ? ' ss:StyleID="alt"' : ''}><Data ss:Type="String">${esc(item.desc)}</Data></Cell>`
          let rowSum = 0
          for (let i = 0; i < 13; i++) {
            const idx = start + i
            if (idx < item.pesos.length) {
              xls += `<Cell ss:StyleID="${alt ? 'altn' : 'num'}"><Data ss:Type="Number">${item.pesos[idx]}</Data></Cell>`
              rowSum += item.pesos[idx]
            } else {
              xls += `<Cell ss:StyleID="${alt ? 'altn' : 'num'}"/>`
            }
          }
          xls += `<Cell ss:StyleID="${alt ? 'neta' : 'neto'}"><Data ss:Type="Number">${rowSum}</Data></Cell>`
          xls += '</Row>'
          totalNeto += rowSum; rowIdx++
        }
      }

      xls += '<Row/><Row>'
      xls += '<Cell ss:StyleID="tot" ss:MergeAcross="14"><Data ss:Type="String">TOTAL RECIBIDO</Data></Cell>'
      xls += `<Cell ss:StyleID="totn"><Data ss:Type="Number">${totalNeto}</Data></Cell>`
      xls += '</Row><Row/><Row/>'

      ;['ENTREGÓ:','ELABORÓ:','SISTEMATIZÓ:','CONTABILIZÓ:'].forEach(l => {
        xls += `<Row><Cell ss:StyleID="sign"><Data ss:Type="String">${esc(l)}</Data></Cell></Row><Row/>`
      })

      xls += '</Table></Worksheet></Workbook>'

      const file = new File(Paths.cache, `inventario_${anio}_${mes}_${dia}.xls`)
      file.write(xls)

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/vnd.ms-excel' })
      } else {
        Alert.alert('Excel generado', `Archivo guardado en: ${file.uri}`)
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo generar el Excel')
    }
  }

  function compartir() {
    const resumenTexto = resumen
      .map(r => `${r.material_icono} ${r.material_nombre}: ${r.total_neto.toFixed(2)} kg (${r.porcentaje.toFixed(1)}%)`)
      .join('\n')

    const texto = `📊 INVENTARIO CIA A.C.A\n${new Date().toLocaleDateString('es-MX')}\n\n${resumenTexto}\n\nTOTAL: ${total.toFixed(2)} kg`
    Alert.alert('Compartir', texto)
  }

  if (materialSeleccionado) {
    return (
      <DetalleMaterial
        materialId={materialSeleccionado.material_id}
        materialNombre={materialSeleccionado.material_nombre}
        materialIcono={materialSeleccionado.material_icono}
        registros={registros}
        onCerrar={() => setMaterialSeleccionado(null)}
      />
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardTitle}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>📊</Text>
          </View>
          <Text style={styles.cardTitleText}>Resumen por Material</Text>
        </View>

        {resumen.map(r => (
          <TouchableOpacity key={r.material_id} style={styles.resumenRow} onPress={() => setMaterialSeleccionado(r)} activeOpacity={0.7}>
            <View style={styles.resumenLeft}>
              <Text style={styles.resumenIcon}>{r.material_icono}</Text>
              <View>
                <Text style={styles.resumenNombre}>{r.material_nombre}</Text>
                <Text style={styles.resumenCount}>{r.cantidad} registro(s)</Text>
              </View>
            </View>
            <View style={styles.resumenRight}>
              <Text style={styles.resumenPeso}>{r.total_neto.toFixed(2)} kg</Text>
              <Text style={styles.resumenPorc}>{r.porcentaje.toFixed(1)}% del total</Text>
            </View>
          </TouchableOpacity>
        ))}

        {resumen.length === 0 && (
          <Text style={styles.emptyText}>Sin registros para mostrar</Text>
        )}

        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total General</Text>
          <Text style={styles.totalValue}>{total.toFixed(2)} kg</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitle}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>⚙️</Text>
          </View>
          <Text style={styles.cardTitleText}>Configuración y Exportación</Text>
        </View>

        <ToggleRow label="Modo Offline" desc="Guardar localmente sin internet" value={modoOffline} onToggle={() => setModoOffline(v => !v)} />
        <ToggleRow label="Sonido al registrar" desc="Beep de confirmación" value={sonido} onToggle={() => setSonido(v => !v)} />
        <ToggleRow label="Auto-sincronización" desc="Subir automáticamente" value={autoSync} onToggle={() => setAutoSync(v => !v)} />

        <View style={styles.btnGroup}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={exportarPDF}>
            <Text style={styles.secondaryBtnText}>📄 PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={exportarExcel}>
            <Text style={styles.secondaryBtnText}>📊 Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.warningBtn} onPress={compartir}>
            <Text style={styles.warningBtnText}>📤 Compartir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Vista previa del reporte */}
      <View style={styles.card}>
        <View style={styles.cardTitle}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>👁️</Text>
          </View>
          <Text style={styles.cardTitleText}>Vista Previa del Reporte</Text>
        </View>
        <View style={styles.printPreview}>
          <View style={styles.printHeader}>
            <Text style={styles.printTitle}>CIA A.C.A - Inventario</Text>
            <Text style={styles.printDate}>
              {new Date().toLocaleDateString('es-MX')} | {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          {registros.slice(0, 5).map((r, i) => {
            const m = MATERIAL_MAP.get(r.material_id)
            return (
              <View key={r.id} style={styles.printRow}>
                <Text style={styles.printCellSmall}>{i + 1}</Text>
                <Text style={styles.printCell}>{m?.nombre || r.material_id}</Text>
                <Text style={styles.printCellSmall}>{(r.peso_bruto - r.tara).toFixed(2)}</Text>
              </View>
            )
          })}
          {registros.length > 5 && (
            <Text style={styles.printMore}>... y {registros.length - 5} más</Text>
          )}
          <View style={styles.printTotal}>
            <Text style={styles.printTotalText}>TOTAL: {total.toFixed(2)} kg</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        {cerrada ? (
          <View style={styles.finalizadoBox}>
            <Text style={styles.finalizadoText}>✅ Inventario finalizado hoy</Text>
            <Text style={styles.finalizadoHint}>
              Nadie puede registrar ni modificar pesadas aquí hasta que el supervisor lo reabra desde Salas.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.finalizarBtn}
            onPress={handleFinalizar}
            disabled={finalizando || !sesion}
            activeOpacity={0.85}
          >
            <Text style={styles.finalizarBtnText}>
              {finalizando ? 'Finalizando…' : `✅ Finalizar inventario de ${nombreArea(sesion?.area_id)}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

function ToggleRow({
  label,
  desc,
  value,
  onToggle,
}: {
  label: string
  desc: string
  value: boolean
  onToggle: () => void
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <TouchableOpacity
        style={[styles.toggleSwitch, value && styles.toggleSwitchActive]}
        onPress={onToggle}
      >
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </TouchableOpacity>
    </View>
  )
}

function getResumen(registros: RegistroPesada[]): ResumenMaterial[] {
  const map = new Map<string, { total: number; count: number }>()
  for (const r of registros) {
    const current = map.get(r.material_id) || { total: 0, count: 0 }
    current.total += r.peso_bruto - r.tara
    current.count++
    map.set(r.material_id, current)
  }

  const totalGeneral = Array.from(map.values()).reduce((s, v) => s + v.total, 0)

  return Array.from(map.entries()).map(([id, data]) => {
    const mat = MATERIAL_MAP.get(id)
    return {
      material_id: id,
      material_nombre: mat?.nombre || id,
      material_icono: mat?.icono || '📦',
      total_neto: data.total,
      cantidad: data.count,
      porcentaje: totalGeneral > 0 ? (data.total / totalGeneral) * 100 : 0,
    }
  })
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 15,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 16,
    color: 'white',
  },
  cardTitleText: {
    fontSize: 17,
    fontWeight: '700',
  },
  resumenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resumenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resumenIcon: {
    fontSize: 20,
  },
  resumenNombre: {
    fontWeight: '700',
  },
  resumenCount: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  resumenRight: {
    alignItems: 'flex-end',
  },
  resumenPeso: {
    fontWeight: '800',
    fontSize: 17,
  },
  resumenPorc: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  totalBox: {
    backgroundColor: COLORS.bg,
    padding: 15,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    marginTop: 15,
  },
  totalLabel: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 5,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  toggleLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
  toggleDesc: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    backgroundColor: COLORS.border,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: COLORS.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  btnGroup: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  secondaryBtn: {
    flex: 1,
    padding: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  secondaryBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  warningBtn: {
    flex: 1,
    padding: 14,
    backgroundColor: COLORS.warning,
    borderRadius: SIZES.radius,
    alignItems: 'center',
  },
  warningBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textLight,
    paddingVertical: 20,
  },
  printPreview: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: SIZES.radiusSm,
  },
  printHeader: {
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 10,
    marginBottom: 10,
  },
  printTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  printDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  printRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  printCell: {
    flex: 2,
    fontSize: 13,
  },
  printCellSmall: {
    flex: 1,
    fontSize: 13,
  },
  printMore: {
    textAlign: 'center',
    color: COLORS.textLight,
    fontSize: 12,
    paddingVertical: 8,
  },
  printTotal: {
    borderTopWidth: 2,
    borderTopColor: '#000',
    paddingTop: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  printTotalText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  finalizarBtn: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: SIZES.radius,
    alignItems: 'center',
  },
  finalizarBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
  finalizadoBox: {
    alignItems: 'center',
    gap: 6,
  },
  finalizadoText: {
    fontWeight: '800',
    fontSize: 16,
    color: COLORS.primary,
  },
  finalizadoHint: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 17,
  },
})
