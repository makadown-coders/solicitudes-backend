import { randomUUID } from 'crypto';
import { pool } from '../db/pool';
import { InitArgs } from '../models/cargaMasivaCpmKits/InitArgs';
import { BatchRowDTO } from '../models/cargaMasivaCpmKits/BatchRowDTO';
import { WarningItem } from '../models/cargaMasivaCpmKits/WarningItem';
import { CpmKitsBatchPayload, InitPayload } from '../models/cargaMasivaCpmKits/CpmKitsBatchPayload';

const norm = (s: any) => (s ?? '').toString().trim();
const up = (s: any) => norm(s).toUpperCase();

export default class CargaMasivaCpmKitsService {
  async init(payload: InitPayload) {
    if (!payload?.confirm) {
      return { ok: false, code: 'CONFIRM_REQUIRED', msg: 'Confirmación requerida (checkbox).' };
    }

    const kitCodes = (payload.kitCodes || [])
      .map(x => (x ?? '').toString().trim().toUpperCase())
      .filter(Boolean);

    const truncateCpm = payload.truncateCpm !== false;
    const resetKits = payload.resetKits !== false;

    const cx = await pool.connect();
    try {
      await cx.query('BEGIN');

      if (truncateCpm) {
        // CPM no depende de cascadas, es seguro truncar
        await cx.query('TRUNCATE TABLE public.cpm');
      }

      if (kitCodes.length) {
        // 1) Asegurar que existan los kits (upsert)
        await cx.query(
          `
        WITH src AS (
          SELECT DISTINCT upper(trim(x)) AS codigo
          FROM unnest($1::text[]) x
          WHERE coalesce(trim(x),'') <> ''
        )
        INSERT INTO public.kit (codigo, nombre)
        SELECT s.codigo, s.codigo
        FROM src s
        ON CONFLICT (upper(codigo)) DO UPDATE
          SET nombre = EXCLUDED.nombre;
        `,
          [kitCodes],
        );

        // 2) Reset SOLO de los kits involucrados (kit_clave_unidad)
        if (resetKits) {
          await cx.query(
            `
          DELETE FROM public.kit_clave_unidad kcu
          USING public.kit k
          WHERE k.id = kcu.kit_id
            AND upper(trim(k.codigo)) = ANY($1::text[]);
          `,
            [kitCodes],
          );
        }
      }

      await cx.query('COMMIT');
      return {
        ok: true,
        stats: {
          truncateCpm,
          resetKits,
          kitsConsidered: kitCodes.length,
        },
      };
    } catch (e) {
      await cx.query('ROLLBACK');
      throw e;
    } finally {
      cx.release();
    }
  }

