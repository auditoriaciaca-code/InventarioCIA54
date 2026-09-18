# CIA A.C.A — Control de Inventario

App Android interna para pesaje con báscula, desarrollada en React Native / Expo SDK 54.
Propietario: **Ingeniero de la planta** (usuario final: equipo de inventario).
Idioma de comunicación: **Español**.

---

## Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Framework | React Native 0.81.5 + Expo ~54.0.34 |
| Navegación | @react-navigation/bottom-tabs (7.4) + native-stack |
| Base de datos local | SQLite vía expo-sqlite ~16.0.10 |
| Nube | Supabase (PostgreSQL + REST API) |
| Exportación | Excel vía XML Spreadsheet nativo (sin exceljs) |
| OCR | OCR.space API (cloud) |
| Escáner | expo-camera (barcode detection) + expo-image-picker |
| Procesamiento imágenes | expo-image-manipulator (crop + resize) |
| Build | EAS Build (APK) |
| Package name | `com.ciaca.inventariocia` |

---

## Estructura del Proyecto

```
InventarioCIA54/
├── App.tsx                     # Entry point, tabs, DB init
├── app.json                    # Expo config, EAS projectId
├── eas.json                    # EAS Build profiles
├── index.ts                    # registerRootComponent
├── src/
│   ├── components/
│   │   ├── ContainerSelector   # Botones TULA / ALAMBRE / Personalizado
│   │   ├── InventoryItem       # Card de cada registro (bruto, tara, neto, fotos)
│   │   ├── MaterialGrid        # Grid de categorías con iconos
│   │   ├── PhotoViewer         # Visor de fotos en modal
│   │   ├── QrScanner           # Modal de cámara para QR/barcode
│   │   ├── ReferenciaSelector  # Lista de referencias con búsqueda
│   │   ├── ScaleReader         # Lector OCR de display de báscula
│   │   ├── SesionSelector      # Selector de sesión (nombre + área) al iniciar
│   │   ├── HeaderSesionButton  # Pill del header con operador + área activa
│   │   └── ComparacionListener # Escucha en tiempo real el doble conteo (sin UI)
│   ├── constants/
│   │   ├── materiales.ts       # Catálogo de categorías y referencias
│   │   ├── areas.ts            # Catálogo fijo de las 5 áreas del inventario general
│   │   └── theme.ts            # Colores, tamaños
│   ├── context/
│   │   └── SesionContext.tsx    # Contexto de sesión activa (operador + área)
│   ├── screens/
│   │   ├── RegistroScreen      # Captura de pesada (principal)
│   │   ├── ChatRegistroScreen  # Registro rápido tipo chat ("Rápido")
│   │   ├── InventarioScreen    # Lista de registros con filtros y edición
│   │   └── ResumenScreen       # Totales, exportación Excel/PDF, compartir
│   ├── services/
│   │   ├── database.ts         # SQLite schema + migraciones
│   │   ├── supabase.ts         # Cliente Supabase, sync y subida inmediata
│   │   └── sync.ts             # Lógica de sincronización manual + en segundo plano
│   └── types/
│       └── index.ts            # Interfaces TypeScript
├── google-apps-script/
│   ├── WebhookReceiver.gs      # Receptor de webhooks de Supabase (tablero del supervisor)
│   └── README.md               # Pasos de despliegue en Google Sheets
├── supabase-migration.sql      # Migración de la BD en Supabase
└── AGENTS.md                   # Este archivo — contexto para la IA
```

---

## Funcionalidades

### 1. Registro de Pesada (RegistroScreen)
- Selección de **categoría** (MaterialGrid con iconos: Aluminio, Acero, Plástico, etc.)
- Selección de **referencia** (código + descripción) con buscador
- **Contenedor**: TULA (2kg), ALAMBRE (1kg), o **personalizado**
- **Peso bruto**: ingreso manual o desde **lector OCR** (botón "📷 Báscula")
- **Tara**: desde contenedor o manual, default 2
- **Peso neto**: se calcula automáticamente (`bruto - tara`)
- **Código de barras**: botón "📷 QR/Barcode" → escanea → extrae referencia
- **Fotos**: hasta 2 fotos por registro (cámara nativa)
- **Observaciones**: texto libre
- Los datos se guardan en **SQLite local** con `synced=0`

