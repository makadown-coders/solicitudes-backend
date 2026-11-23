-- =============================================================================
-- PROYECTO RH | RH-VAC-04
-- Inicialización masiva controlada e idempotente de bolsas vacacionales
-- provisionales (10 días hábiles, estado_asignacion = 'PROVISIONAL')
-- en public.rh_vacacion_bolsa para toda la organización.
--
-- ADVERTENCIA:
--   - NO ejecutar automáticamente. Revisar y ejecutar manualmente por el responsable.
--   - Universo basado en public.persona (activo = TRUE), nunca en adscripciones.
--   - Idempotente mediante ON CONFLICT (persona_id, periodo_id) DO NOTHING:
--     NO sobrescribe ni restablece bolsas existentes (PROVISIONAL, CONFIRMADA o AJUSTADA).
--   - NO crea periodos, NO crea movimientos vacacionales, NO modifica public.persona.
--   - Exige seleccionar explícitamente las claves de periodos a inicializar y
--     proporcionar el UUID real del operador en public.app_users.id.
--   - Termina en ROLLBACK; por defecto para ensayo seguro antes de COMMIT;.
-- =============================================================================

-- =============================================================================
-- SECCIÓN 1: VISTA PREVIA (SOLO LECTURA — EJECUTAR PRIMERO)
-- =============================================================================
SELECT
  per.id AS periodo_id,
  per.clave,
  per.anio,
  per.numero_periodo,
  per.fecha_inicio,
  per.fecha_fin,
  per.dias_base_provisionales,
  (SELECT COUNT(*)::int FROM public.persona p WHERE p.activo = TRUE) AS personas_activas,
  COUNT(b.id)::int AS bolsas_existentes,
  ((SELECT COUNT(*)::int FROM public.persona p WHERE p.activo = TRUE) - COUNT(b.id))::int AS bolsas_faltantes,
  (SELECT COUNT(*)::int FROM public.persona p WHERE p.activo = TRUE AND p.fecha_ingreso IS NULL) AS sin_fecha_ingreso,
  (SELECT COUNT(*)::int FROM public.persona p WHERE p.activo = TRUE AND p.fecha_ingreso > per.fecha_inicio AND p.fecha_ingreso <= per.fecha_fin) AS ingreso_posterior_inicio,
  (SELECT COUNT(*)::int FROM public.persona p WHERE p.activo = TRUE AND p.fecha_ingreso > per.fecha_fin) AS ingreso_posterior_fin
FROM public.rh_vacacion_periodo per
LEFT JOIN public.rh_vacacion_bolsa b
  ON b.periodo_id = per.id
 AND EXISTS (SELECT 1 FROM public.persona p2 WHERE p2.id = b.persona_id AND p2.activo = TRUE)
GROUP BY per.id
ORDER BY per.anio, per.numero_periodo;


-- =============================================================================
-- SECCIÓN 2: INICIALIZACIÓN IDEMPOTENTE Y AUDITORÍA TRANSACCIONAL
-- =============================================================================
-- INSTRUCCIONES:
--   1. Reemplaza '<UUID_OPERADOR_APP_USERS>' por el UUID real de public.app_users.id.
--   2. Selecciona explícitamente los periodos en app.rh_periodos_claves:
--        - Solo 2026: '2026-P1,2026-P2'
--        - Solo 2027: '2027-P1,2027-P2'
--        - Ambos:     '2026-P1,2026-P2,2027-P1,2027-P2'
--   3. Ejecuta primero con ROLLBACK; activo para revisar el resumen devuelto.
--   4. Cuando el resultado sea exacto, sustituye ROLLBACK; por COMMIT;.

BEGIN;

SET LOCAL app.rh_operator_user_id = '3ff55867-0395-48df-8404-9a03ea562df9'; -- mario serrano
SET LOCAL app.rh_periodos_claves = '2025-P1,2025-P2';
-- Ejemplo solo 2027:
-- SET LOCAL app.rh_periodos_claves = '2027-P1,2027-P2';
-- Excluir personas cuya fecha_ingreso confirmada sea posterior al término del periodo:
SET LOCAL app.rh_excluir_ingreso_posterior_fin = 'true';

-- Validaciones previas estrictas antes de cualquier escritura
DO $$
DECLARE
  v_raw_user_id  text := COALESCE(current_setting('app.rh_operator_user_id', true), '');
  v_user_uuid    uuid;
  v_user_exists  boolean;
  v_raw_claves   text := BTRIM(COALESCE(current_setting('app.rh_periodos_claves', true), ''));
  v_claves       text[];
  v_missing_cnt  integer;
BEGIN
  IF v_raw_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'ABORTADO: Debe proporcionar un UUID válido en app.rh_operator_user_id (public.app_users.id).';
  END IF;

  v_user_uuid := v_raw_user_id::uuid;

  SELECT EXISTS (SELECT 1 FROM public.app_users WHERE id = v_user_uuid)
    INTO v_user_exists;
  IF NOT v_user_exists THEN
    RAISE EXCEPTION 'ABORTADO: El usuario % no existe en public.app_users.', v_user_uuid;
  END IF;

  IF v_raw_claves = '' THEN
    RAISE EXCEPTION 'ABORTADO: Debe especificar explícitamente al menos una clave de periodo en app.rh_periodos_claves.';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT BTRIM(x)
    FROM unnest(string_to_array(v_raw_claves, ',')) AS x
    WHERE BTRIM(x) <> ''
  ) INTO v_claves;

  SELECT COUNT(*)::int
    INTO v_missing_cnt
    FROM unnest(v_claves) AS req(clave)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.rh_vacacion_periodo p WHERE p.clave = req.clave AND p.activo = TRUE
   );

  IF v_missing_cnt > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % clave(s) de app.rh_periodos_claves no existen o no están activas en public.rh_vacacion_periodo.', v_missing_cnt;
  END IF;