  async batchUpsert(payload: CpmKitsBatchPayload) {
    const rows = payload?.rows || [];
    if (!rows.length) return { ok: false, msg: 'Batch vacío.' };

    const sourceTag = (payload.sourceTag ?? '').toString().trim() || null;

    const cx = await pool.connect();
    try {
      await cx.query('BEGIN');

      const sql = `
    WITH src_raw AS (
      SELECT
        upper(trim(x->>'cluesimb')) AS cluesimb,
        upper(trim(x->>'clave_cnis')) AS clave_cnis,
        NULLIF(x->>'cpm','')::numeric AS cpm,
        COALESCE(
          (SELECT array_agg(upper(trim(v)))
           FROM jsonb_array_elements_text(COALESCE(x->'kitsOnes','[]'::jsonb)) v
           WHERE coalesce(trim(v),'') <> ''),
          ARRAY[]::text[]
        ) AS kits
      FROM jsonb_array_elements($1::jsonb) x
    ),
    src AS (
      SELECT *
      FROM src_raw
      WHERE cluesimb <> '' AND clave_cnis <> '' AND cpm IS NOT NULL
    ),
    um AS (
      SELECT id, upper(trim(cluesimb)) AS cluesimb
      FROM public.unidad_medica
    ),
    art AS (
      SELECT upper(trim(clave)) AS clave
      FROM public.articulos
      WHERE clave IS NOT NULL
    ),
    src_ok AS (
      SELECT s.*, u.id AS unidad_medica_id
      FROM src s
      JOIN um u  ON u.cluesimb = s.cluesimb
      JOIN art a ON a.clave    = s.clave_cnis
    ),    
    src_ok_dedup AS (
      SELECT
        unidad_medica_id,
        clave_cnis,
        MAX(cpm) AS cpm,
        array_agg(k) AS kits_arrays
      FROM src_ok
      LEFT JOIN LATERAL unnest(src_ok.kits) k ON true
      GROUP BY unidad_medica_id, clave_cnis
    ),
    src_ok_dedup_kits AS (
      SELECT
        d.unidad_medica_id,
        d.clave_cnis,
        d.cpm,
        COALESCE(
          (
            SELECT array_agg(DISTINCT upper(trim(k)))
            FROM unnest(d.kits_arrays::text[]) k
            WHERE coalesce(trim(k),'') <> ''
          ),
          ARRAY[]::text[]
        ) AS kits
      FROM src_ok_dedup d
    ),
    upsert_cpm AS (
      INSERT INTO public.cpm (unidad_medica_id, clave_cnis, cpm, fuente)
      SELECT
        unidad_medica_id,
        clave_cnis,
        cpm,
        $2::text
      FROM src_ok_dedup_kits
      ON CONFLICT (unidad_medica_id, clave_cnis)
      DO UPDATE SET
        cpm = EXCLUDED.cpm,
        fuente = EXCLUDED.fuente
      RETURNING 1
    ),
    src_kits AS (
      SELECT DISTINCT
        sok.unidad_medica_id,
        sok.clave_cnis,
        unnest(sok.kits) AS kit_codigo
      FROM src_ok_dedup_kits sok
    ),
    kits_clean AS (
      SELECT
        unidad_medica_id,
        clave_cnis,
        upper(trim(kit_codigo)) AS kit_codigo
      FROM src_kits
      WHERE coalesce(trim(kit_codigo),'') <> ''
    ),
    ensured_kits AS (
      INSERT INTO public.kit (codigo, nombre)
      SELECT DISTINCT kit_codigo, kit_codigo
      FROM kits_clean
      ON CONFLICT (upper(codigo)) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING 1
    ),
    target_kits AS (
      SELECT id, upper(trim(codigo)) AS codigo
      FROM public.kit
      WHERE upper(trim(codigo)) IN (SELECT DISTINCT kit_codigo FROM kits_clean)
    ),
    inserted_kcu AS (
      INSERT INTO public.kit_clave_unidad (kit_id, unidad_medica_id, clave_cnis, fuente)
      SELECT DISTINCT
        k.id AS kit_id,
        kc.unidad_medica_id,
        kc.clave_cnis,
        $2::text
      FROM kits_clean kc
      JOIN target_kits k ON k.codigo = kc.kit_codigo
      ON CONFLICT (kit_id, unidad_medica_id, clave_cnis) DO NOTHING
      RETURNING 1
    )
    SELECT
      (SELECT count(*) FROM src_raw) AS src_raw_rows,
      (SELECT count(*) FROM src)     AS src_rows_valid,
      (SELECT count(*) FROM src_ok)  AS rows_ok,
      (SELECT count(*) FROM upsert_cpm) AS cpm_upserts,
      (SELECT count(*) FROM inserted_kcu) AS kit_clave_unidad_inserts
    ;
    `;

      const { rows: out } = await cx.query(sql, [JSON.stringify(rows), sourceTag]);

      await cx.query('COMMIT');
      return { ok: true, stats: out?.[0] ?? null };
    } catch (e) {
      await cx.query('ROLLBACK');
      throw e;
    } finally {
      cx.release();
    }
  }
}