### 2. Lector de Báscula (ScaleReader)
- Abre la **cámara del sistema** (ImagePicker.launchCameraAsync)
- **Recorta** el centro 60% y **redimensiona** a 600px (expo-image-manipulator)
- Envía la imagen a **OCR.space API** (clave: `K87524179688957`, 25k req/mes)
- Parsea el texto extraído buscando dígitos de **1 a 4 caracteres** (0–9999)
- Muestra el resultado para **confirmación/corrección manual**
- Engine OCR: `2` (mejor para displays digitales)

### 3. Escáner de Códigos (QrScanner)
- Usa `expo-camera` (CameraView) con detección de barcode
- Formatos soportados: QR, EAN-13, EAN-8, Code 128, Code 39, Code 93, UPC-A, UPC-E, Codabar, Aztec, PDF417
- Al escanear, busca coincidencia por **prefijo del código** contra las referencias conocidas
- Si coincide, auto-selecciona material + referencia
- Muestra el código completo como badge en la tarjeta

### 4. Inventario (InventarioScreen)
- Lista de todos los registros de la sesión activa
- **Filtro por material** (chips)
- **Buscador por peso** (coincide con bruto, tara o neto)
- Cada tarjeta muestra: material, referencia, código de barras, hora, **bruto**, **tara**, **neto**
- Acciones por tarjeta:
  - **Editar** (modal completo: material, referencia, bruto, tara, contenedor, observaciones)
  - **Ver fotos** (PhotoViewer modal)
  - **Eliminar** (con confirmación)
- Sincronización manual con botón "🔄 Sincronizar"

### 5. Resumen y Exportación (ResumenScreen)
- **Vista previa** del reporte con últimos 5 registros
- **Exportar PDF**: vía `expo-print` con HTML template
- **Exportar Excel**: genera XML Spreadsheet 2003 nativo (`.xls`), sin librerías externas
  - Formato: encabezados (día, mes, año, operador), tabla con P1–P13 + P NETO, total, firmas
  - Datos en **peso neto** (calculado como `bruto - tara` en tiempo real)
  - Orden: **ASC** por `created_at` (P1 = más antiguo)
- **Compartir**: texto plano con resumen
- Configuración: Modo Offline, Sonido, Auto-sincronización
- Tocar un material en "Resumen por Material" abre una pantalla nueva (`src/components/DetalleMaterial.tsx`, mismo patrón de drill-down que `ComparacionTabla`) con el desglose por **referencia** (ej. "Cobre 1C"), y cada referencia se despliega ("^") para ver cada pesada individual numerada P1, P2, P3... (reinicia en 1 por referencia, en orden cronológico). Si una pesada tiene fotos, sale un botón 📷 (con el conteo si son varias) que abre el mismo `PhotoViewer` del chat — las fotos se leen de SQLite local (`inv_fotos`), no de Supabase, porque Resumen solo muestra registros de la sesión propia del dispositivo

### 6. Offline y Sincronización
- Todo funciona **sin internet** (SQLite local)
- Cuando hay WiFi, sincroniza a **Supabase**:
  - `inv_registros` → `INSERT/UPDATE` en lote (manual, botón en Inventario)
  - `inv_fotos` → solo metadatos (path local), las fotos no se suben aún
- Además, cada registro nuevo intenta **subirse solo** apenas se guarda (`subirEnSegundoPlano` en `sync.ts`), sin bloquear el guardado ni romper el flujo offline — si falla, queda `synced=0` para el botón manual
- El campo `synced` marca registros pendientes de subir

