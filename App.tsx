import { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, Image, ActivityIndicator, StyleSheet, Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import RegistroScreen from './src/screens/RegistroScreen'
import InventarioScreen from './src/screens/InventarioScreen'
import ResumenScreen from './src/screens/ResumenScreen'
import ChatRegistroScreen from './src/screens/ChatRegistroScreen'
import { initDatabase } from './src/services/database'
import { cargarAreasLocal, sincronizarAreas } from './src/services/sync'
import { COLORS } from './src/constants/theme'
import { SesionProvider } from './src/context/SesionContext'
import { ComparacionesProvider } from './src/context/ComparacionesContext'
import SesionSelector from './src/components/SesionSelector'
import HeaderSesionButton from './src/components/HeaderSesionButton'

const Tab = createBottomTabNavigator()

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initDatabase()
      .then(async () => {
        await cargarAreasLocal()
        setReady(true)
        sincronizarAreas()
      })
      .catch((e: any) => setError(e?.message || 'Error al inicializar BD'))
  }, [])

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: COLORS.danger, fontSize: 16 }}>Error: {error}</Text>
        <StatusBar style="dark" />
      </View>
    )
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 10, color: COLORS.textLight }}>Inicializando...</Text>
        <StatusBar style="dark" />
      </View>
    )
  }

  return (
    <SafeAreaProvider>
    <SesionProvider>
    <ComparacionesProvider>
      <SesionSelector />
      <NavigationContainer>
        <StatusBar style="dark" />
        <Tab.Navigator
          screenOptions={{
            tabBarActiveTintColor: COLORS.primary,
            tabBarInactiveTintColor: COLORS.textLight,
            tabBarStyle: {
              backgroundColor: COLORS.card,
              borderTopColor: COLORS.border,
              paddingBottom: 10,
              height: 68,
              ...Platform.select({
                android: { elevation: 8 },
              }),
            },
            tabBarLabelStyle: {
              fontWeight: '600',
              fontSize: 11,
            },
            headerStyle: {
              backgroundColor: COLORS.primary,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: '700',
            },
            headerRight: () => <HeaderSesionButton />,
          }}
        >
          <Tab.Screen
            name="Registro"
            component={RegistroScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>📝</Text>,
              headerTitle: () => (
                <View style={styles.headerTitleRow}>
                  <Image source={require('./assets/images/logo-icono.png')} style={styles.headerLogo} />
                  <Text style={styles.headerTitleText}>Control de Inventario</Text>
                </View>
              ),
            }}
          />
          <Tab.Screen
            name="Inventario"
            component={InventarioScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>📋</Text>,
              headerTitle: () => (
                <View style={styles.headerTitleRow}>
                  <Image source={require('./assets/images/logo-icono.png')} style={styles.headerLogo} />
                  <Text style={styles.headerTitleText}>Inventario</Text>
                </View>
              ),
            }}
          />
          <Tab.Screen
            name="Resumen"
            component={ResumenScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>📊</Text>,
              headerTitle: () => (
                <View style={styles.headerTitleRow}>
                  <Image source={require('./assets/images/logo-icono.png')} style={styles.headerLogo} />
                  <Text style={styles.headerTitleText}>Resumen</Text>
                </View>
              ),
            }}
          />
          <Tab.Screen
            name="Rapido"
            component={ChatRegistroScreen}
            options={{
              tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>💬</Text>,
              tabBarLabel: 'Rápido',
              headerTitle: () => (
                <View style={styles.headerTitleRow}>
                  <Image source={require('./assets/images/logo-icono.png')} style={styles.headerLogo} />
                  <Text style={styles.headerTitleText}>Registro Rápido</Text>
                </View>
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </ComparacionesProvider>
    </SesionProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  headerTitleText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
})
