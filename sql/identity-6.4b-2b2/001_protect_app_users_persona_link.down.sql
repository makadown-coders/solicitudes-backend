-- =============================================================================
-- MICROINTERVENCIÓN 6.4B-2B.2 / 6.4B-2B.2A — SCRIPT DE REVERSIÓN (DOWN)
-- Archivo: sql/identity-6.4b-2b2/001_protect_app_users_persona_link.down.sql
-- Objetivo:
--   Restaurar exactamente la función public.auto_link_persona_for_app_user()
--   y los triggers t_app_users_autolink_persona_ins y
--   t_app_users_autolink_persona_upd_email a su definición original documentada
--   en dump-postgres-202611111225.sql (líneas 1026-1066 y 17400-17408), sin
--   modificar ninguna fila existente en las tablas.
--
-- ADVERTENCIA IMPORTANTE SOBRE DATOS POST-DESPLIEGUE:
--   Este script restaura exclusivamente las definiciones de catálogo (función
--   y triggers). Revertir la función NO revierte automáticamente los cambios
--   de datos (altas de usuarios, personas o cambios de correo) que pudieran
--   haberse confirmado en las tablas después del despliegue de la migración UP.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_link_persona_for_app_user() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_email text;
  v_pid   integer;
  v_name  text;
BEGIN
  v_email := LOWER(TRIM(NEW.email));
  v_name  := NULLIF(TRIM(COALESCE(NEW.name, '')), '');

  -- 1) Match por correo_principal
  SELECT p.id INTO v_pid
  FROM public.persona p
  WHERE LOWER(p.correo_principal) = v_email
  LIMIT 1;

  -- 2) Match por correos secundarios
  IF v_pid IS NULL THEN
    SELECT pc.persona_id INTO v_pid
    FROM public.persona_correo pc
    WHERE LOWER(pc.correo) = v_email
    LIMIT 1;
  END IF;

  -- 3) Si no existe persona, crear mínima
  IF v_pid IS NULL THEN
    INSERT INTO public.persona (nombre_completo, correo_principal, creado_en, actualizado_en)
    VALUES (COALESCE(v_name, NEW.email), NEW.email, NOW(), NOW())
    RETURNING id INTO v_pid;

    -- asegurar fila en persona_correo
    INSERT INTO public.persona_correo (persona_id, correo, es_principal)
    VALUES (v_pid, NEW.email, TRUE)
    ON CONFLICT DO NOTHING;
  END IF;

  NEW.persona_id := v_pid;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS t_app_users_autolink_persona_ins ON public.app_users;
CREATE TRIGGER t_app_users_autolink_persona_ins
  BEFORE INSERT ON public.app_users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_persona_for_app_user();

DROP TRIGGER IF EXISTS t_app_users_autolink_persona_upd_email ON public.app_users;
CREATE TRIGGER t_app_users_autolink_persona_upd_email
  BEFORE UPDATE OF email ON public.app_users
  FOR EACH ROW
  WHEN ((old.email IS DISTINCT FROM new.email))
  EXECUTE FUNCTION public.auto_link_persona_for_app_user();

COMMIT;
