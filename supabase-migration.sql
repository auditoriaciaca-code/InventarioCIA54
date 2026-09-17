-- Tabla de catálogo de materiales
CREATE TABLE IF NOT EXISTS inv_materiales (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  codigo TEXT NOT NULL,
  icono TEXT NOT NULL
);

-- Insertar materiales por defecto
INSERT INTO inv_materiales (id, nombre, codigo, icono) VALUES
  ('aceros', 'Aceros', 'ACEROS', '⚙️'),
  ('aluminios', 'Aluminios', 'ALUMINIOS', '⚪'),
  ('pote', 'POTE', 'POTE', '🥫'),
  ('bronce', 'BRONCE', 'BRONCE', '🟠'),
  ('cobre', 'Cobre', 'COBRE', '🟤'),
  ('radiadores_cobre', 'Radiadores de Cobre', 'RAD-COBRE', '🔴'),
  ('radiadores_mixtos', 'Radiadores Mixtos', 'RAD-MIX', '🔶'),
  ('scrap', 'SCRAP', 'SCRAP', '🗑️'),
  ('baterias', 'BATERIAS', 'BATERIAS', '🔋'),
  ('electronica', 'ELECTRONICA', 'ELECTRONICA', '💻'),
  ('chatarra_hierro', 'CHATARRA DE HIERRO', 'HIERRO', '🪨')
ON CONFLICT (id) DO NOTHING;

