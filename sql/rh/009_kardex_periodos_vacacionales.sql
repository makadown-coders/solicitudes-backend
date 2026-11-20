-- =============================================================================
-- PROYECTO RH | RH-VAC-01
-- Evolución del kardex de vacaciones:
--   1. Periodos vacacionales institucionales compartidos (2 por año).
--   2. Bolsa individual por persona y periodo (provisional / confirmada / ajustada).
--   3. Fechas discontinuas por movimiento con distinción computable vs excluida.
--   4. Compatibilidad total con public.rh_vacacion_registro existente.
--
-- ADVERTENCIA:
--   - NO ejecutar automáticamente. Revisar y aplicar manualmente por el responsable.
--   - NO inserta datos de trabajadores ni transforma registros históricos.
--   - NO elimina ni renombra columnas existentes de public.rh_vacacion_registro.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Catálogo compartido de periodos vacacionales institucionales
--    (2 periodos por año: Periodo 1 ene-jun, Periodo 2 jul-dic)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_vacacion_periodo (
  id                      SERIAL PRIMARY KEY,
  anio                    SMALLINT NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  numero_periodo          SMALLINT NOT NULL CHECK (numero_periodo IN (1, 2)),
  clave                   VARCHAR(20) NOT NULL,
  nombre                  VARCHAR(100) NOT NULL,
  fecha_inicio            DATE NOT NULL,
  fecha_fin               DATE NOT NULL,
  dias_base_provisionales SMALLINT NOT NULL DEFAULT 10
                          CHECK (dias_base_provisionales > 0 AND dias_base_provisionales <= 60),
  activo                  BOOLEAN NOT NULL DEFAULT TRUE,
  observaciones           TEXT NULL,
  creado_en               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rh_vacacion_periodo_anio_num UNIQUE (anio, numero_periodo),
  CONSTRAINT uq_rh_vacacion_periodo_clave UNIQUE (clave),
  CONSTRAINT chk_rh_vacacion_periodo_fechas CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_rh_vacacion_periodo_activo
  ON public.rh_vacacion_periodo (anio DESC, numero_periodo DESC)
  WHERE activo = TRUE;


-- -----------------------------------------------------------------------------
-- 2. Bolsa individual por persona y periodo institucional
--    - Distingue explícitamente asignación PROVISIONAL vs CONFIRMADA vs AJUSTADA
--    - Sin reglas automáticas de antigüedad ni arrastre automático entre periodos
--    - Incluye calendario_laboral_codigo para futura vinculación de calendarios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_vacacion_bolsa (
  id                        SERIAL PRIMARY KEY,
  persona_id                INTEGER NOT NULL
                            REFERENCES public.persona(id) ON DELETE RESTRICT,
  periodo_id                INTEGER NOT NULL
                            REFERENCES public.rh_vacacion_periodo(id) ON DELETE RESTRICT,
  dias_asignados            SMALLINT NOT NULL DEFAULT 10
                            CHECK (dias_asignados >= 0 AND dias_asignados <= 60),
  estado_asignacion         VARCHAR(20) NOT NULL DEFAULT 'PROVISIONAL'
                            CHECK (estado_asignacion IN ('PROVISIONAL', 'CONFIRMADA', 'AJUSTADA')),
  justificacion_ajuste      TEXT NULL,
  calendario_laboral_codigo VARCHAR(40) NULL,
  creado_por                UUID NULL,
  actualizado_por           UUID NULL,
  creado_en                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rh_vacacion_bolsa_persona_periodo UNIQUE (persona_id, periodo_id),
  CONSTRAINT chk_rh_vacacion_bolsa_ajuste_justif CHECK (
    estado_asignacion <> 'AJUSTADA'
    OR (justificacion_ajuste IS NOT NULL AND BTRIM(justificacion_ajuste) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_rh_vacacion_bolsa_persona
  ON public.rh_vacacion_bolsa (persona_id, periodo_id);


-- -----------------------------------------------------------------------------
-- 3. Evolución aditiva y retrocompatible de public.rh_vacacion_registro
--    - Conserva todas las columnas existentes (fecha_inicio, fecha_fin,
--      dias_registrados, estado, motivo_anulacion, etc.)
--    - Distingue movimientos históricos por rango vs detallados por fecha
-- -----------------------------------------------------------------------------
ALTER TABLE public.rh_vacacion_registro
  ADD COLUMN IF NOT EXISTS periodo_id INTEGER NULL
    REFERENCES public.rh_vacacion_periodo(id) ON DELETE RESTRICT;

ALTER TABLE public.rh_vacacion_registro
  ADD COLUMN IF NOT EXISTS modo_registro VARCHAR(20) NOT NULL DEFAULT 'RANGO_HISTORICO'
    CHECK (modo_registro IN ('RANGO_HISTORICO', 'FECHAS_DETALLADAS'));

CREATE INDEX IF NOT EXISTS idx_rh_vacacion_registro_persona_periodo
  ON public.rh_vacacion_registro (persona_id, periodo_id, estado);


-- -----------------------------------------------------------------------------
-- 4. Fechas individuales (discontinuas) asociadas a un movimiento vacacional
--    - Distingue fecha seleccionada, computable y excluida (con motivo)
--    - Evita duplicar la misma fecha computable activa para persona + periodo
--    - Compatible con anulación lógica (activo = FALSE al anular el movimiento)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_vacacion_registro_fecha (
  id               SERIAL PRIMARY KEY,
  registro_id      INTEGER NOT NULL
                   REFERENCES public.rh_vacacion_registro(id) ON DELETE CASCADE,
  persona_id       INTEGER NOT NULL
                   REFERENCES public.persona(id) ON DELETE RESTRICT,
  periodo_id       INTEGER NOT NULL
                   REFERENCES public.rh_vacacion_periodo(id) ON DELETE RESTRICT,
  fecha            DATE NOT NULL,
  computable       BOOLEAN NOT NULL DEFAULT TRUE,
  motivo_exclusion VARCHAR(200) NULL,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rh_vacacion_registro_fecha_mov UNIQUE (registro_id, fecha),
  CONSTRAINT chk_rh_vacacion_fecha_exclusion_motivo CHECK (
    computable = TRUE
    OR (motivo_exclusion IS NOT NULL AND BTRIM(motivo_exclusion) <> '')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_vacacion_fecha_computable_activa
  ON public.rh_vacacion_registro_fecha (persona_id, periodo_id, fecha)
  WHERE (activo = TRUE AND computable = TRUE);

CREATE INDEX IF NOT EXISTS idx_rh_vacacion_registro_fecha_registro
  ON public.rh_vacacion_registro_fecha (registro_id, fecha);

COMMIT;
