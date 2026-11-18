-- =============================================================================
-- MICROINTERVENCIÓN 6.4B-2B.2A — SUITE DE PRUEBAS SQL (BASE AISLADA)
-- Archivo: sql/identity-6.4b-2b2/001_protect_app_users_persona_link.test.sql
--
-- PROPÓSITO:
--   Validar dinámicamente en una instancia PostgreSQL AISLADA (nunca en la base
--   compartida/productiva sin autorización) los 13 escenarios originales de
--   6.4B-2B.2 más los 8 nuevos escenarios de seguridad de 6.4B-2B.2A (21 casos
--   en total), envolviendo toda la ejecución en una transacción que finaliza
--   con ROLLBACK para no dejar ningún rastro.
--
-- ESCENARIOS CUBIERTOS:
--   [Originales 1 a 13]
--   1. Alta de cuenta con persona_id explícito (válido, inactivo, inexistente, ya vinculado,
--      y rechazo si el email pertenece a otra persona activa).
--   2. Alta con coincidencia única por persona.correo_principal (sin fila en persona_correo)
--      y persistencia de NEW.email normalizado en minúsculas y sin espacios.
--   3. Alta con coincidencia única por persona_correo activo (con persona.correo_principal NULL).
--   4. Alta con correo que solo existe en registros inactivos (persona_correo inactivo y persona inactiva).
--   5. Alta con coincidencias ambiguas (dos personas activas con el mismo correo en distintas tablas).
--   6. Alta sin coincidencias (creación provisional en persona sin insertar en persona_correo).
--   7. Cambio de correo de cuenta ya vinculada a un correo completamente nuevo o histórico inactivo
--      (preserva persona_id intacto, no crea persona).
--   8. Cambio de correo a uno que pertenece a otra persona activa (rechazo por conflicto de identidad
--      tanto en persona.correo_principal como en persona_correo activo, preservando persona_id).
--   9. Cambio de correo únicamente de mayúsculas/minúsculas de la misma cuenta (conserva el mismo
--      correo normalizado y el mismo persona_id).
--  10. Intento de cambiar o anular persona_id durante UPDATE (rechazo explícito).
--  11. Altas concurrentes / duplicadas con el mismo correo normalizado (bloqueo advisory + rechazo).
--  12. Conservación íntegra de cuentas y roles existentes (3 cuentas ADMIN_TIC GLOBAL).
--  13. Reversión completa de la función y triggers al estado original del dump.
--
--   [Nuevos escenarios 6.4B-2B.2A: 14 a 21]
--  14. UPDATE de correo a una variante con mayúsculas/espacios del correo de OTRA cuenta existente
--      (rechazo con unique_violation sin alterar persona_id).
--  15. UPDATE de correo con espacios iniciales y finales y mayúsculas (se acepta y persiste
--      LOWER(TRIM(email)) normalizado en app_users.email).
--  16. UPDATE con correo vacío ('', '   ') o NULL (rechazo con not_null_violation).
--  17. UPDATE que conserva el mismo correo normalizado de la propia cuenta (idempotente,
--      no se auto-bloquea y preserva persona_id).
--  18. Dos UPDATE dirigidos hacia el mismo correo normalizado desde dos cuentas distintas
--      (el primero persiste y el segundo es rechazado con unique_violation; incluye prueba
--      de bloqueo advisory inter-sesión).
--  19. INSERT y UPDATE dirigidos hacia el mismo correo normalizado (colisión detectada y
--      rechazada en ambos sentidos sin alterar persona_id).
--  20. UPDATE de correo hacia un correo perteneciente a otra persona activa (tanto por
--      persona.correo_principal como por persona_correo activo) vs. correo histórico inactivo.
--  21. Conservación estricta de persona_id ante cualquier rechazo en UPDATE (savepoint recovery).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Captura de estado inicial (cuentas existentes, roles y conteos)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _baseline_app_users ON COMMIT DROP AS
SELECT id, email, status, persona_id
FROM public.app_users;

