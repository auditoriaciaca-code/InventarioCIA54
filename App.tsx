import { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import RegistroScreen from './src/screens/RegistroScreen'
import InventarioScreen from './src/screens/InventarioScreen'
import ResumenScreen from './src/screens/ResumenScreen'
import { initDatabase } from './src/services/database'
import { COLORS } from './src/constants/theme'

const Tab = createBottomTabNavigator()

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initDatabase()
      .then(() => setReady(true))
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
    <NavigationContainer>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.textLight,
          tabBarStyle: {
            backgroundColor: COLORS.card,
            borderTopColor: COLORS.border,
            paddingBottom: 5,
            height: 60,
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
        }}
      >
        <Tab.Screen
          name="Registro"
          component={RegistroScreen}
          options={{
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>📝</Text>,
            headerTitle: 'CIA A.C.A - Control de Inventario',
          }}
        />
        <Tab.Screen
          name="Inventario"
          component={InventarioScreen}
          options={{
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>📋</Text>,
            headerTitle: 'Inventario',
          }}
        />
        <Tab.Screen
          name="Resumen"
          component={ResumenScreen}
          options={{
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 22 }}>📊</Text>,
            headerTitle: 'Resumen',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
})