-- Tabla de sesiones de inventario
CREATE TABLE IF NOT EXISTS inv_sesiones (
  id TEXT PRIMARY KEY,
  nombre_operador TEXT NOT NULL,
  fecha TEXT NOT NULL,
  activa INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Tabla de registros de pesada
CREATE TABLE IF NOT EXISTS inv_registros (
  id TEXT PRIMARY KEY,
  sesion_id TEXT NOT NULL,
  material_id TEXT NOT NULL REFERENCES inv_materiales(id),
  referencia_codigo TEXT DEFAULT '',
  referencia_descripcion TEXT DEFAULT '',
  contenedor TEXT NOT NULL,
  tara REAL NOT NULL DEFAULT 0,
  peso_bruto REAL NOT NULL,
  peso_neto REAL NOT NULL,
  observaciones TEXT DEFAULT '',
  codigo_barras TEXT DEFAULT '',
  fotos_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  synced INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_registros_material ON inv_registros(material_id);
CREATE INDEX IF NOT EXISTS idx_registros_sesion ON inv_registros(sesion_id);
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

-- Desactivar RLS para uso interno
ALTER TABLE inv_materiales DISABLE ROW LEVEL SECURITY;
ALTER TABLE inv_sesiones DISABLE ROW LEVEL SECURITY;
ALTER TABLE inv_registros DISABLE ROW LEVEL SECURITY;
ALTER TABLE inv_fotos DISABLE ROW LEVEL SECURITY;

-- =====================================================================
-- INVENTARIO GENERAL POR ÁREAS + DOBLE CONTEO CIEGO   (2026-09)
-- Ejecutar este bloque en el editor SQL de Supabase ANTES de publicar
-- la versión de la app que agrega áreas. Es idempotente (se puede
-- volver a ejecutar sin duplicar nada).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- 1. Catálogo fijo de áreas -------------------------------------------
CREATE TABLE IF NOT EXISTS inv_areas (
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  icono  TEXT NOT NULL DEFAULT '',
  orden  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO inv_areas (id, nombre, icono, orden) VALUES
  ('produccion',      'Producción',      '🏭', 1),
  ('cargue',          'Cargue',          '⬆️', 2),
  ('tarjeta',         'Tarjeta',         '🎫', 3),
  ('descargue_sur',   'Descargue Sur',   '🔽', 4),
  ('descargue_norte', 'Descargue Norte', '🔼', 5)
ON CONFLICT (id) DO NOTHING;

-- 2. Columnas nuevas ---------------------------------------------------
ALTER TABLE inv_sesiones  ADD COLUMN IF NOT EXISTS area_id TEXT DEFAULT '';
ALTER TABLE inv_registros ADD COLUMN IF NOT EXISTS area_id TEXT DEFAULT '';
-- Estado de emparejamiento (solo servidor; la app nunca envía estas columnas)
ALTER TABLE inv_registros ADD COLUMN IF NOT EXISTS emparejado     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inv_registros ADD COLUMN IF NOT EXISTS comparacion_id UUID;

CREATE INDEX IF NOT EXISTS idx_registros_area ON inv_registros(area_id);
-- Índice que soporta la búsqueda FIFO del trigger
CREATE INDEX IF NOT EXISTS idx_registros_pairing
  ON inv_registros(area_id, material_id, emparejado, created_at);

-- 3. Tabla de comparaciones -------------------------------------------
CREATE TABLE IF NOT EXISTS inv_comparaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id       TEXT NOT NULL,
  material_id   TEXT NOT NULL,
  registro_a_id TEXT NOT NULL REFERENCES inv_registros(id) ON DELETE CASCADE,
  registro_b_id TEXT NOT NULL REFERENCES inv_registros(id) ON DELETE CASCADE,
  sesion_a_id   TEXT NOT NULL,
  sesion_b_id   TEXT NOT NULL,
  operador_a    TEXT DEFAULT '',
  operador_b    TEXT DEFAULT '',
  referencia_a  TEXT DEFAULT '',
  referencia_b  TEXT DEFAULT '',
  misma_referencia BOOLEAN NOT NULL DEFAULT TRUE,
  peso_a        REAL NOT NULL,
  peso_b        REAL NOT NULL,
  diferencia    REAL NOT NULL,
  tolerancia    REAL NOT NULL DEFAULT 1,
  estado        TEXT NOT NULL CHECK (estado IN ('ok','alerta')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comparaciones_area    ON inv_comparaciones(area_id);
CREATE INDEX IF NOT EXISTS idx_comparaciones_estado  ON inv_comparaciones(estado);
CREATE INDEX IF NOT EXISTS idx_comparaciones_created ON inv_comparaciones(created_at DESC);
-- Un registro no puede usarse dos veces en el mismo rol de la comparación
CREATE UNIQUE INDEX IF NOT EXISTS uq_comparaciones_registro_a ON inv_comparaciones(registro_a_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comparaciones_registro_b ON inv_comparaciones(registro_b_id);

ALTER TABLE inv_areas         DISABLE ROW LEVEL SECURITY;
ALTER TABLE inv_comparaciones DISABLE ROW LEVEL SECURITY;

-- 4. Función de emparejamiento FIFO (área + material, ventana de tiempo) --
CREATE OR REPLACE FUNCTION fn_emparejar_registro()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  -- >>> CONSTANTES AJUSTABLES <<<
  v_ventana     INTERVAL := INTERVAL '3 minutes';  -- ventana FIFO área+material
  v_tolerancia  REAL     := 1.0;                   -- kg de diferencia permitida
  -- <<< >>>
  v_par         inv_registros%ROWTYPE;
  v_comp_id     UUID;
  v_dif         REAL;
BEGIN
  -- Nunca abortar el INSERT del registro por un fallo del emparejamiento
  BEGIN
    IF COALESCE(NEW.area_id,'') = '' OR NEW.emparejado THEN
      RETURN NULL;
    END IF;

    SELECT r.* INTO v_par
    FROM inv_registros r
    WHERE r.area_id     = NEW.area_id
      AND r.material_id = NEW.material_id
      AND r.sesion_id  <> NEW.sesion_id
      AND r.emparejado  = FALSE
      AND r.id         <> NEW.id
      AND r.created_at >= NEW.created_at - v_ventana
      AND r.created_at <= NEW.created_at + v_ventana
    ORDER BY r.created_at ASC, r.id ASC   -- FIFO: el más antiguo sin pareja
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    v_dif := ABS(v_par.peso_neto - NEW.peso_neto);

    INSERT INTO inv_comparaciones (
      area_id, material_id,
      registro_a_id, registro_b_id, sesion_a_id, sesion_b_id,
      operador_a, operador_b, referencia_a, referencia_b, misma_referencia,
      peso_a, peso_b, diferencia, tolerancia, estado
    ) VALUES (
      NEW.area_id, NEW.material_id,
      v_par.id, NEW.id, v_par.sesion_id, NEW.sesion_id,
      COALESCE(v_par.created_by,''), COALESCE(NEW.created_by,''),
      COALESCE(v_par.referencia_codigo,''), COALESCE(NEW.referencia_codigo,''),
      COALESCE(v_par.referencia_codigo,'') = COALESCE(NEW.referencia_codigo,''),
      v_par.peso_neto, NEW.peso_neto,
      v_dif, v_tolerancia,
      CASE WHEN v_dif > v_tolerancia THEN 'alerta' ELSE 'ok' END
    )
    RETURNING id INTO v_comp_id;

    UPDATE inv_registros
       SET emparejado = TRUE, comparacion_id = v_comp_id
     WHERE id IN (v_par.id, NEW.id);

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_emparejar_registro falló para % : %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_emparejar_registro ON inv_registros;
CREATE TRIGGER trg_emparejar_registro
AFTER INSERT ON inv_registros
FOR EACH ROW EXECUTE FUNCTION fn_emparejar_registro();

-- 5. Recálculo cuando se edita un peso ya emparejado -------------------
CREATE OR REPLACE FUNCTION fn_recalcular_comparacion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dif REAL;
BEGIN
  BEGIN
    IF NEW.comparacion_id IS NULL OR NEW.peso_neto IS NOT DISTINCT FROM OLD.peso_neto THEN
      RETURN NULL;
    END IF;

    UPDATE inv_comparaciones c
       SET peso_a = CASE WHEN c.registro_a_id = NEW.id THEN NEW.peso_neto ELSE c.peso_a END,
           peso_b = CASE WHEN c.registro_b_id = NEW.id THEN NEW.peso_neto ELSE c.peso_b END
     WHERE c.id = NEW.comparacion_id;

    UPDATE inv_comparaciones c
       SET diferencia     = ABS(c.peso_a - c.peso_b),
           estado         = CASE WHEN ABS(c.peso_a - c.peso_b) > c.tolerancia THEN 'alerta' ELSE 'ok' END,
           actualizado_at = NOW()
     WHERE c.id = NEW.comparacion_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_recalcular_comparacion falló para % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalcular_comparacion ON inv_registros;
CREATE TRIGGER trg_recalcular_comparacion
AFTER UPDATE OF peso_neto ON inv_registros
FOR EACH ROW EXECUTE FUNCTION fn_recalcular_comparacion();

-- 6. Vistas de apoyo para el supervisor ---------------------------------
CREATE OR REPLACE VIEW v_comparaciones_alertas AS
SELECT c.*, a.nombre AS area_nombre
FROM inv_comparaciones c
LEFT JOIN inv_areas a ON a.id = c.area_id
WHERE c.estado = 'alerta'
ORDER BY c.created_at DESC;

CREATE OR REPLACE VIEW v_registros_sin_pareja AS
SELECT r.id, r.area_id, a.nombre AS area_nombre, r.material_id,
       r.referencia_codigo, r.created_by AS operador,
       r.peso_neto, r.created_at
FROM inv_registros r
LEFT JOIN inv_areas a ON a.id = r.area_id
WHERE r.emparejado = FALSE
  AND COALESCE(r.area_id,'') <> ''
  AND r.created_at < NOW() - INTERVAL '10 minutes'
ORDER BY r.created_at DESC;

-- 7. Realtime -----------------------------------------------------------
ALTER TABLE inv_comparaciones REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE inv_comparaciones;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================================
-- CANDADO DE SALA POR OPERADOR   (2026-09)
-- Un operador (nombre + área) queda "ocupado" hasta que libera su sesión
-- explícitamente con el botón "Salir". Sin liberación automática por
-- inactividad — a propósito, ver AGENTS.md.
-- =====================================================================
ALTER TABLE inv_sesiones ADD COLUMN IF NOT EXISTS liberada_at TIMESTAMPTZ;

-- =====================================================================
-- EMPAREJAMIENTO POR MEJOR PESO (con corrección sobre la marcha)  (2026-09)
-- Antes: emparejaba por orden de llegada (FIFO) dentro de una ventana de
-- 3 minutos. Problema: si un operador se atrasa y carga varias pesadas de
-- golpe fuera de esa ventana, o si ambos cargan pesadas del mismo minuto
-- pero en orden distinto, se emparejaba mal.
--
-- Ahora: para cada pesada nueva, busca en TODO el día la pesada del otro
-- operador (misma área+material) que tenga el peso más parecido — incluso
-- si esa pesada ya tiene pareja: si la nueva encaja mejor, le "roba" el
-- lugar. La comparación robada queda marcada estado='anulada' (no se
-- borra, es historial) y quien perdió su pareja queda libre para
-- emparejar con la siguiente pesada que llegue.
-- =====================================================================

-- 'anulada': una comparación fue reemplazada porque llegó una pesada que
-- encajaba mejor con alguno de los 2 lados. No cuenta como alerta ni como
-- ok — es historial de una corrección automática.
ALTER TABLE inv_comparaciones DROP CONSTRAINT IF EXISTS inv_comparaciones_estado_check;
ALTER TABLE inv_comparaciones ADD CONSTRAINT inv_comparaciones_estado_check CHECK (estado IN ('ok','alerta','anulada'));

-- Los índices únicos anteriores impedían que un registro apareciera en más
-- de una comparación jamás — pero ahora un registro liberado por un "robo"
-- sí necesita poder emparejarse de nuevo más adelante. Se reemplazan por
-- índices parciales: únicos solo entre las comparaciones vigentes.
DROP INDEX IF EXISTS uq_comparaciones_registro_a;
DROP INDEX IF EXISTS uq_comparaciones_registro_b;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comparaciones_registro_a_vigente
  ON inv_comparaciones(registro_a_id) WHERE estado <> 'anulada';
CREATE UNIQUE INDEX IF NOT EXISTS uq_comparaciones_registro_b_vigente
  ON inv_comparaciones(registro_b_id) WHERE estado <> 'anulada';

CREATE OR REPLACE FUNCTION fn_emparejar_registro()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tolerancia    REAL := 1.0;
  v_mejor_id      TEXT;
  v_mejor_pareado BOOLEAN;
  v_y             inv_registros%ROWTYPE;
  v_comp_previa   UUID;
  v_pareja_previa TEXT;
  v_comp_id       UUID;
  v_dif           REAL;
BEGIN
  BEGIN
    IF COALESCE(NEW.area_id,'') = '' THEN
      RETURN NULL;
    END IF;

    -- Mejor candidato del otro operador para esta área+material: el de
    -- peso más parecido, sea que ya tenga pareja (solo cuenta si NEW
    -- encaja mejor que su pareja actual) o esté libre.
    SELECT r.id, r.emparejado
      INTO v_mejor_id, v_mejor_pareado
    FROM inv_registros r
    LEFT JOIN inv_comparaciones c ON c.id = r.comparacion_id
    WHERE r.area_id     = NEW.area_id
      AND r.material_id = NEW.material_id
      AND r.sesion_id  <> NEW.sesion_id
      AND r.id         <> NEW.id
      AND (r.emparejado = FALSE OR ABS(r.peso_neto - NEW.peso_neto) < c.diferencia)
    ORDER BY ABS(r.peso_neto - NEW.peso_neto) ASC
    LIMIT 1;

    IF v_mejor_id IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT * INTO v_y FROM inv_registros WHERE id = v_mejor_id FOR UPDATE;

    IF v_y.emparejado THEN
      -- "Robo": NEW encaja mejor con v_y que su pareja actual. Se anula
      -- esa comparación y se libera a quien pierde su lugar.
      v_comp_previa := v_y.comparacion_id;

      SELECT CASE WHEN registro_a_id = v_mejor_id THEN registro_b_id ELSE registro_a_id END
        INTO v_pareja_previa
      FROM inv_comparaciones WHERE id = v_comp_previa;

      UPDATE inv_registros SET emparejado = FALSE, comparacion_id = NULL WHERE id = v_pareja_previa;
      UPDATE inv_comparaciones SET estado = 'anulada', actualizado_at = NOW() WHERE id = v_comp_previa;
    END IF;

    v_dif := ABS(v_y.peso_neto - NEW.peso_neto);

    INSERT INTO inv_comparaciones (
      area_id, material_id,
      registro_a_id, registro_b_id, sesion_a_id, sesion_b_id,
      operador_a, operador_b, referencia_a, referencia_b, misma_referencia,
      peso_a, peso_b, diferencia, tolerancia, estado
    ) VALUES (
      NEW.area_id, NEW.material_id,
      v_y.id, NEW.id, v_y.sesion_id, NEW.sesion_id,
      COALESCE(v_y.created_by,''), COALESCE(NEW.created_by,''),
      COALESCE(v_y.referencia_codigo,''), COALESCE(NEW.referencia_codigo,''),
      COALESCE(v_y.referencia_codigo,'') = COALESCE(NEW.referencia_codigo,''),
      v_y.peso_neto, NEW.peso_neto,
      v_dif, v_tolerancia,
      CASE WHEN v_dif > v_tolerancia THEN 'alerta' ELSE 'ok' END
    )
    RETURNING id INTO v_comp_id;

    UPDATE inv_registros
       SET emparejado = TRUE, comparacion_id = v_comp_id
     WHERE id IN (v_y.id, NEW.id);

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_emparejar_registro falló para % : %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

-- =====================================================================
-- REALTIME PARA PLATAFORMA WEB (/web)  (2026-09)
-- La plataforma web de supervisión escucha inserts de inv_registros para
-- mostrar las pesadas en vivo (mismo patrón que ya se usaba para
-- inv_comparaciones más arriba).
-- =====================================================================
ALTER TABLE inv_registros REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE inv_registros;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================================
-- EMPAREJAR SOLO POR LA MISMA REFERENCIA EXACTA   (2026-09)
-- Antes: emparejaba por mismo material_id (ej. "cobre"), sin importar si
-- la referencia_codigo era distinta (15001 vs 15027) — solo lo marcaba con
-- misma_referencia=false. Eso generaba comparaciones sin sentido cuando no
-- había otra pesada disponible con la referencia correcta (ej. una
-- diferencia de 68kg comparando dos referencias distintas de cobre).
--
-- Ahora: solo empareja si material_id Y referencia_codigo son iguales.
-- Si los 2 operadores llegan a elegir referencias distintas para el mismo
-- ítem físico, esas pesadas ya no se comparan entre sí (antes sí, con la
-- bandera misma_referencia=false).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_emparejar_registro()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tolerancia    REAL := 1.0;
  v_mejor_id      TEXT;
  v_mejor_pareado BOOLEAN;
  v_y             inv_registros%ROWTYPE;
  v_comp_previa   UUID;
  v_pareja_previa TEXT;
  v_comp_id       UUID;
  v_dif           REAL;
BEGIN
  BEGIN
    IF COALESCE(NEW.area_id,'') = '' THEN
      RETURN NULL;
    END IF;

    -- Mejor candidato del otro operador para esta área+material+referencia
    -- exacta: el de peso más parecido, sea que ya tenga pareja (solo
    -- cuenta si NEW encaja mejor que su pareja actual) o esté libre.
    SELECT r.id, r.emparejado
      INTO v_mejor_id, v_mejor_pareado
    FROM inv_registros r
    LEFT JOIN inv_comparaciones c ON c.id = r.comparacion_id
    WHERE r.area_id           = NEW.area_id
      AND r.material_id       = NEW.material_id
      AND r.referencia_codigo = NEW.referencia_codigo
      AND r.sesion_id        <> NEW.sesion_id
      AND r.id               <> NEW.id
      AND (r.emparejado = FALSE OR ABS(r.peso_neto - NEW.peso_neto) < c.diferencia)
    ORDER BY ABS(r.peso_neto - NEW.peso_neto) ASC
    LIMIT 1;

    IF v_mejor_id IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT * INTO v_y FROM inv_registros WHERE id = v_mejor_id FOR UPDATE;

    IF v_y.emparejado THEN
      -- "Robo": NEW encaja mejor con v_y que su pareja actual. Se anula
      -- esa comparación y se libera a quien pierde su lugar.
      v_comp_previa := v_y.comparacion_id;

      SELECT CASE WHEN registro_a_id = v_mejor_id THEN registro_b_id ELSE registro_a_id END
        INTO v_pareja_previa
      FROM inv_comparaciones WHERE id = v_comp_previa;

      UPDATE inv_registros SET emparejado = FALSE, comparacion_id = NULL WHERE id = v_pareja_previa;
      UPDATE inv_comparaciones SET estado = 'anulada', actualizado_at = NOW() WHERE id = v_comp_previa;
    END IF;

    v_dif := ABS(v_y.peso_neto - NEW.peso_neto);

    INSERT INTO inv_comparaciones (
      area_id, material_id,
      registro_a_id, registro_b_id, sesion_a_id, sesion_b_id,
      operador_a, operador_b, referencia_a, referencia_b, misma_referencia,
      peso_a, peso_b, diferencia, tolerancia, estado
    ) VALUES (
      NEW.area_id, NEW.material_id,
      v_y.id, NEW.id, v_y.sesion_id, NEW.sesion_id,
      COALESCE(v_y.created_by,''), COALESCE(NEW.created_by,''),
      COALESCE(v_y.referencia_codigo,''), COALESCE(NEW.referencia_codigo,''),
      TRUE,
      v_y.peso_neto, NEW.peso_neto,
      v_dif, v_tolerancia,
      CASE WHEN v_dif > v_tolerancia THEN 'alerta' ELSE 'ok' END
    )
    RETURNING id INTO v_comp_id;

    UPDATE inv_registros
       SET emparejado = TRUE, comparacion_id = v_comp_id
     WHERE id IN (v_y.id, NEW.id);

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_emparejar_registro falló para % : %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;
