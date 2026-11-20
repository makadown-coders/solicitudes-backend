-- ============================================================================
-- MIGRACIÓN RH-4A.7B: Fechas institucionales del trabajador en public.persona
-- Archivo: sql/rh/006_fechas_institucionales_persona.sql
--
-- PRECONDICIONES:
-- - Existe public.persona.
-- - Respaldo previo verificado conforme a política institucional.
--
-- IMPORTANTE:
-- - NO modifica valores existentes en public.persona.
-- - NO rellena fecha_ingreso a partir de rh_adscripcion_laboral.vigente_desde.
-- - NO impone defaults artificiales ni recalcula antigüedad o derechos.
-- - NO crea columnas ambiguas; fecha_entrada permanece comentada hasta que
--   Recursos Humanos confirme su definición institucional exacta.
-- - El responsable del proyecto ejecuta manualmente este script.
-- ============================================================================

ALTER TABLE public.persona
  ADD COLUMN IF NOT EXISTS fecha_ingreso DATE NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_persona_fecha_ingreso_rango'
       AND conrelid = 'public.persona'::regclass
  ) THEN
    ALTER TABLE public.persona
      ADD CONSTRAINT chk_persona_fecha_ingreso_rango
      CHECK (
        fecha_ingreso IS NULL
        OR (fecha_ingreso >= DATE '1940-01-01' AND fecha_ingreso <= DATE '2100-12-31')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.persona.fecha_ingreso IS
  'Fecha de inicio de la relación laboral institucional del trabajador, independiente de cambios de adscripción laboral.';

-- ============================================================================
-- PROPUESTA PENDIENTE DE DEFINICIÓN POR RH (NO EJECUTADA / COMENTADA):
-- Definir si "fecha_entrada" corresponde a fecha de entrada a la unidad actual,
-- fecha de reingreso, o si ya queda cubierta por rh_adscripcion_laboral.vigente_desde.
--
-- ALTER TABLE public.persona
--   ADD COLUMN IF NOT EXISTS fecha_entrada DATE NULL;
-- ============================================================================
