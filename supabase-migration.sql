-- Tabla de catálogo de materiales
CREATE TABLE IF NOT EXISTS inv_materiales (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  codigo TEXT NOT NULL,
  icono TEXT NOT NULL
);

-- Insertar materiales por defecto
INSERT INTO inv_materiales (id, nombre, codigo, icono) VALUES
  ('cobre', 'Cobre', 'CB-001', '🟤'),
  ('pote', 'Pote', 'PT-002', '⚪'),
  ('aluminio', 'Aluminio', 'AL-003', '⚙️'),
  ('bronce', 'Bronce', 'BR-004', '🟠'),
  ('laton', 'Latón', 'LT-005', '🟡'),
  ('acero', 'Acero', 'AC-006', '⚫')
ON CONFLICT (id) DO NOTHING;

-- Tabla de registros de pesada
CREATE TABLE IF NOT EXISTS inv_registros (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES inv_materiales(id),
  contenedor TEXT NOT NULL,
  tara REAL NOT NULL DEFAULT 0,
  peso_bruto REAL NOT NULL,
  peso_neto REAL NOT NULL,
  observaciones TEXT DEFAULT '',
  fotos_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  synced INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_registros_material ON inv_registros(material_id);
CREATE INDEX IF NOT EXISTS idx_registros_created ON inv_registros(created_at DESC);

-- Tabla de metadatos de fotos
CREATE TABLE IF NOT EXISTS inv_fotos (
  id TEXT PRIMARY KEY,
  registro_id TEXT NOT NULL REFERENCES inv_registros(id) ON DELETE CASCADE,
  url TEXT DEFAULT '',
  path_local TEXT NOT NULL,
  orden INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fotos_registro ON inv_fotos(registro_id);

-- Bucket de storage para fotos
INSERT INTO storage.buckets (id, name, public) VALUES ('inv_fotos', 'inv_fotos', false)
ON CONFLICT (id) DO NOTHING;

-- Política de seguridad: permitir a usuarios autenticados leer/escribir
CREATE POLICY "Usuarios autenticados pueden leer inv_registros"
  ON inv_registros FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar inv_registros"
  ON inv_registros FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar inv_registros"
  ON inv_registros FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados pueden leer inv_fotos"
  ON inv_fotos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar inv_fotos"
  ON inv_fotos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden leer inv_materiales"
  ON inv_materiales FOR SELECT TO authenticated USING (true);
