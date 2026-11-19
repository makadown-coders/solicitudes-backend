-- ============================================================================
-- MIGRACIÓN RH-4A.3A: Tabla independiente de comisiones laborales
-- Archivo: sql/rh/003_comisiones_laborales.sql
--
-- IMPORTANTE:
-- - NO modifica public.persona ni public.rh_adscripcion_laboral.
-- - Las comisiones representan asignaciones temporales o abiertas a otra unidad
--   o área administrativa sin reemplazar ni sobrescribir la adscripción oficial.
-- - Soporta OFICINA CENTRAL (unidad_medica.id = 177, cluesimb = 'N/A') y áreas
--   administrativas sin CLUES mediante area_destino_texto.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rh_comision_laboral (
  id                    SERIAL PRIMARY KEY,
  persona_id            INTEGER NOT NULL REFERENCES public.persona(id),
  adscripcion_origen_id INTEGER NULL REFERENCES public.rh_adscripcion_laboral(id),
  unidad_destino_id     INTEGER NULL REFERENCES public.unidad_medica(id),
  area_destino_texto    VARCHAR(160) NULL,
  fecha_inicio          DATE NOT NULL,
  fecha_fin             DATE NULL,
  motivo                VARCHAR(200) NULL,
  oficio_referencia     VARCHAR(120) NULL,
  observaciones         TEXT NULL,
  activo                BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por            UUID NULL REFERENCES public.app_users(id),
  actualizado_por       UUID NULL REFERENCES public.app_users(id),
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rh_comision_destino CHECK (
    unidad_destino_id IS NOT NULL OR NULLIF(BTRIM(area_destino_texto), '') IS NOT NULL
  ),
  CONSTRAINT chk_rh_comision_fechas CHECK (
    fecha_fin IS NULL OR fecha_fin >= fecha_inicio
  )
);

COMMENT ON TABLE public.rh_comision_laboral IS
  'Registro histórico y vigente de comisiones laborales por persona, independiente de public.rh_adscripcion_laboral.';

COMMENT ON COLUMN public.rh_comision_laboral.adscripcion_origen_id IS
  'Referencia opcional a la adscripción oficial de origen; cuando es NULL, la comisión queda sin referencia formal previa.';

COMMENT ON COLUMN public.rh_comision_laboral.fecha_fin IS
  'Fecha de término de la comisión; NULL indica duración abierta (no autorización perpetua).';

CREATE INDEX IF NOT EXISTS idx_rh_comision_persona_vigencia
  ON public.rh_comision_laboral (persona_id, activo, fecha_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_rh_comision_unidad_destino
  ON public.rh_comision_laboral (unidad_destino_id, activo)
  WHERE unidad_destino_id IS NOT NULL;
