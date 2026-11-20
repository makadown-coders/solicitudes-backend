-- =============================================================================
-- PROYECTO RH | RH-UX-05C-SQL
-- Script controlado de actualización inicial de puestos laborales desde
-- public.persona.cargo hacia public.rh_adscripcion_laboral.puesto
--
-- ADVERTENCIA:
--   - Este script NO es una migración DDL; no modifica estructura de tablas.
--   - Diseñado exclusivamente para revisión y ejecución manual por el responsable.
--   - NO modifica puestos ya capturados, adscripciones inactivas, persona.cargo
--     ni ningún otro campo laboral (fechas, unidad, matrícula, turno, jornada,
--     horario, observaciones).
--   - Requiere proporcionar explícitamente el UUID real del operador en
--     public.app_users.id para registrar la auditoría transaccional. Si no se
--     proporciona o no existe, la transacción se detiene automáticamente.
-- =============================================================================

-- =============================================================================
-- SECCIÓN 1: VISTA PREVIA (SOLO LECTURA — EJECUTAR PRIMERO)
-- =============================================================================
-- Para filtrar una unidad específica, reemplaza NULL por el ID (ej. 177 para
-- Oficina Central). Con NULL evalúa todas las unidades.

WITH params AS (
  SELECT NULL::integer AS filtro_unidad_medica_id
  -- Ejemplo solo Oficina Central:
  -- SELECT 177::integer AS filtro_unidad_medica_id
)
SELECT
  al.unidad_medica_id,
  COUNT(*)::int AS total_adscripciones,
  COUNT(*) FILTER (
    WHERE al.activo = TRUE
      AND p.id IS NOT NULL
      AND p.activo = TRUE
      AND (al.puesto IS NULL OR BTRIM(al.puesto) = '')
      AND p.cargo IS NOT NULL
      AND BTRIM(p.cargo) <> ''
      AND CHAR_LENGTH(BTRIM(p.cargo)) <= 160
  )::int AS candidatos_actualizar,
  COUNT(*) FILTER (WHERE al.activo = FALSE)::int AS excl_adscripcion_inactiva,
  COUNT(*) FILTER (
    WHERE al.activo = TRUE
      AND (p.id IS NULL OR p.activo = FALSE)
  )::int AS excl_persona_inactiva,
  COUNT(*) FILTER (
    WHERE al.activo = TRUE
      AND p.activo = TRUE
      AND al.puesto IS NOT NULL
      AND BTRIM(al.puesto) <> ''
  )::int AS excl_puesto_ya_capturado,
  COUNT(*) FILTER (
    WHERE al.activo = TRUE
      AND p.activo = TRUE
      AND (al.puesto IS NULL OR BTRIM(al.puesto) = '')
      AND (p.cargo IS NULL OR BTRIM(p.cargo) = '')
  )::int AS excl_cargo_vacio,
  COUNT(*) FILTER (
    WHERE al.activo = TRUE
      AND p.activo = TRUE
      AND (al.puesto IS NULL OR BTRIM(al.puesto) = '')
      AND p.cargo IS NOT NULL
      AND CHAR_LENGTH(BTRIM(p.cargo)) > 160
  )::int AS excl_cargo_excede_160
FROM public.rh_adscripcion_laboral al
CROSS JOIN params
LEFT JOIN public.persona p ON p.id = al.persona_id
WHERE params.filtro_unidad_medica_id IS NULL
   OR al.unidad_medica_id = params.filtro_unidad_medica_id
GROUP BY al.unidad_medica_id
ORDER BY al.unidad_medica_id;


-- =============================================================================
-- SECCIÓN 2: ACTUALIZACIÓN CONTROLADA Y AUDITORÍA TRANSACCIONAL
-- =============================================================================
-- INSTRUCCIONES:
--   1. Reemplaza '<UUID_OPERADOR_APP_USERS>' por el UUID real de public.app_users.id.
--   2. Opcionalmente ajusta 'app.rh_filtro_unidad_id' ('' = todas, '177' = Oficina Central).
--   3. Ejecuta primero dejando ROLLBACK; activo al final para verificar el RETURNING.
--   4. Cuando el resultado sea exacto, reemplaza ROLLBACK; por COMMIT; para confirmar.

BEGIN;
 
-- Parámetros obligatorios de sesión (solo viven dentro de esta transacción)
SET LOCAL app.rh_operator_user_id = '3ff55867-0395-48df-8404-9a03ea562df9'; -- mario serrano
SET LOCAL app.rh_filtro_unidad_id = ''; -- '' = todas las unidades | '177' = solo Oficina Central

