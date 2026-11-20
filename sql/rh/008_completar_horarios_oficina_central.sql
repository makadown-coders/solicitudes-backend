-- =============================================================================
-- PROYECTO RH | RH-UX-05D-SQL
-- Script controlado para completar turno, jornada y horario vacíos en
-- OFICINA CENTRAL / COORDINACIÓN ESTATAL (unidad_medica_id = 177)
--
-- VALORES PREDETERMINADOS (solo para campos NULL, vacíos o de solo espacios):
--   - turno   = 'Matutino'
--   - jornada = 'LUNES A VIERNES'
--   - horario = '08:00 – 17:00 HRS'   (conserva guion medio U+2013)
--
-- ADVERTENCIA:
--   - Script estrictamente limitado a unidad_medica_id = 177.
--   - NO sobrescribe valores existentes no vacíos.
--   - NO modifica adscripciones inactivas, personas inactivas, puesto, matrícula,
--     fechas, unidad, observaciones, comisiones ni vacaciones.
--   - Requiere UUID real del operador en public.app_users.id para auditoría.
--   - Termina en ROLLBACK; por defecto para revisión segura antes de COMMIT;.
-- =============================================================================

-- =============================================================================
-- SECCIÓN 1: VISTA PREVIA (SOLO LECTURA — EJECUTAR PRIMERO)
-- =============================================================================

-- 1.1 Verificación de unidad destino 177
SELECT id, nombre, cluesimb
FROM public.unidad_medica
WHERE id = 177;

-- 1.2 Conteos agregados de Oficina Central (unidad_medica_id = 177)
SELECT
  COUNT(*)::int AS total_oficina_central,
  COUNT(*) FILTER (WHERE al.activo = TRUE)::int AS adscripciones_activas,
  COUNT(*) FILTER (WHERE al.activo = TRUE AND p.id IS NOT NULL AND p.activo = TRUE)::int AS personas_activas_vinculadas,
  COUNT(*) FILTER (WHERE al.activo = TRUE AND p.activo = TRUE AND (al.turno IS NULL OR BTRIM(al.turno) = ''))::int AS turnos_vacios,
  COUNT(*) FILTER (WHERE al.activo = TRUE AND p.activo = TRUE AND (al.jornada IS NULL OR BTRIM(al.jornada) = ''))::int AS jornadas_vacias,
  COUNT(*) FILTER (WHERE al.activo = TRUE AND p.activo = TRUE AND (al.horario IS NULL OR BTRIM(al.horario) = ''))::int AS horarios_vacios,
  COUNT(*) FILTER (
    WHERE al.activo = TRUE
      AND p.activo = TRUE
      AND (
        (al.turno IS NULL OR BTRIM(al.turno) = '')
        OR (al.jornada IS NULL OR BTRIM(al.jornada) = '')
        OR (al.horario IS NULL OR BTRIM(al.horario) = '')
      )
  )::int AS requieren_al_menos_una_actualizacion,
  COUNT(*) FILTER (
    WHERE al.activo = TRUE
      AND p.activo = TRUE
      AND al.turno IS NOT NULL AND BTRIM(al.turno) <> ''
      AND al.jornada IS NOT NULL AND BTRIM(al.jornada) <> ''
      AND al.horario IS NOT NULL AND BTRIM(al.horario) <> ''
  )::int AS ya_completos
FROM public.rh_adscripcion_laboral al
LEFT JOIN public.persona p ON p.id = al.persona_id
WHERE al.unidad_medica_id = 177;


-- =============================================================================
-- SECCIÓN 2: ACTUALIZACIÓN CONTROLADA Y AUDITORÍA TRANSACCIONAL
-- =============================================================================
-- INSTRUCCIONES:
--   1. Reemplaza '<UUID_OPERADOR_APP_USERS>' por el UUID real de public.app_users.id.
--   2. Ejecuta primero dejando ROLLBACK; activo al final para revisar el RETURNING.
--   3. Cuando el resultado sea exacto, reemplaza ROLLBACK; por COMMIT; para confirmar.

BEGIN;

SET LOCAL app.rh_operator_user_id = '3ff55867-0395-48df-8404-9a03ea562df9'; -- mario serrano

-- Validación estricta del operador real y de la unidad destino 177
DO $$
DECLARE
  v_raw_user_id text := COALESCE(current_setting('app.rh_operator_user_id', true), '');
  v_user_uuid   uuid;
  v_user_exists boolean;
  v_unidad_nom  text;
BEGIN
  IF v_raw_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'ABORTADO: Debe proporcionar un UUID válido en app.rh_operator_user_id (public.app_users.id).';
  END IF;

  v_user_uuid := v_raw_user_id::uuid;

  SELECT EXISTS (
    SELECT 1 FROM public.app_users WHERE id = v_user_uuid
  ) INTO v_user_exists;

  IF NOT v_user_exists THEN
    RAISE EXCEPTION 'ABORTADO: El usuario % no existe en public.app_users.', v_user_uuid;
  END IF;

  SELECT nombre
    INTO v_unidad_nom
    FROM public.unidad_medica
   WHERE id = 177;

  IF v_unidad_nom IS NULL OR UPPER(BTRIM(v_unidad_nom)) NOT LIKE '%COORDINACIÓN ESTATAL%' THEN
    RAISE EXCEPTION 'ABORTADO: La unidad 177 (%) no coincide con COORDINACIÓN ESTATAL / OFICINA CENTRAL.', COALESCE(v_unidad_nom, 'INEXISTENTE');
  END IF;
END $$;

