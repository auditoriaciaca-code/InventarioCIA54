import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { COLORS, SIZES } from '../constants/theme'

interface Props {
  uri: string
  onPress: () => void
  onRemove?: () => void
  size?: number
}

export default function ChatPhotoThumb({ uri, onPress, onRemove, size = 56 }: Props) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={StyleSheet.absoluteFill}>
        <Image source={{ uri }} style={styles.image} />
      </TouchableOpacity>
      {onRemove && (
        <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
          <Text style={styles.removeText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: SIZES.radiusSm,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
})