### 7. Inventario General por Áreas + Doble Conteo Ciego
- El selector de sesión (`SesionSelector`) es por **área**, en 2 pasos: 1) tarjetas grandes por área (muestra quién ya está trabajando ahí hoy o "Sin operadores hoy"), 2) al elegir un área, botones grandes por cada operador ya activo ("👤 Nombre — Continuar pesando") más "+ Nuevo operador" si hay cupo (máx 2). El historial completo de sesiones queda colapsado detrás de un link "Ver historial"
- `inv_sesiones` sí se sube a Supabase (best-effort, `subirSesionInmediato`) para que un celular pueda ver qué operadores ya están en cada área hoy (`obtenerOperadoresHoyPorArea`)
- **Candado por operador**: un nombre queda "ocupado" en su área hasta que se libera explícitamente con el botón "🚪 Salir de mi sesión" (columna `liberada_at` en `inv_sesiones`, solo remota). Si otro celular nunca ha sido esa persona (no está en su historial local), el botón de esa persona aparece bloqueado (🔒) y no se puede tocar — **a propósito no hay liberación automática por inactividad**: si a alguien se le muere el teléfono sin tocar "Salir", esa sala queda bloqueada hasta liberarla manualmente desde Supabase (columna `liberada_at` de esa fila)
- **Excepción**: cambiar de área SÍ libera sola la sesión anterior (nadie puede estar en 2 áreas a la vez) — pasa dentro de `crearSesion`/`seleccionarSesion` en `SesionContext.tsx`, best-effort. Además, "+ Nuevo operador" sugiere automáticamente el nombre de quien ya usa ese celular (`sesion.nombre_operador` o el más reciente del historial) en vez de dejar el campo vacío
- `seleccionarSesion` (en `SesionContext`) persiste cuál sesión queda `activa=1` en SQLite — necesario para que "retomar" funcione bien tras cerrar/recargar la app
- Cuando 2 operadores de la misma área pesan el **mismo material y la misma referencia exacta** (`material_id` + `referencia_codigo`, ya no solo el material), un **trigger en Supabase** (`fn_emparejar_registro`, ver `supabase-migration.sql`) los empareja por **el peso más parecido** (no por orden de llegada) dentro del mismo día, y calcula la diferencia entre sus pesos netos. Si eligen referencias distintas para lo que en la práctica es el mismo ítem, esas pesadas ya no se comparan entre sí (antes sí se comparaban, marcadas con `misma_referencia=false`)
- Si una pesada nueva encaja mejor con alguien que ya tenía pareja, le "roba" el lugar: la comparación vieja queda `estado='anulada'` (historial, no se borra) y quien perdió su pareja queda libre para la siguiente — esto corrige solo los casos de pesadas cargadas fuera de orden (ej. un operador se atrasa y carga varias de golpe)
- Si la diferencia supera **1kg**, se marca `estado='alerta'` en `inv_comparaciones` y ambos celulares de esa área reciben una alerta en tiempo real (`ComparacionListener.tsx`, vía Supabase Realtime, con respaldo por polling cada 20s)
- No hay lotes ni códigos que identifiquen la pesada física — el emparejamiento asume que el peso más parecido del otro operador (mismo día, misma área+material) es la pareja correcta, y se autocorrige si llega una mejor coincidencia después (ver "corrección sobre la marcha" arriba). Si dos pesadas distintas del mismo material pesan casi lo mismo por coincidencia, sí se pueden emparejar mal sin que haya forma de saberlo (no hay lote que lo desmienta); si un operador se salta una pesada por completo (no solo la carga tarde), puede quedar alguien sin pareja el resto del turno (ver `v_registros_sin_pareja` en Supabase para detectarlo)
- En el módulo **Rápido** (chat), cada burbuja de registro muestra un semáforo (🟢🟡🔴) junto a la hora si ya tiene comparación: verde = 0kg de diferencia, amarillo = hasta 2kg, rojo = 2kg o más. Tocar el punto muestra el detalle (con quién, sus pesos, diferencia, cuándo). Los datos de comparación viven en `src/context/ComparacionesContext.tsx` (una sola suscripción Realtime por área, compartida por la alerta y el semáforo — reemplazó al antiguo `ComparacionListener.tsx`)
- El módulo **Rápido** permite tomar varias fotos por pesada (hasta `MAX_FOTOS_POR_MENSAJE = 5`, ver `ChatRegistroScreen.tsx`) — se acumulan en el composer antes de enviar, cada una queda como una fila en `inv_fotos` con su `orden`, y la burbuja muestra la primera con un badge "+N" si hay más (tocar abre `PhotoViewer`, que ya soporta varias con swipe)
- La barra de contenedor de "Rápido" vive abajo, junto al contador de registros; "cambiar" abre un panel deslizándose desde abajo (`pickerVisible` en `ChatRegistroScreen.tsx`) con pills sutiles en vez de las tarjetas grandes de `ContainerSelector` (esas siguen usándose tal cual en `RegistroScreen` y en la confirmación inicial de contenedor de Rápido)
- Deslizar el chat de "Rápido" hacia la izquierda abre una vista de pantalla completa "Tú vs compañero" (`src/components/ComparacionTabla.tsx`): una fila por cada pesada de hoy en esa área (emparejada o no — las que no tienen pareja aún salen como "VACÍO" del lado que falta), con un punto de color igual al semáforo del chat y la diferencia en kg a la derecha. Consulta `obtenerRegistrosHoyPorArea`/`obtenerComparacionesHoyPorArea`/`obtenerOperadoresHoyPorArea` en `supabase.ts` porque necesita ver las pesadas de AMBOS operadores, no solo las propias (a diferencia del chat normal). Cada lado muestra el **nombre corto de la referencia** (ej. "COBRE 1C"), resuelto del catálogo local (`CATEGORIA_MAP`) por código — `inv_comparaciones` solo guarda el código, no la descripción
- El arrastre entre el chat y esa tabla es tipo WhatsApp (sigue al dedo en vivo, no un simple fade): chat y tabla viven lado a lado dentro de una fila de `2× el ancho de pantalla`, movida por un solo `Animated.Value` (`swipeX`) según `PanResponder` — sin librerías nuevas (no usa `react-native-gesture-handler`/`reanimated`, así que el arrastre corre en el hilo de JS, no el nativo). La tabla solo se monta (`panelMontado`) mientras se está arrastrando o está abierta, para no consultar Supabase de fondo si nunca se abre
- Un supervisor ve todo en vivo en una **hoja de Google** (sin hosting propio) vía Database Webhooks de Supabase → Google Apps Script → Sheets. Ver `google-apps-script/README.md`

