-- =============================================================================
-- MICROINTERVENCIÓN 6.4B-2B.2 — MIGRACIÓN PROPUESTA (UP)
-- Archivo: sql/identity-6.4b-2b2/001_protect_app_users_persona_link.up.sql
-- Objetivo:
--   Proteger el vínculo físico entre public.app_users y public.persona:
--   1. Impedir que un UPDATE en app_users (incluido cambio de email) altere un
--      persona_id ya establecido o intente sustituirlo silenciosamente.
--   2. En UPDATE con OLD.persona_id IS NULL, no realizar autovinculación automática
--      y rechazar asignaciones no autorizadas si no se valida por flujo explícito.
--   3. En INSERT con NEW.persona_id IS NOT NULL, respetar ese identificador tras
--      validar que corresponda a una persona existente, activa y libre.
--   4. En INSERT con NEW.persona_id IS NULL, buscar coincidencias normalizadas
--      (LOWER(TRIM(...))) exclusivamente sobre personas activas (p.activo IS TRUE)
--      considerando persona.correo_principal y persona_correo (pc.activo IS TRUE),
--      rechazando coincidencias ambiguas (> 1 persona activa) o personas ya vinculadas.
--   5. Si no hay coincidencias en INSERT con NEW.persona_id IS NULL, conservar
--      provisionalmente la creación de un registro mínimo en public.persona sin
--      exigir ni insertar filas en public.persona_correo (tabla opcional).
--   6. Proteger contra condiciones de carrera en altas concurrentes con el mismo
--      correo normalizado mediante pg_advisory_xact_lock.
--
-- RESTRICCIONES DE SEGURIDAD:
--   - NO ejecuta DROP TABLE ni borra registros.
--   - NO modifica filas existentes en public.app_users, public.app_user_roles,
--     public.persona ni public.persona_correo.
--   - NO crea extensiones ni índices nuevos.
-- =============================================================================

BEGIN;

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

  -- ===========================================================================
  -- 1) COMPORTAMIENTO EN UPDATE
  -- ===========================================================================
  IF TG_OP = 'UPDATE' THEN
    -- Si la cuenta ya tiene persona_id vinculado, ese vínculo físico es inmutable
    -- ante cambios de correo y no puede sustituirse ni eliminarse silenciosamente.
    IF OLD.persona_id IS NOT NULL THEN
      IF NEW.persona_id IS DISTINCT FROM OLD.persona_id THEN
        RAISE EXCEPTION 'No se permite modificar ni desvincular app_users.persona_id (%) en una cuenta ya vinculada (user_id: %).',
          OLD.persona_id, OLD.id
          USING ERRCODE = 'check_violation';
      END IF;

      -- Preservar exactamente el vínculo físico existente sin tocar persona ni persona_correo
      NEW.persona_id := OLD.persona_id;
      RETURN NEW;
    END IF;

    -- Si OLD.persona_id IS NULL: no ejecutar autovinculación automática durante UPDATE
    -- de correo. Cualquier vinculación posterior requerirá un flujo administrativo explícito.
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

  -- ===========================================================================
  -- 2) COMPORTAMIENTO EN INSERT
  -- ===========================================================================
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'app_users.email no puede ser vacío.'
      USING ERRCODE = 'not_null_violation';
  END IF;

  -- Sincronización transaccional por correo normalizado para evitar condiciones
  -- de carrera entre dos INSERT concurrentes con el mismo correo (ej. distinta capitalización).
  PERFORM pg_advisory_xact_lock(hashtext('app_users_autolink_email'), hashtext(v_email));

  -- Verificación de unicidad normalizada de email en app_users bajo el lock transaccional
  IF EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE LOWER(TRIM(u.email)) = v_email
  ) THEN
    RAISE EXCEPTION 'Ya existe una cuenta en app_users con el correo normalizado (%).',
      v_email
      USING ERRCODE = 'unique_violation';
  END IF;

  -- ---------------------------------------------------------------------------
  -- Caso A: INSERT con NEW.persona_id explícito (IS NOT NULL)
  -- ---------------------------------------------------------------------------
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

    -- Se respeta el persona_id proporcionado sin buscar por email ni crear registros
    RETURN NEW;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Caso B: INSERT con NEW.persona_id IS NULL (autovinculación controlada)
  -- ---------------------------------------------------------------------------
  -- Buscar todas las personas ACTIVAS que coincidan por persona.correo_principal
  -- o por algún correo ACTIVO en persona_correo.
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

  -- 0 coincidencias en personas activas:
  -- Si el correo está retenido en persona.correo_principal de un registro INACTIVO,
  -- el índice único uq_persona_correo_principal_ci (que no filtra activo IS TRUE)
  -- impediría insertar otra persona con ese mismo correo_principal. Se rechaza con
  -- mensaje explícito para no vincular a una persona inactiva ni fallar de forma opaca.
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

  -- Creación provisional de persona mínima en public.persona (sin exigir ni insertar
  -- en public.persona_correo, dado que persona_correo es una tabla complementaria opcional).
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

-- Actualizar la definición del trigger de UPDATE para interceptar tanto cambios de email
-- como cualquier intento de alterar persona_id durante un UPDATE en public.app_users.
DROP TRIGGER IF EXISTS t_app_users_autolink_persona_upd_email ON public.app_users;

CREATE TRIGGER t_app_users_autolink_persona_upd_email
  BEFORE UPDATE OF email, persona_id ON public.app_users
  FOR EACH ROW
  WHEN ((old.email IS DISTINCT FROM new.email) OR (old.persona_id IS DISTINCT FROM new.persona_id))
  EXECUTE FUNCTION public.auto_link_persona_for_app_user();

COMMIT;