END $$;

WITH params AS (
  SELECT
    current_setting('app.rh_operator_user_id', true)::uuid AS operator_user_id,
    ARRAY(
      SELECT DISTINCT BTRIM(x)
      FROM unnest(string_to_array(current_setting('app.rh_periodos_claves', true), ',')) AS x
      WHERE BTRIM(x) <> ''
    ) AS periodos_claves,
    LOWER(COALESCE(current_setting('app.rh_excluir_ingreso_posterior_fin', true), 'true')) = 'true' AS excluir_post_fin
),
periodos_sel AS (
  SELECT p.id, p.clave, p.anio, p.numero_periodo, p.fecha_fin
  FROM public.rh_vacacion_periodo p
  CROSS JOIN params
  WHERE p.clave = ANY(params.periodos_claves)
    AND p.activo = TRUE
),
universo AS (
  SELECT
    per.id AS persona_id,
    ps.id AS periodo_id,
    ps.clave,
    ps.anio,
    ps.numero_periodo
  FROM public.persona per
  CROSS JOIN periodos_sel ps
  CROSS JOIN params
  WHERE per.activo = TRUE
    AND (
      NOT params.excluir_post_fin
      OR per.fecha_ingreso IS NULL
      OR per.fecha_ingreso <= ps.fecha_fin
    )
),
previas AS (
  SELECT COUNT(*)::int AS total_existentes
  FROM universo u
  INNER JOIN public.rh_vacacion_bolsa b
    ON b.persona_id = u.persona_id
   AND b.periodo_id = u.periodo_id
),
creadas AS (
  INSERT INTO public.rh_vacacion_bolsa (
    persona_id,
    periodo_id,
    dias_asignados,
    estado_asignacion,
    creado_por,
    actualizado_por
  )
  SELECT
    u.persona_id,
    u.periodo_id,
    10,
    'PROVISIONAL',
    params.operator_user_id,
    params.operator_user_id
  FROM universo u
  CROSS JOIN params
  ON CONFLICT (persona_id, periodo_id) DO NOTHING
  RETURNING id, persona_id, periodo_id
),
auditoria AS (
  INSERT INTO public.app_audit_logs (
    user_id,
    action,
    resource,
    ip,
    user_agent,
    at,
    payload
  )
  SELECT
    params.operator_user_id,
    'RH_INICIALIZAR_BOLSAS_VACACIONALES',
    'rh_vacacion_bolsa',
    NULL,
    'manual-sql:011_inicializar_bolsas_vacacionales.sql',
    NOW(),
    jsonb_build_object(
      'script', 'sql/rh/011_inicializar_bolsas_vacacionales.sql',
      'periodos_seleccionados', to_jsonb(params.periodos_claves),
      'personas_evaluadas', (SELECT COUNT(DISTINCT persona_id)::int FROM universo),
      'bolsas_creadas', (SELECT COUNT(*)::int FROM creadas),
      'bolsas_previamente_existentes', (SELECT total_existentes FROM previas),
      'excluir_ingreso_posterior_fin', params.excluir_post_fin,
      'fecha_ejecucion', NOW()
    )
  FROM params
  WHERE (SELECT COUNT(*) FROM creadas) > 0
  RETURNING id AS audit_log_id
)
SELECT
  ps.anio,
  ps.numero_periodo,
  ps.clave,
  COUNT(c.id)::int AS bolsas_creadas,
  (SELECT audit_log_id FROM auditoria LIMIT 1) AS audit_log_id
FROM periodos_sel ps
LEFT JOIN creadas c ON c.periodo_id = ps.id
GROUP BY ps.anio, ps.numero_periodo, ps.clave
ORDER BY ps.anio, ps.numero_periodo;

-- Por seguridad, termina en ROLLBACK por defecto para revisión.
-- Cambie ROLLBACK; por COMMIT; únicamente tras validar el resumen devuelto.
-- ROLLBACK;
 COMMIT;


-- =============================================================================
-- SECCIÓN 3: CONSULTAS DE VERIFICACIÓN POSTERIOR (SOLO LECTURA)
-- =============================================================================

-- 3.1 Conteo de bolsas por periodo y estado de asignación
SELECT
  per.clave,
  per.anio,
  per.numero_periodo,
  b.estado_asignacion,
  COUNT(*)::int AS total_bolsas
FROM public.rh_vacacion_periodo per
LEFT JOIN public.rh_vacacion_bolsa b ON b.periodo_id = per.id
GROUP BY per.clave, per.anio, per.numero_periodo, b.estado_asignacion
ORDER BY per.anio, per.numero_periodo, b.estado_asignacion;

-- 3.2 Verificar registro de auditoría en app_audit_logs
SELECT
  id,
  user_id,
  action,
  resource,
  at,
  payload
FROM public.app_audit_logs
WHERE action = 'RH_INICIALIZAR_BOLSAS_VACACIONALES'
ORDER BY at DESC
LIMIT 5;
