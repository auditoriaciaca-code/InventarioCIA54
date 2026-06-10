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

    CREATE TABLE IF NOT EXISTS inv_registros (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL,
      contenedor TEXT NOT NULL,
      tara REAL NOT NULL DEFAULT 0,
      peso_bruto REAL NOT NULL,
      peso_neto REAL NOT NULL,
      observaciones TEXT DEFAULT '',
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
  `)

  await seedMateriales()
}

async function seedMateriales(): Promise<void> {
  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM inv_materiales')
  if (count && count.count > 0) return

  const materiales = [
    { id: 'cobre', nombre: 'Cobre', codigo: 'CB-001', icono: '🟤' },
    { id: 'pote', nombre: 'Pote', codigo: 'PT-002', icono: '⚪' },
    { id: 'aluminio', nombre: 'Aluminio', codigo: 'AL-003', icono: '⚙️' },
    { id: 'bronce', nombre: 'Bronce', codigo: 'BR-004', icono: '🟠' },
    { id: 'laton', nombre: 'Latón', codigo: 'LT-005', icono: '🟡' },
    { id: 'acero', nombre: 'Acero', codigo: 'AC-006', icono: '⚫' },
  ]

  for (const m of materiales) {
    await db.runAsync(
      'INSERT INTO inv_materiales (id, nombre, codigo, icono) VALUES (?, ?, ?, ?)',
      [m.id, m.nombre, m.codigo, m.icono]
    )
  }
}

export function getDatabase(): SQLite.SQLiteDatabase {
  return db
}
