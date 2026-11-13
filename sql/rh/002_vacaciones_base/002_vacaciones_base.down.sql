-- =============================================================================
-- MICROINTERVENCIÓN RH-VAC-DB.1 — MIGRACIÓN DOWN
-- Archivo: sql/rh/002_vacaciones_base/002_vacaciones_base.down.sql
-- ADVERTENCIA:
--   Ejecutar este script ELIMINARÁ permanentemente las tablas de vacaciones
--   y todo el historial de derechos, disfrutes y movimientos registrados.
--   Revierte exclusivamente los objetos creados por 002_vacaciones_base.up.sql.
-- =============================================================================

BEGIN;

DROP INDEX IF EXISTS public.uq_rh_vac_mov_reverso_unico;
DROP INDEX IF EXISTS public.uq_rh_vac_mov_disfrute_unico;
DROP INDEX IF EXISTS public.idx_rh_vac_mov_derecho;
DROP TABLE IF EXISTS public.rh_vacacion_movimiento;

DROP INDEX IF EXISTS public.idx_rh_vac_disfrute_estado;
DROP INDEX IF EXISTS public.idx_rh_vac_disfrute_derecho;
DROP TABLE IF EXISTS public.rh_vacacion_disfrute;

DROP INDEX IF EXISTS public.idx_rh_vac_derecho_persona;
DROP TABLE IF EXISTS public.rh_vacacion_derecho;

COMMIT;
