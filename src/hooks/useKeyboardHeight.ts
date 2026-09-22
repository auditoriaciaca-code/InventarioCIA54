import { useEffect, useState } from 'react'
import { Keyboard } from 'react-native'

/**
 * Alto actual del teclado en pantalla (0 si está oculto). Se usa en vez de
 * KeyboardAvoidingView porque en Android, con react-native-screens, el
 * ajuste automático de la ventana (adjustResize) no siempre se propaga
 * dentro de las pantallas — el cuadro de texto se quedaba tapado.
 * Escuchar los eventos de teclado directamente funciona sin importar eso.
 */
export function useKeyboardHeight(): number {
  const [altura, setAltura] = useState(0)

  useEffect(() => {
    const mostrar = Keyboard.addListener('keyboardDidShow', e => setAltura(e.endCoordinates.height))
    const ocultar = Keyboard.addListener('keyboardDidHide', () => setAltura(0))
    return () => {
      mostrar.remove()
      ocultar.remove()
    }
  }, [])

  return altura
}
