-- =============================================================================
-- PROYECTO RH | RH-VAC-02A
-- Inicialización controlada e idempotente del catálogo de periodos vacacionales
-- institucionales 2026 y 2027 (2026-P1, 2026-P2, 2027-P1, 2027-P2)
-- en public.rh_vacacion_periodo.
--
-- ADVERTENCIA:
--   - NO ejecutar automáticamente. Revisar y ejecutar manualmente por el responsable.
--   - Idempotente mediante ON CONFLICT (anio, numero_periodo) DO NOTHING.
--   - NO sobrescribe periodos existentes ni modifica fechas o días base previos.
--   - NO crea bolsas individuales, movimientos vacacionales ni altera public.persona.
--   - Los 10 días base son provisionales y no equivalen a derechos individuales confirmados.
-- =============================================================================

-- =============================================================================
-- SECCIÓN 1: CONSULTA PREVIA (SOLO LECTURA)
-- =============================================================================
SELECT
  id,
  anio,
  numero_periodo,
  clave,
  nombre,
  fecha_inicio,
  fecha_fin,
  dias_base_provisionales,
  activo
FROM public.rh_vacacion_periodo
WHERE anio IN (2026, 2027)
ORDER BY anio, numero_periodo;


-- =============================================================================
-- SECCIÓN 2: VALIDACIÓN DE INTEGRIDAD E INSERCIÓN IDEMPOTENTE
-- =============================================================================
BEGIN;

-- Verificar que no existan registros previos con clave o fechas inconsistentes
DO $$
DECLARE
  v_conflictos integer;
BEGIN
  WITH esperados(anio, numero_periodo, clave, fecha_inicio, fecha_fin) AS (
    VALUES
      (2026::smallint, 1::smallint, '2026-P1', DATE '2026-01-01', DATE '2026-06-30'),
      (2026::smallint, 2::smallint, '2026-P2', DATE '2026-07-01', DATE '2026-12-31'),
      (2027::smallint, 1::smallint, '2027-P1', DATE '2027-01-01', DATE '2027-06-30'),
      (2027::smallint, 2::smallint, '2027-P2', DATE '2027-07-01', DATE '2027-12-31')
  )
  SELECT COUNT(*)::int
    INTO v_conflictos
    FROM public.rh_vacacion_periodo p
    INNER JOIN esperados e
      ON (p.anio = e.anio AND p.numero_periodo = e.numero_periodo)
      OR p.clave = e.clave
   WHERE p.clave <> e.clave
      OR p.anio <> e.anio
      OR p.numero_periodo <> e.numero_periodo
      OR p.fecha_inicio <> e.fecha_inicio
      OR p.fecha_fin <> e.fecha_fin;

  IF v_conflictos > 0 THEN
    RAISE EXCEPTION 'ABORTADO: Se detectaron % registro(s) previo(s) en public.rh_vacacion_periodo con clave o fechas inconsistentes para 2026-2027. No se sobrescribirán silenciosamente.', v_conflictos;
  END IF;
END $$;

WITH insertados AS (
  INSERT INTO public.rh_vacacion_periodo (
    anio,
    numero_periodo,
    clave,
    nombre,
    fecha_inicio,
    fecha_fin,
    dias_base_provisionales,
    activo,
    observaciones
  )
  VALUES
    (
      2026,
      1,
      '2026-P1',
      'Primer periodo 2026',
      DATE '2026-01-01',
      DATE '2026-06-30',
      10,
      TRUE,
      'Periodo institucional enero-junio 2026 (bolsa base provisional de 10 días hábiles)'
    ),
    (
      2026,
      2,
      '2026-P2',
      'Segundo periodo 2026',
      DATE '2026-07-01',
      DATE '2026-12-31',
      10,
      TRUE,
      'Periodo institucional julio-diciembre 2026 (bolsa base provisional de 10 días hábiles)'
    ),
    (
      2027,
      1,
      '2027-P1',
      'Primer periodo 2027',
      DATE '2027-01-01',
      DATE '2027-06-30',
      10,
      TRUE,
      'Periodo institucional enero-junio 2027 (bolsa base provisional de 10 días hábiles)'
    ),
    (
      2027,
      2,
      '2027-P2',
      'Segundo periodo 2027',
      DATE '2027-07-01',
      DATE '2027-12-31',
      10,
      TRUE,
      'Periodo institucional julio-diciembre 2027 (bolsa base provisional de 10 días hábiles)'
    )
  ON CONFLICT (anio, numero_periodo) DO NOTHING
  RETURNING id, clave, anio, numero_periodo
)
SELECT
  COUNT(*)::int AS total_registros_insertados,
  COALESCE(array_agg(clave ORDER BY anio, numero_periodo), ARRAY[]::varchar[]) AS claves_insertadas
FROM insertados;

COMMIT;


-- =============================================================================
-- SECCIÓN 3: CONSULTA POSTERIOR DE VERIFICACIÓN (SOLO LECTURA)
-- =============================================================================
SELECT
  id,
  clave,
  anio,
  numero_periodo,
  nombre,
  fecha_inicio,
  fecha_fin,
  dias_base_provisionales,
  activo
FROM public.rh_vacacion_periodo
WHERE anio IN (2026, 2027)
ORDER BY anio, numero_periodo;
