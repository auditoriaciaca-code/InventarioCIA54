import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { ResumenMaterial, RegistroPesada } from '../types'
import { MATERIAL_MAP } from '../constants/materiales'
import { getDatabase } from '../services/database'
import { COLORS, SIZES } from '../constants/theme'

export default function ResumenScreen() {
  const [registros, setRegistros] = useState<RegistroPesada[]>([])
  const [modoOffline, setModoOffline] = useState(true)
  const [sonido, setSonido] = useState(true)
  const [autoSync, setAutoSync] = useState(false)

  useFocusEffect(
    useCallback(() => {
      cargarRegistros()
    }, [])
  )

  async function cargarRegistros() {
    try {
      const db = getDatabase()
      const rows = await db.getAllAsync<RegistroPesada>(
        'SELECT * FROM inv_registros ORDER BY created_at DESC'
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
      const rows = resumen
        .map(
          r =>
            `<tr>
              <td>${r.material_icono} ${r.material_nombre}</td>
              <td>${r.cantidad}</td>
              <td>${r.total_neto.toFixed(2)} kg</td>
              <td>${r.porcentaje.toFixed(1)}%</td>
            </tr>`
        )
        .join('')

      const html = `
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: monospace; padding: 20px; }
              h1 { text-align: center; font-size: 18px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #000; padding: 6px; text-align: left; }
              th { background: #f0f0f0; }
              .total { font-weight: bold; text-align: center; margin-top: 15px; }
            </style>
          </head>
          <body>
            <h1>CIA A.C.A - Inventario</h1>
            <p>Fecha: ${new Date().toLocaleDateString('es-MX')} | Total: ${total.toFixed(2)} kg</p>
            <table>
              <thead>
                <tr><th>Material</th><th>Registros</th><th>Total Neto</th><th>%</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="total">TOTAL GENERAL: ${total.toFixed(2)} kg</div>
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

  function exportarExcel() {
    Alert.alert('Exportar Excel', 'Función próximamente disponible')
  }

  function compartir() {
    const resumenTexto = resumen
      .map(r => `${r.material_icono} ${r.material_nombre}: ${r.total_neto.toFixed(2)} kg (${r.porcentaje.toFixed(1)}%)`)
      .join('\n')

    const texto = `📊 INVENTARIO CIA A.C.A\n${new Date().toLocaleDateString('es-MX')}\n\n${resumenTexto}\n\nTOTAL: ${total.toFixed(2)} kg`
    Alert.alert('Compartir', texto)
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
          <View key={r.material_id} style={styles.resumenRow}>
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
          </View>
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
                <Text style={styles.printCellSmall}>{r.peso_neto.toFixed(2)}</Text>
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
    current.total += r.peso_neto
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
})
