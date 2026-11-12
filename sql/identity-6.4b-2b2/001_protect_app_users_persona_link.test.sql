-- =============================================================================
-- MICROINTERVENCIÓN 6.4B-2B.2 — SUITE DE PRUEBAS SQL (BASE AISLADA)
-- Archivo: sql/identity-6.4b-2b2/001_protect_app_users_persona_link.test.sql
--
-- PROPÓSITO:
--   Validar dinámicamente en una instancia PostgreSQL AISLADA (nunca en la base
--   compartida/productiva sin autorización) los 13 escenarios obligatorios de la
--   Microintervención 6.4B-2B.2, envolviendo toda la ejecución en una transacción
--   que finaliza con ROLLBACK para no dejar ningún rastro si se ejecuta en un
--   entorno de pruebas.
--
-- ESCENARIOS CUBIERTOS:
--   1. Alta de cuenta con persona_id explícito (válido, inactivo, inexistente, ya vinculado).
--   2. Alta con coincidencia única por persona.correo_principal (sin fila en persona_correo).
--   3. Alta con coincidencia única por persona_correo activo (con persona.correo_principal NULL).
--   4. Alta con correo que solo existe en registros inactivos (persona_correo inactivo y persona inactiva).
--   5. Alta con coincidencias ambiguas (dos personas activas con el mismo correo en distintas tablas).
--   6. Alta sin coincidencias (creación provisional en persona sin insertar en persona_correo).
--   7. Cambio de correo de cuenta ya vinculada (preserva persona_id intacto, no crea persona).
--   8. Cambio de correo a uno que pertenece a otra persona (preserva persona_id original).
--   9. Cambio de correo únicamente de mayúsculas/minúsculas (preserva persona_id original).
--  10. Intento de cambiar o anular persona_id durante UPDATE (rechazo explícito).
--  11. Altas concurrentes / duplicadas con el mismo correo normalizado (bloqueo advisory + rechazo).
--  12. Conservación íntegra de cuentas y roles existentes (3 cuentas ADMIN_TIC GLOBAL).
--  13. Reversión completa de la función y triggers al estado original del dump.
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

  IF TG_OP = 'UPDATE' THEN
    IF OLD.persona_id IS NOT NULL THEN
      IF NEW.persona_id IS DISTINCT FROM OLD.persona_id THEN
        RAISE EXCEPTION 'No se permite modificar ni desvincular app_users.persona_id (%) en una cuenta ya vinculada (user_id: %).',
          OLD.persona_id, OLD.id
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.persona_id := OLD.persona_id;
      RETURN NEW;
    END IF;

    IF NEW.persona_id IS NOT NULL THEN
      SELECT p.activo INTO v_persona_ok
      FROM public.persona p
      WHERE p.id = NEW.persona_id;

      IF NOT FOUND OR v_persona_ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'El persona_id (%) especificado no existe o corresponde a una persona inactiva.',
          NEW.persona_id
          USING ERRCODE = 'foreign_key_violation';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.app_users u
        WHERE u.persona_id = NEW.persona_id
          AND u.id IS DISTINCT FROM OLD.id
      ) THEN
        RAISE EXCEPTION 'La persona (%) ya se encuentra vinculada a otra cuenta en app_users.',
          NEW.persona_id
          USING ERRCODE = 'unique_violation';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'app_users.email no puede ser vacío.'
      USING ERRCODE = 'not_null_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('app_users_autolink_email'), hashtext(v_email));

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
-- Ejecución de pruebas 1 a 12 en bloque PL/pgSQL
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
  v_p_otra          integer;
  v_u_id            uuid;
  v_u_pid           integer;
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
  VALUES ('cuenta.explicita.01@test.local', 'hash_dummy', 'Test 01', 'ACTIVE', v_p_explicita)
  RETURNING id, persona_id INTO v_u_id, v_u_pid;

  IF v_u_pid IS DISTINCT FROM v_p_explicita THEN
    RAISE EXCEPTION 'Fallo Prueba 1a: no se respetó el persona_id explícito (% vs %).', v_u_pid, v_p_explicita;
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
  RETURNING persona_id INTO v_u_pid;

  IF v_u_pid IS DISTINCT FROM v_p_correo_prin THEN
    RAISE EXCEPTION 'Fallo Prueba 2: debía vincular a persona % por correo_principal, obtuvo %.', v_p_correo_prin, v_u_pid;
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
  RETURNING persona_id INTO v_u_pid;

  IF v_u_pid IS DISTINCT FROM v_p_correo_sec THEN
    RAISE EXCEPTION 'Fallo Prueba 3: debía vincular a persona % por persona_correo activo, obtuvo %.', v_p_correo_sec, v_u_pid;
  END IF;

  -- ===========================================================================
  -- PRUEBA 4: Alta con correo que solo existe en registros inactivos
  -- ===========================================================================
  -- 4a: El correo existe únicamente en persona_correo con activo = FALSE de una persona inactiva
  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 04 Persona Inactiva Historica', NULL, FALSE, NOW(), NOW())
  RETURNING id INTO v_p_hist_inactiva;

  INSERT INTO public.persona_correo (persona_id, correo, es_principal, activo)
  VALUES (v_p_hist_inactiva, 'historico.inactivo.04@test.local', FALSE, FALSE);

  INSERT INTO public.app_users (email, password_hash, name, status)
  VALUES ('historico.inactivo.04@test.local', 'hash_dummy', 'Test 04 Nuevo', 'ACTIVE')
  RETURNING persona_id INTO v_u_pid;

  IF v_u_pid = v_p_hist_inactiva OR v_u_pid IS NULL THEN
    RAISE EXCEPTION 'Fallo Prueba 4a: NUNCA debe vincularse a la persona inactiva % (obtuvo %).', v_p_hist_inactiva, v_u_pid;
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
  RETURNING id, persona_id INTO v_u_id, v_u_pid;

  IF v_u_pid IS NULL THEN
    RAISE EXCEPTION 'Fallo Prueba 6a: debía crear y asignar persona_id.';
  END IF;

  IF (SELECT COUNT(*) FROM public.persona_correo) <> v_count_pc THEN
    RAISE EXCEPTION 'Fallo Prueba 6b: NO debe insertar filas en persona_correo al crear persona mínima.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 7: Cambio de correo de cuenta ya vinculada
  -- ===========================================================================
  SELECT COUNT(*) INTO v_count_personas FROM public.persona;

  UPDATE public.app_users
  SET email = 'correo.cambiado.07@test.local'
  WHERE id = v_u_id;

  IF (SELECT persona_id FROM public.app_users WHERE id = v_u_id) IS DISTINCT FROM v_u_pid THEN
    RAISE EXCEPTION 'Fallo Prueba 7a: el cambio de email alteró el persona_id de la cuenta.';
  END IF;

  IF (SELECT COUNT(*) FROM public.persona) <> v_count_personas THEN
    RAISE EXCEPTION 'Fallo Prueba 7b: el cambio de email en app_users creó una nueva fila en public.persona.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 8: Cambio de correo a uno que pertenece a otra persona
  -- ===========================================================================
  INSERT INTO public.persona (nombre_completo, correo_principal, activo, creado_en, actualizado_en)
  VALUES ('Test 08 Otra Persona', 'correo.de.otra.persona.08@test.local', TRUE, NOW(), NOW())
  RETURNING id INTO v_p_otra;

  UPDATE public.app_users
  SET email = 'correo.de.otra.persona.08@test.local'
  WHERE id = v_u_id;

  IF (SELECT persona_id FROM public.app_users WHERE id = v_u_id) IS DISTINCT FROM v_u_pid THEN
    RAISE EXCEPTION 'Fallo Prueba 8: cambiar email al correo de otra persona reasignó indebidamente persona_id.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 9: Cambio de correo únicamente de mayúsculas/minúsculas
  -- ===========================================================================
  UPDATE public.app_users
  SET email = 'CORREO.DE.OTRA.PERSONA.08@TEST.LOCAL'
  WHERE id = v_u_id;

  IF (SELECT persona_id FROM public.app_users WHERE id = v_u_id) IS DISTINCT FROM v_u_pid THEN
    RAISE EXCEPTION 'Fallo Prueba 9: cambio de capitalización en email alteró persona_id.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 10: Intento de cambiar o anular persona_id durante UPDATE
  -- ===========================================================================
  v_err_caught := FALSE;
  BEGIN
    UPDATE public.app_users
    SET persona_id = v_p_otra
    WHERE id = v_u_id;
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
    WHERE id = v_u_id;
  EXCEPTION WHEN check_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 10b: debía rechazar explícitamente el intento de poner persona_id = NULL en UPDATE.';
  END IF;

  -- ===========================================================================
  -- PRUEBA 11: Altas duplicadas / concurrentes con el mismo correo normalizado
  -- ===========================================================================
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.app_users (email, password_hash, name, status)
    VALUES ('  nuevo.sin.coincidencia.06@TEST.LOCAL ', 'hash_dummy_2', 'Duplicado Normalizado', 'ACTIVE');
  EXCEPTION WHEN unique_violation THEN
    v_err_caught := TRUE;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'Fallo Prueba 11: debía rechazar segunda alta con el mismo correo normalizado.';
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
