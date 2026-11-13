-- =============================================================================
-- MICROINTERVENCIÓN RH-VAC-DB.1 — VERIFICACIÓN (SOLO LECTURA)
-- Archivo: sql/rh/002_vacaciones_base/002_vacaciones_base.verify.sql
-- =============================================================================

-- 1. Existencia de tablas
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'rh_vacacion_derecho',
    'rh_vacacion_disfrute',
    'rh_vacacion_movimiento'
  )
ORDER BY table_name;

-- 2. Columnas y tipos
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'rh_vacacion_derecho',
    'rh_vacacion_disfrute',
    'rh_vacacion_movimiento'
  )
ORDER BY table_name, ordinal_position;

-- 3. Claves primarias, únicas y foráneas
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'rh_vacacion_derecho',
    'rh_vacacion_disfrute',
    'rh_vacacion_movimiento'
  )
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

-- 4. Restricciones CHECK
SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
  'public.rh_vacacion_derecho'::regclass,
  'public.rh_vacacion_disfrute'::regclass,
  'public.rh_vacacion_movimiento'::regclass
)
  AND contype = 'c'
ORDER BY table_name, conname;

-- 5. Índices creados
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'rh_vacacion_derecho',
    'rh_vacacion_disfrute',
    'rh_vacacion_movimiento'
  )
ORDER BY tablename, indexname;