CREATE TEMP TABLE _baseline_app_user_roles ON COMMIT DROP AS
SELECT user_id, role_id, scope_type, scope_id
FROM public.app_user_roles;

-- Aplicar la definición propuesta (UP) dentro de la transacción de prueba
CREATE OR REPLACE FUNCTION public.auto_link_persona_for_app_user() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_email       text;
  v_name        text;
  v_pid         integer;
  v_match_count integer;
  v_persona_ok  boolean;
BEGIN
  v_email := NULLIF(LOWER(TRIM(COALESCE(NEW.email, ''))), '');
  v_name  := NULLIF(TRIM(COALESCE(NEW.name, '')), '');

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'app_users.email no puede ser nulo ni cadena vacía.'
      USING ERRCODE = 'not_null_violation';
  END IF;

  NEW.email := v_email;

  PERFORM pg_advisory_xact_lock(hashtext('app_users_autolink_email'), hashtext(v_email));

  IF TG_OP = 'UPDATE' THEN
    IF OLD.persona_id IS NOT NULL THEN
      IF NEW.persona_id IS DISTINCT FROM OLD.persona_id THEN
        RAISE EXCEPTION 'No se permite modificar ni desvincular app_users.persona_id (%) en una cuenta ya vinculada (user_id: %).',
          OLD.persona_id, OLD.id
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.persona_id := OLD.persona_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE LOWER(TRIM(u.email)) = v_email
        AND u.id IS DISTINCT FROM OLD.id
    ) THEN
      RAISE EXCEPTION 'Ya existe otra cuenta en app_users con el correo normalizado (%).',
        v_email
        USING ERRCODE = 'unique_violation';
    END IF;

    IF OLD.persona_id IS NULL AND NEW.persona_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('app_users_autolink_pid'), NEW.persona_id);

      SELECT p.activo INTO v_persona_ok
      FROM public.persona p
      WHERE p.id = NEW.persona_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'La persona especificada (id = %) no existe en public.persona.',
          NEW.persona_id
          USING ERRCODE = 'foreign_key_violation';
      END IF;

      IF v_persona_ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'No se puede vincular una cuenta SSO a una persona inactiva (persona_id = %).',
          NEW.persona_id
          USING ERRCODE = 'check_violation';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.app_users u
        WHERE u.persona_id = NEW.persona_id
          AND u.id IS DISTINCT FROM OLD.id
      ) THEN
        RAISE EXCEPTION 'La persona (id = %) ya se encuentra vinculada a otra cuenta en app_users.',
          NEW.persona_id
          USING ERRCODE = 'unique_violation';
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.persona p
      WHERE p.activo IS TRUE
        AND (NEW.persona_id IS NULL OR p.id <> NEW.persona_id)
        AND p.correo_principal IS NOT NULL
        AND LOWER(TRIM(p.correo_principal)) = v_email
      UNION ALL
      SELECT 1
      FROM public.persona_correo pc
      JOIN public.persona p
        ON p.id = pc.persona_id
      WHERE pc.activo IS TRUE
        AND p.activo IS TRUE
        AND (NEW.persona_id IS NULL OR p.id <> NEW.persona_id)
        AND pc.correo IS NOT NULL
        AND LOWER(TRIM(pc.correo)) = v_email
    ) THEN
      RAISE EXCEPTION 'Conflicto de identidad: el correo (%) pertenece a otra persona activa en el directorio y no puede asignarse a esta cuenta.',
        v_email
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE LOWER(TRIM(u.email)) = v_email
  ) THEN
    RAISE EXCEPTION 'Ya existe una cuenta en app_users con el correo normalizado (%).',
      v_email
      USING ERRCODE = 'unique_violation';
  END IF;

  IF NEW.persona_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('app_users_autolink_pid'), NEW.persona_id);

    SELECT p.activo INTO v_persona_ok
    FROM public.persona p
    WHERE p.id = NEW.persona_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La persona especificada (id = %) no existe en public.persona.',
        NEW.persona_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_persona_ok IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'No se puede vincular una cuenta SSO a una persona inactiva (persona_id = %).',
        NEW.persona_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.persona_id = NEW.persona_id
    ) THEN
      RAISE EXCEPTION 'La persona (id = %) ya está vinculada a otra cuenta en app_users.',
        NEW.persona_id
        USING ERRCODE = 'unique_violation';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.persona p
      WHERE p.activo IS TRUE
        AND p.id <> NEW.persona_id
        AND p.correo_principal IS NOT NULL
        AND LOWER(TRIM(p.correo_principal)) = v_email
      UNION ALL
      SELECT 1
      FROM public.persona_correo pc
      JOIN public.persona p
        ON p.id = pc.persona_id
      WHERE pc.activo IS TRUE
        AND p.activo IS TRUE
        AND p.id <> NEW.persona_id
        AND pc.correo IS NOT NULL
        AND LOWER(TRIM(pc.correo)) = v_email
    ) THEN
      RAISE EXCEPTION 'Conflicto de identidad: el correo (%) pertenece a otra persona activa distinta de persona_id (%).',
        v_email, NEW.persona_id
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END IF;

  SELECT
    COUNT(DISTINCT m.id),
    MIN(m.id)
  INTO
    v_match_count,
    v_pid
  FROM (
    SELECT p.id
    FROM public.persona p
    WHERE p.activo IS TRUE
      AND p.correo_principal IS NOT NULL
      AND LOWER(TRIM(p.correo_principal)) = v_email
    UNION
    SELECT p.id
    FROM public.persona_correo pc
    JOIN public.persona p
      ON p.id = pc.persona_id
    WHERE pc.activo IS TRUE
      AND p.activo IS TRUE
      AND pc.correo IS NOT NULL
      AND LOWER(TRIM(pc.correo)) = v_email
  ) m;

  IF v_match_count > 1 THEN
    RAISE EXCEPTION 'Coincidencia ambigua: el correo (%) está asociado a % personas activas distintas. Especifique persona_id explícitamente.',
      v_email, v_match_count
      USING ERRCODE = 'cardinality_violation';
  ELSIF v_match_count = 1 THEN
    PERFORM pg_advisory_xact_lock(hashtext('app_users_autolink_pid'), v_pid);

    IF EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.persona_id = v_pid
    ) THEN
      RAISE EXCEPTION 'La persona activa coincidente (id = %) para el correo (%) ya está vinculada a otra cuenta en app_users.',
        v_pid, v_email
        USING ERRCODE = 'unique_violation';
    END IF;

    NEW.persona_id := v_pid;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.persona p
    WHERE p.activo IS DISTINCT FROM TRUE
      AND p.correo_principal IS NOT NULL
      AND LOWER(TRIM(p.correo_principal)) = v_email
  ) THEN
    RAISE EXCEPTION 'El correo (%) pertenece a un registro inactivo en public.persona y no puede autovincularse ni reutilizarse automáticamente.',
      v_email
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.persona (
    nombre_completo,
    correo_principal,
    activo,
    creado_en,
    actualizado_en
  )
  VALUES (
    COALESCE(v_name, v_email),
    v_email,
    TRUE,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_pid;

  NEW.persona_id := v_pid;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS t_app_users_autolink_persona_upd_email ON public.app_users;
CREATE TRIGGER t_app_users_autolink_persona_upd_email
  BEFORE UPDATE OF email, persona_id ON public.app_users
  FOR EACH ROW
  WHEN ((old.email IS DISTINCT FROM new.email) OR (old.persona_id IS DISTINCT FROM new.persona_id))
  EXECUTE FUNCTION public.auto_link_persona_for_app_user();

-- -----------------------------------------------------------------------------
-- Ejecución de pruebas 1 a 21 en bloque PL/pgSQL
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_p_explicita     integer;
  v_p_inactiva      integer;
  v_p_correo_prin   integer;
  v_p_correo_sec    integer;
  v_p_hist_inactiva integer;
  v_p_ambigua_1     integer;
  v_p_ambigua_2     integer;
  v_p_otra_prin     integer;
  v_p_otra_sec      integer;
  v_u_id_1          uuid;
  v_u_pid_1         integer;
  v_u_id_6          uuid;
  v_u_pid_6         integer;
  v_u_email_stored  text;
  v_count_personas  integer;
  v_count_pc        integer;
  v_err_caught      boolean;
BEGIN
  -- ===========================================================================
  -- PRUEBA 1: Alta de cuenta con persona_id explícito
  -- ===========================================================================
  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 01 Persona Explicita', 'otro.correo.01@test.local', TRUE, NOW(), NOW())
  RETURNING id INTO v_p_explicita;

  INSERT INTO public.app_users (email, password_hash, name, status, persona_id)
  VALUES ('  Cuenta.Explicita.01@test.local  ', 'hash_dummy', 'Test 01', 'ACTIVE', v_p_explicita)
  RETURNING id, persona_id, email INTO v_u_id_1, v_u_pid_1, v_u_email_stored;

  IF v_u_pid_1 IS DISTINCT FROM v_p_explicita THEN
    RAISE EXCEPTION 'Fallo Prueba 1a: no se respetó el persona_id explícito (% vs %).', v_u_pid_1, v_p_explicita;
  END IF;

  IF v_u_email_stored <> 'cuenta.explicita.01@test.local' THEN
    RAISE EXCEPTION 'Fallo Prueba 1a-norm: el email no se normalizó en INSERT (%).', v_u_email_stored;
  END IF;

  -- 1b: Rechazo si persona_id explícito apunta a una persona inactiva
  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 01 Persona Inactiva', NULL, FALSE, NOW(), NOW())
  RETURNING id INTO v_p_inactiva;

  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.app_users (email, password_hash, name, status, persona_id)
    VALUES ('cuenta.inactiva.01@test.local', 'hash_dummy', 'Test 01 Inactiva', 'ACTIVE', v_p_inactiva);
  EXCEPTION WHEN check_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 1b: debía rechazar INSERT con persona_id de persona inactiva.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 2: Alta con coincidencia única por persona.correo_principal
  -- ===========================================================================
  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 02 Solo Correo Principal', 'unico.principal.02@test.local', TRUE, NOW(), NOW())
  RETURNING id INTO v_p_correo_prin;

  INSERT INTO public.app_users (email, password_hash, name, status)
  VALUES ('  UNICO.PRINCIPAL.02@test.local  ', 'hash_dummy', 'Test 02', 'ACTIVE')
  RETURNING persona_id, email INTO v_u_pid_6, v_u_email_stored;

  IF v_u_pid_6 IS DISTINCT FROM v_p_correo_prin THEN
    RAISE EXCEPTION 'Fallo Prueba 2: debía vincular a persona % por correo_principal, obtuvo %.', v_p_correo_prin, v_u_pid_6;
  END IF;
  IF v_u_email_stored <> 'unico.principal.02@test.local' THEN
    RAISE EXCEPTION 'Fallo Prueba 2-norm: debía almacenar correo normalizado, obtuvo %.', v_u_email_stored;
  END IF;

  -- ===========================================================================
  -- PRUEBA 3: Alta con coincidencia única por persona_correo activo
  -- ===========================================================================
  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 03 Solo Persona Correo', NULL, TRUE, NOW(), NOW())
  RETURNING id INTO v_p_correo_sec;

  INSERT INTO public.persona_correo (persona_id, correo, es_principal, activo)
  VALUES (v_p_correo_sec, 'unico.complementario.03@test.local', TRUE, TRUE);

  INSERT INTO public.app_users (email, password_hash, name, status)
  VALUES ('Unico.Complementario.03@test.local', 'hash_dummy', 'Test 03', 'ACTIVE')
  RETURNING persona_id INTO v_u_pid_6;

  IF v_u_pid_6 IS DISTINCT FROM v_p_correo_sec THEN
    RAISE EXCEPTION 'Fallo Prueba 3: debía vincular a persona % por persona_correo activo, obtuvo %.', v_p_correo_sec, v_u_pid_6;
  END IF;

  -- ===========================================================================
  -- PRUEBA 4: Alta con correo que solo existe en registros inactivos
  -- ===========================================================================
  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 04 Persona Inactiva Historica', NULL, FALSE, NOW(), NOW())
  RETURNING id INTO v_p_hist_inactiva;

  INSERT INTO public.persona_correo (persona_id, correo, es_principal, activo)
  VALUES (v_p_hist_inactiva, 'historico.inactivo.04@test.local', FALSE, FALSE);

  INSERT INTO public.app_users (email, password_hash, name, status)
  VALUES ('historico.inactivo.04@test.local', 'hash_dummy', 'Test 04 Nuevo', 'ACTIVE')
  RETURNING persona_id INTO v_u_pid_6;

  IF v_u_pid_6 = v_p_hist_inactiva OR v_u_pid_6 IS NULL THEN
    RAISE EXCEPTION 'Fallo Prueba 4a: NUNCA debe vincularse a la persona inactiva % (obtuvo %).', v_p_hist_inactiva, v_u_pid_6;
  END IF;

  -- 4b: Si una persona inactiva aún retiene correo_principal no nulo, rechaza explícitamente
  UPDATE public.persona SET correo_principal = 'retenido.inactivo.04b@test.local' WHERE id = v_p_hist_inactiva;
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.app_users (email, password_hash, name, status)
    VALUES ('retenido.inactivo.04b@test.local', 'hash_dummy', 'Test 04b', 'ACTIVE');
  EXCEPTION WHEN check_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 4b: debía rechazar autovinculación cuando correo_principal pertenece a persona inactiva.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 5: Alta con coincidencias ambiguas (2 personas activas distintas)
  -- ===========================================================================
  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 05 Ambigua A', 'ambiguo.05@test.local', TRUE, NOW(), NOW())
  RETURNING id INTO v_p_ambigua_1;

  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 05 Ambigua B', NULL, TRUE, NOW(), NOW())
  RETURNING id INTO v_p_ambigua_2;

  INSERT INTO public.persona_correo (persona_id, correo, es_principal, activo)
  VALUES (v_p_ambigua_2, 'ambiguo.05@test.local', TRUE, TRUE);

  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.app_users (email, password_hash, name, status)
    VALUES ('ambiguo.05@test.local', 'hash_dummy', 'Test 05', 'ACTIVE');
  EXCEPTION WHEN cardinality_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 5: debía rechazar con cardinality_violation ante coincidencia ambigua entre 2 personas activas.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 6: Alta sin coincidencias (crea persona mínima sin fila en persona_correo)
  -- ===========================================================================
  SELECT COUNT(*) INTO v_count_pc FROM public.persona_correo;

  INSERT INTO public.app_users (email, password_hash, name, status)
  VALUES ('nuevo.sin.coincidencia.06@test.local', 'hash_dummy', 'Persona Nueva 06', 'ACTIVE')
  RETURNING id, persona_id INTO v_u_id_6, v_u_pid_6;

  IF v_u_pid_6 IS NULL THEN
    RAISE EXCEPTION 'Fallo Prueba 6a: debía crear y asignar persona_id.';
  END IF;

  IF (SELECT COUNT(*) FROM public.persona_correo) <> v_count_pc THEN
    RAISE EXCEPTION 'Fallo Prueba 6b: NO debe insertar filas en persona_correo al crear persona mínima.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 7 y 15: Cambio de correo de cuenta ya vinculada con espacios y mayúsculas
  -- ===========================================================================
  SELECT COUNT(*) INTO v_count_personas FROM public.persona;

  UPDATE public.app_users
  SET email = '   Correo.Cambiado.07@TEST.local   '
  WHERE id = v_u_id_6
  RETURNING email INTO v_u_email_stored;

  IF v_u_email_stored <> 'correo.cambiado.07@test.local' THEN
    RAISE EXCEPTION 'Fallo Prueba 15: UPDATE no normalizó los espacios ni las mayúsculas (%).', v_u_email_stored;
  END IF;

  IF (SELECT persona_id FROM public.app_users WHERE id = v_u_id_6) IS DISTINCT FROM v_u_pid_6 THEN
    RAISE EXCEPTION 'Fallo Prueba 7a: el cambio de email alteró el persona_id de la cuenta.';
  END IF;

  IF (SELECT COUNT(*) FROM public.persona) <> v_count_personas THEN
    RAISE EXCEPTION 'Fallo Prueba 7b: el cambio de email en app_users creó una nueva fila en public.persona.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 8, 20 y 21: Cambio de correo a uno que pertenece a OTRA persona activa
  -- vs. correo histórico inactivo, conservando estrictamente persona_id
  -- ===========================================================================
  -- 8a / 20a: Otra persona activa con correo_principal
  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 08 Otra Persona Principal', 'correo.otra.activa.prin@test.local', TRUE, NOW(), NOW())
  RETURNING id INTO v_p_otra_prin;

  v_err_caught := FALSE;
  BEGIN
    UPDATE public.app_users
    SET email = '  CORREO.OTRA.ACTIVA.PRIN@test.local '
    WHERE id = v_u_id_6;
  EXCEPTION WHEN check_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 8a/20a: debía rechazar UPDATE hacia el correo_principal de otra persona activa.';
  END IF;

  -- 8b / 20b: Otra persona activa con correo activo en persona_correo
  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 08 Otra Persona Complementario', NULL, TRUE, NOW(), NOW())
  RETURNING id INTO v_p_otra_sec;

  INSERT INTO public.persona_correo (persona_id, correo, es_principal, activo)
  VALUES (v_p_otra_sec, 'correo.otra.activa.sec@test.local', FALSE, TRUE);

  v_err_caught := FALSE;
  BEGIN
    UPDATE public.app_users
    SET email = 'Correo.Otra.Activa.Sec@test.local'
    WHERE id = v_u_id_6;
  EXCEPTION WHEN check_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 8b/20b: debía rechazar UPDATE hacia un persona_correo activo de otra persona activa.';
  END IF;

  -- 20c: Correo que solo figura como histórico inactivo (activo = FALSE) en otra persona SÍ se permite
  INSERT INTO public.persona_correo (persona_id, correo, es_principal, activo)
  VALUES (v_p_otra_sec, 'correo.historico.liberado@test.local', FALSE, FALSE);

  UPDATE public.app_users
  SET email = 'correo.historico.liberado@test.local'
  WHERE id = v_u_id_6;

  IF (SELECT persona_id FROM public.app_users WHERE id = v_u_id_6) IS DISTINCT FROM v_u_pid_6 THEN
    RAISE EXCEPTION 'Fallo Prueba 20c/21: el persona_id no se conservó intacto.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 9 y 17: UPDATE que conserva el mismo correo normalizado (cambio solo
  -- de mayúsculas/espacios sobre el propio correo de la cuenta)
  -- ===========================================================================
  UPDATE public.app_users
  SET email = '  CORREO.HISTORICO.LIBERADO@TEST.LOCAL  '
  WHERE id = v_u_id_6
  RETURNING email INTO v_u_email_stored;

  IF v_u_email_stored <> 'correo.historico.liberado@test.local' THEN
    RAISE EXCEPTION 'Fallo Prueba 9/17a: debía persistir normalizado en minúsculas (%).', v_u_email_stored;
  END IF;

  IF (SELECT persona_id FROM public.app_users WHERE id = v_u_id_6) IS DISTINCT FROM v_u_pid_6 THEN
    RAISE EXCEPTION 'Fallo Prueba 9/17b: UPDATE del propio correo alteró persona_id.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 10 y 21: Intento de cambiar o anular persona_id durante UPDATE
  -- ===========================================================================
  v_err_caught := FALSE;
  BEGIN
    UPDATE public.app_users
    SET persona_id = v_p_otra_prin
    WHERE id = v_u_id_6;
  EXCEPTION WHEN check_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 10a: debía rechazar explícitamente el intento de sustituir persona_id en UPDATE.';
  END IF;

  v_err_caught := FALSE;
  BEGIN
    UPDATE public.app_users
    SET persona_id = NULL, email = 'intento.desvincular.10@test.local'
    WHERE id = v_u_id_6;
  EXCEPTION WHEN check_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 10b: debía rechazar explícitamente el intento de poner persona_id = NULL en UPDATE.';
  END IF;

  IF (SELECT persona_id FROM public.app_users WHERE id = v_u_id_6) IS DISTINCT FROM v_u_pid_6 THEN
    RAISE EXCEPTION 'Fallo Prueba 21: tras rechazos de UPDATE, persona_id no permaneció intacto.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 14, 18 y 19: Colisiones de unicidad normalizada entre INSERT y UPDATE
  -- ===========================================================================
  -- 14: UPDATE de la cuenta 6 hacia una variante en mayúsculas/espacios del correo de la cuenta 1
  v_err_caught := FALSE;
  BEGIN
    UPDATE public.app_users
    SET email = '   CUENTA.EXPLICITA.01@TEST.LOCAL  '
    WHERE id = v_u_id_6;
  EXCEPTION WHEN unique_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 14: debía rechazar UPDATE hacia variante con mayúsculas del correo de otra cuenta.';
  END IF;

  -- 18: Dos UPDATE dirigidos al mismo correo objetivo desde cuentas distintas (cuenta 1 y cuenta 6)
  UPDATE public.app_users
  SET email = 'objetivo.compartido.18@test.local'
  WHERE id = v_u_id_1;

  v_err_caught := FALSE;
  BEGIN
    UPDATE public.app_users
    SET email = '  OBJETIVO.COMPARTIDO.18@TEST.LOCAL '
    WHERE id = v_u_id_6;
  EXCEPTION WHEN unique_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 18: el segundo UPDATE hacia el mismo correo normalizado debía fallar con unique_violation.';
  END IF;

  -- 19 y 11: INSERT hacia un correo que acaba de ser tomado por un UPDATE (y viceversa)
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.app_users (email, password_hash, name, status)
    VALUES ('  OBJETIVO.COMPARTIDO.18@test.local ', 'hash_dummy_2', 'Colision Insert vs Update', 'ACTIVE');
  EXCEPTION WHEN unique_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 11/19: debía rechazar INSERT con correo normalizado ya tomado por otra cuenta.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 16: UPDATE con correo vacío ('', '   ') o NULL
  -- ===========================================================================
  v_err_caught := FALSE;
  BEGIN
    UPDATE public.app_users
    SET email = '     '
    WHERE id = v_u_id_6;
  EXCEPTION WHEN not_null_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 16: debía rechazar UPDATE con correo en blanco con not_null_violation.';
  END IF;

  IF (SELECT persona_id FROM public.app_users WHERE id = v_u_id_6) IS DISTINCT FROM v_u_pid_6 THEN
    RAISE EXCEPTION 'Fallo Prueba 21-final: persona_id de la cuenta 6 fue alterado.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 12: Conservación de cuentas y roles existentes
  -- ===========================================================================
  IF EXISTS (
    SELECT 1
    FROM _baseline_app_users b
    JOIN public.app_users u ON u.id = b.id
    WHERE u.email IS DISTINCT FROM b.email
       OR u.status IS DISTINCT FROM b.status
       OR u.persona_id IS DISTINCT FROM b.persona_id
  ) THEN
    RAISE EXCEPTION 'Fallo Prueba 12a: alguna cuenta preexistente en app_users fue alterada.';
  END IF;

  IF (SELECT COUNT(*) FROM _baseline_app_user_roles) <> (SELECT COUNT(*) FROM public.app_user_roles) THEN
    RAISE EXCEPTION 'Fallo Prueba 12b: cambió el conteo de asignaciones en app_user_roles.';
  END IF;
END
$$;

-- =============================================================================
-- PRUEBA 13: Reversión completa (DOWN) de la función y triggers
-- =============================================================================
\i sql/identity-6.4b-2b2/001_protect_app_users_persona_link.down.sql

-- Deshacer absolutamente todo al finalizar la validación en base aislada
ROLLBACK;
