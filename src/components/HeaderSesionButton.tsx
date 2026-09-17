import { useEffect, useState } from 'react'
import { TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useSesion } from '../context/SesionContext'
import { nombreArea } from '../constants/areas'
import { obtenerOperadoresHoyPorArea } from '../services/supabase'

const REFRESH_MS = 20000

export default function HeaderSesionButton() {
  const { sesion, abrirSelector } = useSesion()
  const [companeros, setCompaneros] = useState<string[]>([])

  useEffect(() => {
    if (!sesion?.area_id) {
      setCompaneros([])
      return
    }

    async function actualizar() {
      const mapa = await obtenerOperadoresHoyPorArea()
      const otros = (mapa[sesion!.area_id!] || []).filter(
        n => n.toLowerCase() !== sesion!.nombre_operador.toLowerCase()
      )
      setCompaneros(otros)
    }

    actualizar()
    const intervalo = setInterval(actualizar, REFRESH_MS)
    return () => clearInterval(intervalo)
  }, [sesion?.area_id, sesion?.nombre_operador])

  return (
    <TouchableOpacity style={styles.btn} onPress={abrirSelector} activeOpacity={0.7}>
      {sesion ? (
        <>
          <Text style={styles.text} numberOfLines={1}>
            👤 {sesion.nombre_operador} · {nombreArea(sesion.area_id)}
          </Text>
          {companeros.length > 0 && (
            <Text style={styles.subtext} numberOfLines={1}>
              🤝 con {companeros.join(', ')}
            </Text>
          )}
        </>
      ) : (
        <Text style={styles.text} numberOfLines={1}>Iniciar sesión</Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    marginRight: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    maxWidth: 190,
  },
  text: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  subtext: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
})
