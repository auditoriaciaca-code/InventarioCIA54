import { useState } from 'react'
import {
  View, Text, TouchableOpacity, Image,
  Modal, ScrollView, Dimensions, StyleSheet
} from 'react-native'
import { COLORS, SIZES } from '../constants/theme'

const { width } = Dimensions.get('window')

interface FotoData {
  id: string
  path_local: string
  orden: number
}

interface Props {
  visible: boolean
  fotos: FotoData[]
  onClose: () => void
}

export default function PhotoViewer({ visible, fotos, onClose }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              Foto {selectedIndex + 1} de {fotos.length}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.scroll}
            onMomentumScrollEnd={e => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width)
              setSelectedIndex(idx)
            }}
          >
            {fotos.map((foto, i) => (
              <View key={i} style={styles.imageWrap}>
                <Image
                  source={{ uri: foto.path_local }}
                  style={styles.image}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>

          {fotos.length > 1 && (
            <View style={styles.dots}>
              {fotos.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === selectedIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
  },
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  imageWrap: {
    width,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width - 40,
    height: '80%',
    borderRadius: SIZES.radius,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: 'white',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
})