WITH params AS (
  SELECT current_setting('app.rh_operator_user_id', true)::uuid AS operator_user_id
),
candidatas AS (
  SELECT
    al.id AS adscripcion_laboral_id,
    (al.turno IS NULL OR BTRIM(al.turno) = '') AS falta_turno,
    (al.jornada IS NULL OR BTRIM(al.jornada) = '') AS falta_jornada,
    (al.horario IS NULL OR BTRIM(al.horario) = '') AS falta_horario
  FROM public.rh_adscripcion_laboral al
  INNER JOIN public.persona p ON p.id = al.persona_id
  WHERE al.unidad_medica_id = 177
    AND al.activo = TRUE
    AND p.activo = TRUE
    AND (
      (al.turno IS NULL OR BTRIM(al.turno) = '')
      OR (al.jornada IS NULL OR BTRIM(al.jornada) = '')
      OR (al.horario IS NULL OR BTRIM(al.horario) = '')
    )
),
actualizadas AS (
  UPDATE public.rh_adscripcion_laboral al
     SET turno = CASE
                   WHEN al.turno IS NULL OR BTRIM(al.turno) = '' THEN 'Matutino'
                   ELSE al.turno
                 END,
         jornada = CASE
                     WHEN al.jornada IS NULL OR BTRIM(al.jornada) = '' THEN 'LUNES A VIERNES'
                     ELSE al.jornada
                   END,
         horario = CASE
                     WHEN al.horario IS NULL OR BTRIM(al.horario) = '' THEN '08:00 – 17:00 HRS'
                     ELSE al.horario
                   END,
         actualizado_en = NOW()
    FROM candidatas c
   WHERE al.id = c.adscripcion_laboral_id
     AND al.unidad_medica_id = 177
     AND al.activo = TRUE
     AND (
       (al.turno IS NULL OR BTRIM(al.turno) = '')
       OR (al.jornada IS NULL OR BTRIM(al.jornada) = '')
       OR (al.horario IS NULL OR BTRIM(al.horario) = '')
     )
  RETURNING
    al.id AS adscripcion_laboral_id,
    al.persona_id,
    al.unidad_medica_id,
    al.turno,
    al.jornada,
    al.horario,
    al.actualizado_en,
    c.falta_turno AS turno_actualizado,
    c.falta_jornada AS jornada_actualizada,
    c.falta_horario AS horario_actualizado,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN c.falta_turno THEN 'turno' END,
      CASE WHEN c.falta_jornada THEN 'jornada' END,
      CASE WHEN c.falta_horario THEN 'horario' END
    ], NULL) AS campos_modificados
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
    'RH_BACKFILL_HORARIO_OFICINA_CENTRAL',
    'rh_adscripcion_laboral',
    NULL,
    'manual-sql:008_completar_horarios_oficina_central.sql',
    NOW(),
    jsonb_build_object(
      'script', 'sql/rh/008_completar_horarios_oficina_central.sql',
      'unidad_medica_id', 177,
      'total_actualizadas', COUNT(*),
      'turnos_completados', COUNT(*) FILTER (WHERE a.turno_actualizado),
      'jornadas_completadas', COUNT(*) FILTER (WHERE a.jornada_actualizada),
      'horarios_completados', COUNT(*) FILTER (WHERE a.horario_actualizado),
      'fecha_ejecucion', NOW(),
      'adscripcion_ids', COALESCE(jsonb_agg(a.adscripcion_laboral_id ORDER BY a.adscripcion_laboral_id), '[]'::jsonb)
    )
  FROM actualizadas a
  CROSS JOIN params
  GROUP BY params.operator_user_id
  HAVING COUNT(*) > 0
  RETURNING id AS audit_log_id
)
SELECT
  a.adscripcion_laboral_id,
  a.persona_id,
  a.unidad_medica_id,
  a.turno,
  a.jornada,
  a.horario,
  a.campos_modificados,
  a.actualizado_en,
  (SELECT audit_log_id FROM auditoria LIMIT 1) AS audit_log_id
FROM actualizadas a
ORDER BY a.adscripcion_laboral_id;

-- Por seguridad, termina en ROLLBACK por defecto para revisión.
-- Cambie ROLLBACK; por COMMIT; únicamente tras validar el RETURNING.
 ROLLBACK;
 -- COMMIT;


-- =============================================================================
-- SECCIÓN 3: CONSULTAS DE VERIFICACIÓN POST-EJECUCIÓN (SOLO LECTURA)
-- =============================================================================

-- 3.1 Confirmar que no quedan campos vacíos en adscripciones activas de unidad 177
SELECT
  COUNT(*)::int AS total_activas_177,
  COUNT(*) FILTER (WHERE turno IS NULL OR BTRIM(turno) = '')::int AS turnos_vacios,
  COUNT(*) FILTER (WHERE jornada IS NULL OR BTRIM(jornada) = '')::int AS jornadas_vacias,
  COUNT(*) FILTER (WHERE horario IS NULL OR BTRIM(horario) = '')::int AS horarios_vacios
FROM public.rh_adscripcion_laboral al
INNER JOIN public.persona p ON p.id = al.persona_id
WHERE al.unidad_medica_id = 177
  AND al.activo = TRUE
  AND p.activo = TRUE;

-- 3.2 Confirmar registro en app_audit_logs
SELECT
  id,
  user_id,
  action,
  resource,
  at,
  payload
FROM public.app_audit_logs
WHERE action = 'RH_BACKFILL_HORARIO_OFICINA_CENTRAL'
ORDER BY at DESC
LIMIT 5;