---

## Pantallas (Navegación)

Bottom Tabs (4 pantallas):

1. **📝 Registro** — Título: "CIA A.C.A - Control de Inventario"
2. **📋 Inventario** — Título: "Inventario"
3. **📊 Resumen** — Título: "Resumen"
4. **💬 Rápido** — Título: "Registro Rápido" (captura tipo chat, `ChatRegistroScreen`)

---

## Base de Datos SQLite

```sql
CREATE TABLE inv_registros (
  id TEXT PRIMARY KEY,
  sesion_id TEXT NOT NULL,
  area_id TEXT DEFAULT '',
  material_id TEXT NOT NULL,
  referencia_codigo TEXT DEFAULT '',
  referencia_descripcion TEXT DEFAULT '',
  contenedor TEXT NOT NULL,
  tara REAL NOT NULL DEFAULT 0,
  peso_bruto REAL NOT NULL,
  peso_neto REAL NOT NULL,
  observaciones TEXT DEFAULT '',
  codigo_barras TEXT DEFAULT '',
  fotos_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by TEXT,
  synced INTEGER DEFAULT 0,
  FOREIGN KEY (material_id) REFERENCES inv_materiales(id)
);

CREATE TABLE inv_fotos (
  id TEXT PRIMARY KEY,
  registro_id TEXT NOT NULL,
  url TEXT DEFAULT '',
  path_local TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  FOREIGN KEY (registro_id) REFERENCES inv_registros(id) ON DELETE CASCADE
);
```

`inv_sesiones` también tiene `area_id TEXT DEFAULT ''`. Las áreas son un catálogo fijo en `src/constants/areas.ts` (no hay tabla local `inv_areas`; sí existe del lado de Supabase).

Solo en Supabase (no en SQLite local, el emparejamiento corre server-side): `inv_areas`, `inv_comparaciones`, columnas `emparejado`/`comparacion_id` en `inv_registros`, y los triggers `fn_emparejar_registro` / `fn_recalcular_comparacion`. Ver el bloque "INVENTARIO GENERAL POR ÁREAS..." en `supabase-migration.sql`.

