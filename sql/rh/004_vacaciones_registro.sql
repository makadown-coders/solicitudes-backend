-- ============================================================================
-- MIGRACIÓN RH-4A.4A: Registro administrativo de periodos vacacionales
-- Archivo: sql/rh/004_vacaciones_registro.sql
--
-- IMPORTANTE:
-- - NO modifica public.persona, public.rh_adscripcion_laboral ni
--   public.rh_comision_laboral.
-- - NO calcula derechos, antigüedad ni saldos automáticos.
-- - NO representa autorización formal por sí solo; documenta la captura
--   administrativa de RH y conserva historial mediante anulación lógica.
-- - El responsable del proyecto ejecuta manualmente este script.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rh_vacacion_registro (
  id                   SERIAL PRIMARY KEY,
  persona_id           INTEGER NOT NULL REFERENCES public.persona(id),
  adscripcion_id       INTEGER NULL REFERENCES public.rh_adscripcion_laboral(id),
  anio_ciclo           SMALLINT NOT NULL,
  periodo_referencia   VARCHAR(80) NOT NULL,
  fecha_inicio         DATE NOT NULL,
  fecha_fin            DATE NOT NULL,
  dias_registrados     SMALLINT NOT NULL,
  documento_referencia VARCHAR(120) NULL,
  observaciones        TEXT NULL,
  estado               VARCHAR(20) NOT NULL DEFAULT 'REGISTRADO',
  motivo_anulacion     VARCHAR(300) NULL,
  anulado_por          UUID NULL REFERENCES public.app_users(id),
  anulado_en           TIMESTAMPTZ NULL,
  creado_por           UUID NULL REFERENCES public.app_users(id),
  actualizado_por      UUID NULL REFERENCES public.app_users(id),
  creado_en            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_vacacion_anio_ciclo CHECK (
    anio_ciclo BETWEEN 1990 AND 2100
  ),
  CONSTRAINT chk_rh_vacacion_periodo_ref CHECK (
    NULLIF(BTRIM(periodo_referencia), '') IS NOT NULL
  ),
  CONSTRAINT chk_rh_vacacion_fechas CHECK (
    fecha_fin >= fecha_inicio
  ),
  CONSTRAINT chk_rh_vacacion_dias CHECK (
    dias_registrados BETWEEN 1 AND 366
  ),
  CONSTRAINT chk_rh_vacacion_estado CHECK (
    estado IN ('REGISTRADO', 'ANULADO')
  ),
  CONSTRAINT chk_rh_vacacion_motivo_anulacion CHECK (
    estado <> 'ANULADO' OR NULLIF(BTRIM(motivo_anulacion), '') IS NOT NULL
  )
);

COMMENT ON TABLE public.rh_vacacion_registro IS
  'Historial administrativo de periodos vacacionales capturados por RH por trabajador, independiente de adscripciones y comisiones.';

COMMENT ON COLUMN public.rh_vacacion_registro.dias_registrados IS
  'Número de días reconocidos y capturados manualmente por RH; no implica cálculo automático de derechos ni saldos.';

COMMENT ON COLUMN public.rh_vacacion_registro.estado IS
  'Estado administrativo del registro: REGISTRADO o ANULADO (sin borrado físico).';

CREATE INDEX IF NOT EXISTS idx_rh_vacacion_persona_ciclo
  ON public.rh_vacacion_registro (persona_id, anio_ciclo DESC, fecha_inicio DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_rh_vacacion_persona_estado
  ON public.rh_vacacion_registro (persona_id, estado);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_vacacion_duplicado_activo
  ON public.rh_vacacion_registro (persona_id, anio_ciclo, fecha_inicio, fecha_fin)
  WHERE estado = 'REGISTRADO';
