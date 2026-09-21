import * as SQLite from 'expo-sqlite'

let db: SQLite.SQLiteDatabase

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('inventario.db')

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS inv_materiales (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      codigo TEXT NOT NULL,
      icono TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inv_sesiones (
      id TEXT PRIMARY KEY,
      nombre_operador TEXT NOT NULL,
      area_id TEXT DEFAULT '',
      fecha TEXT NOT NULL,
      activa INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inv_registros (
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

    CREATE TABLE IF NOT EXISTS inv_fotos (
      id TEXT PRIMARY KEY,
      registro_id TEXT NOT NULL,
      url TEXT DEFAULT '',
      path_local TEXT NOT NULL,
      orden INTEGER DEFAULT 0,
      FOREIGN KEY (registro_id) REFERENCES inv_registros(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inv_lotes (
      id TEXT PRIMARY KEY,
      codigo TEXT NOT NULL,
      area_id TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'pendiente'
    );
    CREATE INDEX IF NOT EXISTS idx_lotes_area_codigo ON inv_lotes(area_id, codigo);

    CREATE TABLE IF NOT EXISTS inv_areas_cache (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      icono TEXT NOT NULL DEFAULT '',
      orden INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inv_cierres_cache (
      area_id TEXT NOT NULL,
      fecha TEXT NOT NULL,
      cerrado INTEGER NOT NULL DEFAULT 0,
      cerrado_por TEXT DEFAULT '',
      cerrado_at TEXT DEFAULT '',
      PRIMARY KEY (area_id, fecha)
    );
  `)

  await seedMateriales()
  await seedAreas()
  await migrarBase()
}

async function migrarBase(): Promise<void> {
  try {
    await db.execAsync(`ALTER TABLE inv_registros ADD COLUMN referencia_codigo TEXT DEFAULT ''`)
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE inv_registros ADD COLUMN referencia_descripcion TEXT DEFAULT ''`)
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE inv_registros ADD COLUMN sesion_id TEXT DEFAULT ''`)
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE inv_registros ADD COLUMN codigo_barras TEXT DEFAULT ''`)
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE inv_sesiones ADD COLUMN area_id TEXT DEFAULT ''`)
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE inv_registros ADD COLUMN area_id TEXT DEFAULT ''`)
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE inv_registros ADD COLUMN lote_codigo TEXT DEFAULT ''`)
  } catch {}
}

async function seedMateriales(): Promise<void> {
  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM inv_materiales')
  if (count && count.count > 0) return

  const materiales = [
    { id: 'aceros', nombre: 'Aceros', codigo: 'ACEROS', icono: '⚙️' },
    { id: 'aluminios', nombre: 'Aluminios', codigo: 'ALUMINIOS', icono: '⚪' },
    { id: 'pote', nombre: 'POTE', codigo: 'POTE', icono: '🥫' },
    { id: 'bronce', nombre: 'BRONCE', codigo: 'BRONCE', icono: '🟠' },
    { id: 'cobre', nombre: 'Cobre', codigo: 'COBRE', icono: '🟤' },
    { id: 'radiadores_cobre', nombre: 'Radiadores de Cobre', codigo: 'RAD-COBRE', icono: '🔴' },
    { id: 'radiadores_mixtos', nombre: 'Radiadores Mixtos', codigo: 'RAD-MIX', icono: '🔶' },
    { id: 'scrap', nombre: 'SCRAP', codigo: 'SCRAP', icono: '🗑️' },
    { id: 'baterias', nombre: 'BATERIAS', codigo: 'BATERIAS', icono: '🔋' },
    { id: 'electronica', nombre: 'ELECTRONICA', codigo: 'ELECTRONICA', icono: '💻' },
    { id: 'chatarra_hierro', nombre: 'CHATARRA DE HIERRO', codigo: 'HIERRO', icono: '🪨' },
  ]

  for (const m of materiales) {
    await db.runAsync(
      'INSERT INTO inv_materiales (id, nombre, codigo, icono) VALUES (?, ?, ?, ?)',
      [m.id, m.nombre, m.codigo, m.icono]
    )
  }
}

/**
 * Siembra las 5 áreas que ya existían fijas en el código, para que la app
 * funcione sin internet incluso antes de la primera sincronización con
 * Supabase (que es la fuente de verdad real desde ahora — ver sync.ts).
 */
async function seedAreas(): Promise<void> {
  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM inv_areas_cache')
  if (count && count.count > 0) return

  const areas = [
    { id: 'produccion', nombre: 'Producción', icono: '🏭', orden: 1 },
    { id: 'cargue', nombre: 'Cargue', icono: '⬆️', orden: 2 },
    { id: 'tarjeta', nombre: 'Tarjeta', icono: '🎫', orden: 3 },
    { id: 'descargue_sur', nombre: 'Descargue Sur', icono: '🔽', orden: 4 },
    { id: 'descargue_norte', nombre: 'Descargue Norte', icono: '🔼', orden: 5 },
  ]

  for (const a of areas) {
    await db.runAsync(
      'INSERT INTO inv_areas_cache (id, nombre, icono, orden) VALUES (?, ?, ?, ?)',
      [a.id, a.nombre, a.icono, a.orden]
    )
  }
}

export function getDatabase(): SQLite.SQLiteDatabase {
  return db
}
