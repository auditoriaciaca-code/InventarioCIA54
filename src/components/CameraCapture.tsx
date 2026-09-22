import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { COLORS, SIZES } from '../constants/theme'

interface Props {
  visible: boolean
  onClose: () => void
  onCapture: (uri: string) => void
}

export default function CameraCapture({ visible, onClose, onCapture }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [tomando, setTomando] = useState(false)
  const cameraRef = useRef<CameraView>(null)

  if (!visible) return null

  if (!permission) return null

  if (!permission.granted) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalIcon}>📷</Text>
            <Text style={styles.modalTitle}>Permiso de Cámara</Text>
            <Text style={styles.modalDesc}>Necesitamos acceso a la cámara para tomar la foto de la pesada</Text>
            <TouchableOpacity style={styles.btn} onPress={requestPermission}>
              <Text style={styles.btnText}>Conceder Permiso</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    )
  }

  async function handleShutter() {
    if (tomando || !cameraRef.current) return
    setTomando(true)
    try {
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.5 })
      if (foto?.uri) onCapture(foto.uri)
      onClose()
    } catch {
      onClose()
    } finally {
      setTomando(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />

        <View style={styles.overlayTop}>
          <Text style={styles.overlayTitle}>Foto de la pesada</Text>
        </View>

        <View style={styles.overlayBottom}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shutterBtn} onPress={handleShutter} activeOpacity={0.7} disabled={tomando}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <View style={styles.cancelBtn} />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    padding: 25,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  btn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: SIZES.radius,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  btnSecondary: {
    paddingVertical: 10,
  },
  btnSecondaryText: {
    color: COLORS.textLight,
    fontWeight: '600',
    fontSize: 14,
  },
  overlayTop: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  overlayTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
  },
  cancelBtn: {
    width: 70,
  },
  cancelBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  shutterBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
})
