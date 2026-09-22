import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native'
import { COLORS } from '../constants/theme'

interface Props {
  onFoto: () => void
  onBascula: () => void
  onLote: () => void
  onLoteLongPress?: () => void
}

const ITEMS = [
  { key: 'lote', icon: '🏷️' },
  { key: 'bascula', icon: '⚖️' },
  { key: 'foto', icon: '📷' },
]

export default function QuickActionsFab({ onFoto, onBascula, onLote, onLoteLongPress }: Props) {
  const [abierto, setAbierto] = useState(false)
  const anim = useRef(new Animated.Value(0)).current

  function toggle() {
    const destino = abierto ? 0 : 1
    Animated.spring(anim, { toValue: destino, useNativeDriver: true, friction: 7 }).start()
    setAbierto(!abierto)
  }

  function ejecutar(accion: () => void) {
    accion()
    Animated.spring(anim, { toValue: 0, useNativeDriver: true, friction: 7 }).start()
    setAbierto(false)
  }

  function accionPara(key: string) {
    if (key === 'foto') return () => ejecutar(onFoto)
    if (key === 'bascula') return () => ejecutar(onBascula)
    return () => ejecutar(onLote)
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {ITEMS.map((item, i) => {
        const distancia = 58 * (i + 1)
        const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -distancia] })
        const opacity = anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.4, 1] })
        const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })
        return (
          <Animated.View
            key={item.key}
            pointerEvents={abierto ? 'auto' : 'none'}
            style={[styles.subBtnWrap, { transform: [{ translateY }, { scale }], opacity }]}
          >
            <TouchableOpacity
              style={styles.subBtn}
              onPress={accionPara(item.key)}
              onLongPress={item.key === 'lote' ? onLoteLongPress : undefined}
              activeOpacity={0.75}
            >
              <Text style={styles.subBtnIcon}>{item.icon}</Text>
            </TouchableOpacity>
          </Animated.View>
        )
      })}

      <TouchableOpacity style={styles.mainBtn} onPress={toggle} activeOpacity={0.8}>
        <Animated.Text
          style={[
            styles.mainBtnIcon,
            { transform: [{ rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }) }] },
          ]}
        >
          ✛
        </Animated.Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    bottom: 12,
    alignItems: 'center',
  },
  mainBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  mainBtnIcon: {
    fontSize: 24,
    color: 'white',
    fontWeight: '700',
  },
  subBtnWrap: {
    position: 'absolute',
    bottom: 0,
  },
  subBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  subBtnIcon: {
    fontSize: 20,
  },
})
