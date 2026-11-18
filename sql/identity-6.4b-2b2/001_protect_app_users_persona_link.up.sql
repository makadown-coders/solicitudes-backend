-- =============================================================================
-- MICROINTERVENCIÓN 6.4B-2B.2A — MIGRACIÓN PROPUESTA (UP) ENDURECIDA
-- Archivo: sql/identity-6.4b-2b2/001_protect_app_users_persona_link.up.sql
-- Objetivo:
--   Proteger el vínculo físico entre public.app_users y public.persona y
--   garantizar unicidad normalizada LOWER(TRIM(email)) tanto en INSERT como
--   en UPDATE sobre public.app_users:
--   1. Normalizar obligatoriamente NEW.email := LOWER(TRIM(NEW.email)) y
--      rechazar cadenas vacías o nulas tanto en INSERT como en UPDATE.
--   2. Serializar operaciones concurrentes sobre el mismo correo normalizado
--      mediante pg_advisory_xact_lock en INSERT y UPDATE, con orden canónico
--      de bloqueos (primero email, después persona_id) para impedir deadlocks.
--   3. Verificar duplicados de LOWER(TRIM(email)) en public.app_users tanto
--      en INSERT como en UPDATE (excluyendo u.id = OLD.id en UPDATE).
--   4. Proteger contra conflictos de identidad entre personas:
--      - En UPDATE y en INSERT con persona_id explícito, rechazar el uso de
--        un correo que esté registrado como correo activo (correo_principal o
--        persona_correo activo) de OTRA persona activa distinta (p.id <> persona_id),
--        permitiendo correos completamente nuevos o correos que únicamente
--        figuren en registros históricos inactivos (pc.activo = FALSE / p.activo = FALSE).
--   5. En UPDATE con OLD.persona_id IS NOT NULL, preservar inmutablemente
--      OLD.persona_id y rechazar explícitamente cualquier intento de cambiarlo
--      o ponerlo en NULL.
--   6. En UPDATE con OLD.persona_id IS NULL, no realizar autovinculación
--      automática por correo; si se proporciona NEW.persona_id explícito,
--      validar existencia, vigencia (activo = TRUE), unicidad 1:1 y ausencia
--      de conflicto de correo con otra persona activa.
--   7. En INSERT con NEW.persona_id IS NULL, buscar coincidencias únicamente
--      en personas activas (correo_principal y persona_correo activo),
--      rechazando ambigüedades (> 1 persona activa) o personas ya vinculadas,
--      y conservar provisionalmente el alta mínima en public.persona cuando
--      existen 0 coincidencias activas, sin exigir ni insertar en persona_correo.
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
  -- 0) VALIDACIÓN Y NORMALIZACIÓN COMÚN (INSERT Y UPDATE)
  -- ===========================================================================
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'app_users.email no puede ser nulo ni cadena vacía.'
      USING ERRCODE = 'not_null_violation';
  END IF;

  -- Persistir siempre el correo normalizado en la fila de app_users
  NEW.email := v_email;

  -- Orden canónico de bloqueos (Paso 1: lock por correo normalizado).
  -- Serializa: INSERT vs INSERT, INSERT vs UPDATE y UPDATE vs UPDATE hacia el mismo correo.
  PERFORM pg_advisory_xact_lock(hashtext('app_users_autolink_email'), hashtext(v_email));

  -- ===========================================================================
  -- 1) COMPORTAMIENTO EN UPDATE
  -- ===========================================================================
  IF TG_OP = 'UPDATE' THEN
    -- 1.1) Proteger inmutabilidad del vínculo físico cuando OLD.persona_id ya existe
    IF OLD.persona_id IS NOT NULL THEN
      IF NEW.persona_id IS DISTINCT FROM OLD.persona_id THEN
        RAISE EXCEPTION 'No se permite modificar ni desvincular app_users.persona_id (%) en una cuenta ya vinculada (user_id: %).',
          OLD.persona_id, OLD.id
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.persona_id := OLD.persona_id;
    END IF;

    -- 1.2) Verificar unicidad normalizada de email en app_users excluyendo la propia cuenta
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

    -- 1.3) Si OLD.persona_id IS NULL y se envía un NEW.persona_id explícito en UPDATE,
    --      validar que la persona exista, esté activa y no pertenezca a otra cuenta.
    --      (Si NEW.persona_id IS NULL, se preserva NULL sin autovincular en UPDATE).
    IF OLD.persona_id IS NULL AND NEW.persona_id IS NOT NULL THEN
      -- Orden canónico de bloqueos (Paso 2: lock por persona_id)
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

    -- 1.4) Política de conflicto de identidad con otras personas activas:
    --      Un UPDATE en app_users no puede asignar un correo que esté registrado como
    --      correo activo (correo_principal o persona_correo activo) de otra persona activa
    --      distinta del titular de la cuenta. Los correos que solo existan en registros
    --      históricos inactivos (activo = FALSE) o completamente nuevos sí se permiten.
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

  -- ===========================================================================
  -- 2) COMPORTAMIENTO EN INSERT
  -- ===========================================================================
  -- 2.1) Verificación de unicidad normalizada de email en app_users bajo el lock
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
    -- Orden canónico de bloqueos (Paso 2: lock por persona_id)
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

    -- Verificar que el correo de la cuenta no pertenezca a OTRA persona activa distinta
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

    -- Se respeta el persona_id proporcionado sin buscar por email ni crear registros
    RETURN NEW;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Caso B: INSERT con NEW.persona_id IS NULL (autovinculación controlada)
  -- ---------------------------------------------------------------------------
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
    -- Orden canónico de bloqueos (Paso 2: lock por persona_id)
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

-- Actualizar la definición del trigger de UPDATE para interceptar cualquier UPDATE
-- de email o persona_id sobre public.app_users.
DROP TRIGGER IF EXISTS t_app_users_autolink_persona_upd_email ON public.app_users;

CREATE TRIGGER t_app_users_autolink_persona_upd_email
  BEFORE UPDATE OF email, persona_id ON public.app_users
  FOR EACH ROW
  WHEN ((old.email IS DISTINCT FROM new.email) OR (old.persona_id IS DISTINCT FROM new.persona_id))
  EXECUTE FUNCTION public.auto_link_persona_for_app_user();

COMMIT;