### Migraciones (ejecutadas en orden)
1. ADD COLUMN `referencia_codigo`
2. ADD COLUMN `referencia_descripcion`
3. ADD COLUMN `sesion_id`
4. ADD COLUMN `codigo_barras`
5. ADD COLUMN `area_id` (en `inv_sesiones` e `inv_registros`)

---

## Comandos Útiles

```powershell
# Iniciar servidor de desarrollo (Expo Go)
npx expo start --clear

# Iniciar sesión en Expo (necesario para build)
npx eas login

# Generar APK (EAS Build)
npx eas build --profile preview --platform android

# Verificar errores TypeScript
npx tsc --noEmit
```

---

## EAS Build

**Profile**: `preview` (APK directo, sin Play Store)

**app.json** requiere:
```json
"extra": { "eas": { "projectId": "3b00fee1-2732-43d7-9360-80f8235c999e" } },
"owner": "ajr01s-team"
```

**eas.json**:
```json
{
  "build": {
    "preview": { "android": { "buildType": "apk" } },
    "production": {}
  }
}
```

Builds recientes:
| # | ID | Fecha |
|---|-----|-------|
| 1 | `WzkBtqYbHxd` | Anterior (crash por expo-image-manipulator v56) |
| 2 | `70e0826d` | Corrige versión de expo-image-manipulator |
| 3 | `309e2000` | Primer build con correcciones de TypeScript |
| 4 | `48315844` | Buscador + ASC + XML |
| 5 | `303235e3` | Build actual |

---

## OCR.space API

- **Key**: `K87524179688957`
- **Límite**: 25,000 requests/mes
- **Endpoint**: `https://api.ocr.space/parse/image`
- **Engine**: `2` (optimizado para displays digitales)
- **Preprocesamiento**: crop centro 60% + resize 600px (expo-image-manipulator)

---

## Supabase

- **URL**: `https://lkrjzpxzxurzjoswpeku.supabase.co`
- **Anon Key**: `sb_publishable_6cWubKMz8T6lJqVE6HadnA_MX47WHQz`
- **Tablas**: `inv_registros`, `inv_fotos`, `inv_sesiones` (espejo de SQLite local, las 3 sincronizan best-effort), `inv_areas` y `inv_comparaciones` (solo remotas, alimentadas por el trigger de emparejamiento)
- **Sincronización**: subida inmediata best-effort al guardar + manual (botón) o automática (configurable en Resumen) como respaldo
- **Realtime**: habilitado sobre `inv_comparaciones` (primer uso de Realtime en el proyecto) para las alertas de doble conteo

---

## Problemas Conocidos Resueltos

1. **exceljs + Hermes** → "Maximum call stack size exceeded". Solución: reemplazar con XML Spreadsheet nativo.
2. **CameraView + takePictureAsync** → "Failed to capture image" en Android. Solución: usar `ImagePicker.launchCameraAsync`.
3. **Tesseract.js en WebView** → se cuelga en el dispositivo. Solución: OCR.space cloud API.
4. **expo-image-manipulator** → instalar versión `~14.0.8` (compatible con SDK 54), no v56.
5. **Expo Go "Failed to download remote update"** → mantener sesión iniciada en Expo CLI (`eas login`).
6. **Teclado cubre campos** → usar `KeyboardAvoidingView behavior="padding"`.
7. **Barra de navegación Android tapa tabs** → `paddingBottom: 10`, `height: 68`.

---

## Pendientes / Mejoras Futuras

- Subir fotos a Supabase Storage (actualmente solo metadatos)
- Login de usuarios con roles
- Mejora OCR: Google Cloud Vision (requiere tarjeta de crédito)
- Firma digital en reportes
- Publicación en Play Store (opcional)
- Los borrados de registros nunca se sincronizan a Supabase (limitación preexistente) — puede generar una comparación "fantasma" si se borra localmente un registro ya emparejado
- Si Supabase Realtime no conecta en algún dispositivo (primer uso en el proyecto), el respaldo por polling cubre el caso pero con hasta 20s de retraso; si el problema persiste, revisar `react-native-url-polyfill`
