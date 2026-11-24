-- =============================================================================
-- MIGRACIÓN RH-ASIS-05B1: Procedencia histórica en control mensual de asistencia
-- Archivo: sql/rh/015_procedencia_asistencia_historica.sql
--
-- PRECONDICIONES:
-- - Existe public.rh_asistencia_entrega_mensual (SQL 014 aplicado).
-- - Respaldo previo verificado conforme a política institucional.
--
-- IMPORTANTE:
-- - Script idempotente: seguro de ejecutar una vez o repetirse.
-- - NO modifica registros existentes a origen histórico (default CAPTURA_SISTEMA).
-- - NO inserta recepciones, NO importa personas, NO importa Excel, NO modifica auditorías.
-- - El responsable del proyecto ejecuta manualmente este script.
-- =============================================================================

BEGIN;

-- 1. Columnas de procedencia histórica
ALTER TABLE public.rh_asistencia_entrega_mensual
  ADD COLUMN IF NOT EXISTS origen_registro VARCHAR(30) NOT NULL DEFAULT 'CAPTURA_SISTEMA',
  ADD COLUMN IF NOT EXISTS referencia_migracion JSONB NULL,
  ADD COLUMN IF NOT EXISTS importado_en TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS importado_por UUID NULL REFERENCES public.app_users(id);

-- 2. Restricción de catálogo de origen_registro
ALTER TABLE public.rh_asistencia_entrega_mensual
  DROP CONSTRAINT IF EXISTS chk_rh_asis_entrega_origen_registro;

ALTER TABLE public.rh_asistencia_entrega_mensual
  ADD CONSTRAINT chk_rh_asis_entrega_origen_registro
  CHECK (origen_registro IN ('CAPTURA_SISTEMA', 'MIGRACION_HISTORICA_EXCEL'));

-- 3. Coherencia de campos de procedencia histórica (evita combinaciones inválidas con NULL)
ALTER TABLE public.rh_asistencia_entrega_mensual
  DROP CONSTRAINT IF EXISTS chk_rh_asis_entrega_procedencia_historica;

ALTER TABLE public.rh_asistencia_entrega_mensual
  ADD CONSTRAINT chk_rh_asis_entrega_procedencia_historica
  CHECK (
    (
      origen_registro = 'CAPTURA_SISTEMA'
      AND referencia_migracion IS NULL
      AND importado_en IS NULL
      AND importado_por IS NULL
    )
    OR (
      origen_registro = 'MIGRACION_HISTORICA_EXCEL'
      AND importado_en IS NOT NULL
      AND importado_por IS NOT NULL
      AND referencia_migracion IS NOT NULL
      AND jsonb_typeof(referencia_migracion) = 'object'
      AND NULLIF(BTRIM(COALESCE(referencia_migracion->>'archivo_hash', '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(referencia_migracion->>'hoja', '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(referencia_migracion->>'fila', '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(referencia_migracion->>'columna', '')), '') IS NOT NULL
    )
  );

-- 4. Ajuste de coherencia de recepción:
--    - CAPTURA_SISTEMA + RECIBIDA: exige fecha_recepcion NOT NULL y recibido_por NOT NULL.
--    - MIGRACION_HISTORICA_EXCEL + RECIBIDA: permite fecha_recepcion NULL (fecha original
--      desconocida) y recibido_por NULL (no atribuir recepción original al importador),
--      exigiendo importado_en, importado_por y referencia_migracion vía constraint anterior.
--    - Cualquier otro estado (<> 'RECIBIDA'): exige fecha_recepcion IS NULL y recibido_por IS NULL.
ALTER TABLE public.rh_asistencia_entrega_mensual
  DROP CONSTRAINT IF EXISTS chk_rh_asis_entrega_coherencia_recepcion;

ALTER TABLE public.rh_asistencia_entrega_mensual
  ADD CONSTRAINT chk_rh_asis_entrega_coherencia_recepcion
  CHECK (
    (
      estado = 'RECIBIDA'
      AND origen_registro = 'CAPTURA_SISTEMA'
      AND fecha_recepcion IS NOT NULL
      AND recibido_por IS NOT NULL
    )
    OR (
      estado = 'RECIBIDA'
      AND origen_registro = 'MIGRACION_HISTORICA_EXCEL'
      AND recibido_por IS NULL
    )
    OR (
      estado <> 'RECIBIDA'
      AND fecha_recepcion IS NULL
      AND recibido_por IS NULL
    )
  );

-- 5. Índice para filtrar por procedencia histórica
CREATE INDEX IF NOT EXISTS idx_rh_asis_entrega_origen_periodo
  ON public.rh_asistencia_entrega_mensual (origen_registro, anio, mes);

-- 6. Comentarios
COMMENT ON COLUMN public.rh_asistencia_entrega_mensual.origen_registro IS
  'Procedencia del registro: CAPTURA_SISTEMA (predeterminado) o MIGRACION_HISTORICA_EXCEL.';

COMMENT ON COLUMN public.rh_asistencia_entrega_mensual.referencia_migracion IS
  'Trazabilidad JSONB obligatoria para registros migrados (archivo_nombre, archivo_hash, hoja, fila, columna, valor_original).';

COMMENT ON COLUMN public.rh_asistencia_entrega_mensual.importado_en IS
  'Fecha/hora de importación histórica; no sustituye a fecha_recepcion original.';

COMMENT ON COLUMN public.rh_asistencia_entrega_mensual.importado_por IS
  'UUID del operador RH GLOBAL que ejecutó la importación histórica; distinto de recibido_por.';

COMMIT;

-- =============================================================================
-- CONSULTAS DE VERIFICACIÓN (SOLO LECTURA — ejecutar manualmente tras aplicar)
-- =============================================================================
-- 1) Verificar nuevas columnas:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'rh_asistencia_entrega_mensual'
--   AND column_name IN ('origen_registro', 'referencia_migracion', 'importado_en', 'importado_por')
-- ORDER BY ordinal_position;
--
-- 2) Verificar constraints actualizados:
-- SELECT conname, pg_get_constraintdef(oid) AS definition
-- FROM pg_constraint
-- WHERE conrelid = 'public.rh_asistencia_entrega_mensual'::regclass
--   AND conname IN (
--     'chk_rh_asis_entrega_origen_registro',
--     'chk_rh_asis_entrega_procedencia_historica',
--     'chk_rh_asis_entrega_coherencia_recepcion'
--   )
-- ORDER BY conname;
--
-- 3) Verificar índice:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename = 'rh_asistencia_entrega_mensual'
--   AND indexname = 'idx_rh_asis_entrega_origen_periodo';
--
-- 4) Confirmar que ningún registro existente fue alterado a origen histórico:
-- SELECT origen_registro, COUNT(*) AS total
-- FROM public.rh_asistencia_entrega_mensual
-- GROUP BY origen_registro;
