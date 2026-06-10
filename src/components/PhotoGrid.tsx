import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { COLORS, SIZES } from '../constants/theme'

interface PhotoItem {
  uri: string
}

interface Props {
  fotos: (PhotoItem | null)[]
  onTakePhoto: (index: number) => void
  onRemovePhoto: (index: number) => void
}

export default function PhotoGrid({ fotos, onTakePhoto, onRemovePhoto }: Props) {
  return (
    <View style={styles.grid}>
      {[0, 1, 2].map(i => {
        const foto = fotos[i]
        return (
          <TouchableOpacity
            key={i}
            style={[styles.slot, foto && styles.slotFilled]}
            onPress={() => onTakePhoto(i)}
            activeOpacity={0.7}
          >
            {foto ? (
              <>
                <Image source={{ uri: foto.uri }} style={styles.image} />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => onRemovePhoto(i)}
                >
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.addIcon}>📷</Text>
                <Text style={styles.addText}>Foto {i + 1}</Text>
              </>
            )}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: 10,
  },
  slot: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
    position: 'relative',
  },
  slotFilled: {
    borderStyle: 'solid',
    borderColor: COLORS.primary,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: SIZES.radius - 2,
  },
  addIcon: {
    fontSize: 24,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  addText: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    backgroundColor: COLORS.danger,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  removeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
})