-- Validación estricta del operador real antes de cualquier escritura
DO $$
DECLARE
  v_raw_user_id text := COALESCE(current_setting('app.rh_operator_user_id', true), '');
  v_user_uuid   uuid;
  v_exists      boolean;
BEGIN
  IF v_raw_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'ABORTADO: Debe proporcionar un UUID válido en app.rh_operator_user_id (public.app_users.id).';
  END IF;

  v_user_uuid := v_raw_user_id::uuid;

  SELECT EXISTS (
    SELECT 1 FROM public.app_users WHERE id = v_user_uuid
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'ABORTADO: El usuario % no existe en public.app_users.', v_user_uuid;
  END IF;
END $$;

WITH params AS (
  SELECT
    current_setting('app.rh_operator_user_id', true)::uuid AS operator_user_id,
    NULLIF(BTRIM(COALESCE(current_setting('app.rh_filtro_unidad_id', true), '')), '')::integer AS filtro_unidad_medica_id
),
actualizadas AS (
  UPDATE public.rh_adscripcion_laboral al
     SET puesto         = BTRIM(p.cargo),
         actualizado_en = NOW()
    FROM public.persona p,
         params
   WHERE p.id = al.persona_id
     AND al.activo = TRUE
     AND p.activo = TRUE
     AND (al.puesto IS NULL OR BTRIM(al.puesto) = '')
     AND p.cargo IS NOT NULL
     AND BTRIM(p.cargo) <> ''
     AND CHAR_LENGTH(BTRIM(p.cargo)) <= 160
     AND (
       params.filtro_unidad_medica_id IS NULL
       OR al.unidad_medica_id = params.filtro_unidad_medica_id
     )
  RETURNING
    al.id AS adscripcion_laboral_id,
    al.persona_id,
    al.unidad_medica_id,
    al.puesto AS puesto_nuevo,
    al.actualizado_en
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
    'RH_BACKFILL_PUESTO_ADSCRIPCION',
    'rh_adscripcion_laboral',
    NULL,
    'manual-sql:007_completar_puestos_adscripcion.sql',
    NOW(),
    jsonb_build_object(
      'script', 'sql/rh/007_completar_puestos_adscripcion.sql',
      'filtro_unidad_medica_id', params.filtro_unidad_medica_id,
      'total_actualizadas', COUNT(*),
      'adscripcion_ids', COALESCE(jsonb_agg(a.adscripcion_laboral_id ORDER BY a.adscripcion_laboral_id), '[]'::jsonb)
    )
  FROM actualizadas a
  CROSS JOIN params
  GROUP BY params.operator_user_id, params.filtro_unidad_medica_id
  HAVING COUNT(*) > 0
  RETURNING id AS audit_log_id
)
SELECT
  a.adscripcion_laboral_id,
  a.persona_id,
  a.unidad_medica_id,
  a.puesto_nuevo,
  a.actualizado_en,
  (SELECT audit_log_id FROM auditoria LIMIT 1) AS audit_log_id
FROM actualizadas a
ORDER BY a.adscripcion_laboral_id;

-- Por seguridad, el script termina en ROLLBACK por defecto para revisión.
-- Cambie ROLLBACK; por COMMIT; únicamente tras validar los registros devueltos.
 ROLLBACK;
-- COMMIT;


-- =============================================================================
-- SECCIÓN 3: CONSULTAS DE VERIFICACIÓN POST-EJECUCIÓN (SOLO LECTURA)
-- =============================================================================

-- 3.1 Conteo residual de adscripciones activas con puesto vacío (debe ser 0
--     salvo personas cuyo cargo en directorio también esté vacío)
SELECT
  al.unidad_medica_id,
  COUNT(*)::int AS total_activas,
  COUNT(*) FILTER (WHERE al.puesto IS NOT NULL AND BTRIM(al.puesto) <> '')::int AS con_puesto,
  COUNT(*) FILTER (WHERE al.puesto IS NULL OR BTRIM(al.puesto) = '')::int AS sin_puesto
FROM public.rh_adscripcion_laboral al
WHERE al.activo = TRUE
GROUP BY al.unidad_medica_id
ORDER BY al.unidad_medica_id;

-- 3.2 Verificar último registro de auditoría generado por este script
SELECT
  id,
  user_id,
  action,
  resource,
  at,
  payload
FROM public.app_audit_logs
WHERE action = 'RH_BACKFILL_PUESTO_ADSCRIPCION'
ORDER BY at DESC
LIMIT 5;
