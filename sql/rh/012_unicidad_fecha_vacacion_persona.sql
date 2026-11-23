-- =============================================================================
-- PROYECTO RH | RH-VAC-06
-- Índice único parcial adicional para garantizar a nivel PostgreSQL que una
-- misma fecha computable activa no pueda registrarse en dos periodos de origen
-- distintos para la misma persona (prevención de doble consumo bajo concurrencia).
--
-- ADVERTENCIA:
--   - NO ejecutar automáticamente. Revisar y ejecutar manualmente por el responsable
--     antes de habilitar el registro excepcional fuera de periodo en producción.
-- =============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_vacacion_fecha_computable_persona_activa
  ON public.rh_vacacion_registro_fecha (persona_id, fecha)
  WHERE (activo = TRUE AND computable = TRUE);

COMMIT;
