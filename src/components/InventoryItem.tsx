import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { RegistroPesada } from '../types'
import { MATERIAL_MAP } from '../constants/materiales'
import { COLORS, SIZES } from '../constants/theme'
import { formatDescripcion } from '../utils/format'
import { useConfig } from '../context/ConfigContext'

interface Props {
  item: RegistroPesada
  onEdit: (id: string) => void
  onViewPhotos: (id: string) => void
  onDelete: (id: string) => void
}

export default function InventoryItem({ item, onEdit, onViewPhotos, onDelete }: Props) {
  const { usarTara } = useConfig()
  const material = MATERIAL_MAP.get(item.material_id)
  const color = material?.color || COLORS.primary
  const hora = new Date(item.created_at).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <View style={styles.container}>
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={styles.header}>
        <View style={styles.left}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>{material?.icono || '📦'}</Text>
          </View>
          <View style={styles.textContent}>
            <Text style={styles.materialNombre}>{material?.nombre || item.material_id}</Text>
            {item.referencia_codigo ? (
              <Text style={styles.refText} numberOfLines={1}>
                {item.referencia_codigo} - {formatDescripcion(item.referencia_descripcion)}
              </Text>
            ) : null}
            {item.codigo_barras ? (
              <Text style={styles.barcodeText} numberOfLines={1}>📱 {item.codigo_barras}</Text>
            ) : null}
            <Text style={styles.materialInfo}>{hora}</Text>
          </View>
        </View>
        <View style={styles.right}>
          <Text style={styles.neto}>{item.peso_neto.toFixed(2)}</Text>
          <Text style={styles.netoUnit}>kg neto</Text>
        </View>
      </View>
      {usarTara && (
        <View style={styles.details}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Bruto</Text>
            <Text style={styles.detailValue}>{item.peso_bruto.toFixed(2)}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Tara</Text>
            <Text style={styles.detailValue}>{item.tara.toFixed(2)}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Contenedor</Text>
            <Text style={styles.detailValue}>{item.contenedor}</Text>
          </View>
        </View>
      )}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(item.id)}>
          <Text style={styles.actionText}>✏️ Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onViewPhotos(item.id)}>
          <Text style={styles.actionText}>📷 Fotos ({item.fotos_count})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onDelete(item.id)}>
          <Text style={[styles.actionText, { color: COLORS.danger }]}>🗑️ Eliminar</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
    overflow: 'hidden',
  },
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: SIZES.radiusLg,
    borderBottomLeftRadius: SIZES.radiusLg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  textContent: {
    flex: 1,
    flexShrink: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26,95,42,0.1)',
  },
  icon: {
    fontSize: 20,
  },
  materialNombre: {
    fontSize: 15,
    fontWeight: '700',
  },
  refText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 1,
  },
  materialInfo: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 1,
  },
  barcodeText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 1,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  right: {
    alignItems: 'flex-end',
    flexShrink: 0,
    marginLeft: 8,
  },
  neto: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
  },
  netoUnit: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  details: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
})
