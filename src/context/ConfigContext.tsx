import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getDatabase } from '../services/database'

interface ConfigContextType {
  usarTara: boolean
  setUsarTara: (valor: boolean) => Promise<void>
}

const ConfigContext = createContext<ConfigContextType>({
  usarTara: false,
  setUsarTara: async () => {},
})

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [usarTara, setUsarTaraState] = useState(false)

  useEffect(() => {
    cargarConfig()
  }, [])

  async function cargarConfig() {
    try {
      const db = getDatabase()
      const row = await db.getFirstAsync<{ valor: string }>(
        `SELECT valor FROM app_config WHERE clave = 'usar_tara'`
      )
      setUsarTaraState(row?.valor === '1')
    } catch (e) {
      console.error(e)
    }
  }

  async function setUsarTara(valor: boolean) {
    const db = getDatabase()
    await db.runAsync(
      `INSERT INTO app_config (clave, valor) VALUES ('usar_tara', ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
      [valor ? '1' : '0']
    )
    setUsarTaraState(valor)
  }

  return (
    <ConfigContext.Provider value={{ usarTara, setUsarTara }}>
      {children}
    </ConfigContext.Provider>
  )
}

export const useConfig = () => useContext(ConfigContext)
