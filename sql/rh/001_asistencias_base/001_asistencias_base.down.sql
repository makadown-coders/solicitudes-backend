-- =============================================================================
-- MICROINTERVENCIÓN RH-DB.1 — MIGRACIÓN DOWN
-- Archivo: sql/rh/001_asistencias_base/001_asistencias_base.down.sql
-- ADVERTENCIA:
--   Ejecutar este script ELIMINARÁ permanentemente las tablas de asistencias
--   y toda la información capturada en ellas si ya comenzó la operación.
--   Revierte exclusivamente los objetos creados por 001_asistencias_base.up.sql.
-- =============================================================================

BEGIN;

DROP INDEX IF EXISTS public.idx_rh_detalle_fecha;
DROP TABLE IF EXISTS public.rh_asistencia_detalle;

DROP INDEX IF EXISTS public.idx_rh_lista_persona_periodo;
DROP INDEX IF EXISTS public.idx_rh_lista_unidad_periodo;
DROP TABLE IF EXISTS public.rh_lista_asistencia;

DROP TABLE IF EXISTS public.rh_periodo_asistencia;

DROP INDEX IF EXISTS public.idx_rh_adscripcion_unidad;
DROP INDEX IF EXISTS public.idx_rh_adscripcion_persona;
DROP TABLE IF EXISTS public.rh_adscripcion_laboral;

COMMIT;
