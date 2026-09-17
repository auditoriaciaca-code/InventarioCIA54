import { View, Text, TouchableOpacity, Image, Alert, StyleSheet } from 'react-native'
import { ChatListItem, ChatPendingMessage, Comparacion, Foto, RegistroPesada } from '../types'
import { COLORS, SIZES } from '../constants/theme'
import { formatDescripcion } from '../utils/format'

interface Props {
  item: ChatListItem
  fotos?: Foto[]
  comparacion?: Comparacion
  onPressRegistro: (registro: RegistroPesada) => void
  onLongPressRegistro: (registro: RegistroPesada) => void
  onPressPending: (pending: ChatPendingMessage) => void
  onPressFoto: (fotos: Foto[]) => void
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function colorSemaforo(diferencia: number): string {
  if (diferencia === 0) return '#2ecc71'
  if (diferencia < 2) return '#f1c40f'
  return COLORS.danger
}

function verDetalleComparacion(r: RegistroPesada, c: Comparacion) {
  const soyA = r.id === c.registro_a_id
  const miPeso = soyA ? c.peso_a : c.peso_b
  const otroPeso = soyA ? c.peso_b : c.peso_a
  const otroOperador = soyA ? c.operador_b : c.operador_a
  const otraReferencia = soyA ? c.referencia_b : c.referencia_a
  const cuando = new Date(c.actualizado_at || c.created_at).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  Alert.alert(
    c.estado === 'alerta' ? '🔴 Diferencia de peso' : '🟢 Coincide',
    `Comparado con: ${otroOperador || 'operador desconocido'}\n` +
    `Su peso: ${otroPeso.toFixed(2)} kg (el tuyo: ${miPeso.toFixed(2)} kg)\n` +
    `Diferencia: ${c.diferencia.toFixed(2)} kg\n` +
    (c.misma_referencia ? '' : `⚠️ Con una referencia distinta: ${otraReferencia || c.material_id}\n`) +
    `Comparado: ${cuando}`,
    [{ text: 'Cerrar' }]
  )
}

export default function ChatBubble({ item, fotos, comparacion, onPressRegistro, onLongPressRegistro, onPressPending, onPressFoto }: Props) {
  if (item.kind === 'system') {
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>{item.texto}</Text>
      </View>
    )
  }

  if (item.kind === 'pending') {
    return (
      <TouchableOpacity style={styles.bubbleWrap} onPress={() => onPressPending(item.pending)} activeOpacity={0.7}>
        <View style={[styles.bubble, styles.bubblePending]}>
          <Text style={styles.pendingHint}>⚠️ Toca para corregir</Text>
          <View style={styles.bottomRow}>
            <Text style={styles.pendingText}>"{item.pending.textoOriginal}"</Text>
            <Text style={styles.hora}>{formatHora(item.createdAt)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const r = item.registro
  return (
    <TouchableOpacity
      style={styles.bubbleWrap}
      onPress={() => onPressRegistro(r)}
      onLongPress={() => onLongPressRegistro(r)}
      activeOpacity={0.7}
    >
      <View style={[styles.bubble, styles.bubbleConfirmada]}>
        <Text style={styles.codigo} numberOfLines={2}>
          {r.referencia_codigo} · {formatDescripcion(r.referencia_descripcion)}
        </Text>
        {fotos && fotos.length > 0 && (
          <TouchableOpacity onPress={() => onPressFoto(fotos)} style={styles.thumbWrap}>
            <Image source={{ uri: fotos[0].path_local }} style={styles.thumb} />
            {fotos.length > 1 && (
              <View style={styles.thumbBadge}>
                <Text style={styles.thumbBadgeText}>+{fotos.length - 1}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        <View style={styles.bottomRow}>
          <Text style={styles.peso}>
            {r.peso_bruto.toFixed(2)} kg bruto · tara {r.tara} · neto {r.peso_neto.toFixed(2)} kg
          </Text>
          <View style={styles.horaRow}>
            {r.lote_codigo ? (
              <TouchableOpacity
                onPress={() => Alert.alert('🏷️ Lote', r.lote_codigo!)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.loteIcon}>🏷️</Text>
              </TouchableOpacity>
            ) : null}
            {comparacion && (
              <TouchableOpacity
                onPress={() => verDetalleComparacion(r, comparacion)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={[styles.semaforo, { backgroundColor: colorSemaforo(comparacion.diferencia) }]} />
              </TouchableOpacity>
            )}
            <Text style={styles.hora}>{formatHora(r.created_at)}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  bubbleWrap: {
    alignItems: 'flex-end',
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: SIZES.radius,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bubbleConfirmada: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomRightRadius: 2,
  },
  bubblePending: {
    backgroundColor: '#fdf0e0',
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderBottomRightRadius: 2,
  },
  codigo: {
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 15,
    includeFontPadding: false,
    color: COLORS.primary,
    marginBottom: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  peso: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 13,
    includeFontPadding: false,
    color: COLORS.text,
  },
  thumbWrap: {
    marginVertical: 3,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: SIZES.radiusSm,
  },
  thumbBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  thumbBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  hora: {
    fontSize: 9,
    lineHeight: 13,
    includeFontPadding: false,
    color: COLORS.textLight,
  },
  horaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  semaforo: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  loteIcon: {
    fontSize: 11,
  },
  pendingHint: {
    fontSize: 11,
    lineHeight: 13,
    includeFontPadding: false,
    fontWeight: '700',
    color: COLORS.warning,
    marginBottom: 1,
  },
  pendingText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 15,
    includeFontPadding: false,
    color: COLORS.text,
    fontStyle: 'italic',
  },
  systemWrap: {
    alignItems: 'center',
    marginVertical: 4,
  },
  systemText: {
    fontSize: 11,
    lineHeight: 13,
    includeFontPadding: false,
    color: COLORS.textLight,
    backgroundColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
})
