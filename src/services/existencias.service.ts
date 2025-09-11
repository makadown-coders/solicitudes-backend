import { Pool } from 'pg';
import dotenv from 'dotenv';
import { BatchPayload, ExistenciaUnidadRow, TemporalExistenciaRow } from '../models/batchRow';
dotenv.config();

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USERNAME,
    password: process.env.POSTGRES_PASSWORD,
});

/**
 * Servicio de existencias (temporales)
 */
export default class ExistenciasService {
    async init(reset: boolean) {
        if (reset) {
            await pool.query('TRUNCATE TABLE public.tmp_existencias;');
        }
        return { ok: true };
    }

    async batch(rows: TemporalExistenciaRow[]) {
        if (!rows?.length) return { inserted: 0 };

        const sql = `
      INSERT INTO public.tmp_existencias
      (fuente, alias_sas, cluessa, cluesimb, clave_cnis, lote, fecha_caducidad, existencia)
      SELECT
        x->>'fuente',
        NULLIF(x->>'alias_sas',''),
        NULLIF(x->>'cluessa',''),
        NULLIF(x->>'cluesimb',''),
        UPPER(TRIM(x->>'clave_cnis')),
        NULLIF(x->>'lote',''),
        NULLIF(x->>'fecha_caducidad','')::date,
        COALESCE((x->>'existencia')::numeric, 0)
      FROM jsonb_array_elements($1::jsonb) AS x;
    `;
        const { rowCount } = await pool.query(sql, [JSON.stringify(rows)]);
        return { inserted: rowCount || 0 };
    }

    async getByUnidad(cluesimb: string): Promise<ExistenciaUnidadRow[]> {
        const key = (cluesimb || '').trim().toUpperCase();
        if (!key) return [];

        const sql = `
      WITH e AS (
        SELECT
          t.clave_cnis,
          /* resolvemos la unidad del registro:
             - si la fila ya trae cluesimb, lo usamos (UPPER/trim)
             - si no, resolvemos por alias_sas -> unidad_medica_alias -> unidad_medica
             - si no, resolvemos por cluessa -> unidad_medica
          */
          COALESCE(
            NULLIF(UPPER(TRIM(t.cluesimb)),''),
            um_a.cluesimb,
            um_s.cluesimb
          ) AS resolved_cluesimb,
          t.existencia
        FROM public.tmp_existencias t
        LEFT JOIN public.unidad_medica_alias ua
          ON t.alias_sas IS NOT NULL
         AND lower(t.alias_sas) = lower(ua.alias_sas)
        LEFT JOIN public.unidad_medica um_a
          ON ua.unidad_medica_id = um_a.id
        LEFT JOIN public.unidad_medica um_s
          ON t.cluessa IS NOT NULL
         AND t.cluessa = um_s.cluessa
      )
      SELECT
        clave_cnis,
        SUM(existencia)::numeric AS existencia_total
      FROM e
      WHERE resolved_cluesimb = $1
      GROUP BY clave_cnis
      ORDER BY clave_cnis;
    `;

        const { rows } = await pool.query(sql, [key]);
        return rows as ExistenciaUnidadRow[];
    }

    /** Opcional: saber si hay staging para una unidad (útil para toggles en el front) */
    async hasForUnidad(cluesimb: string): Promise<boolean> {
        const key = (cluesimb || '').trim().toUpperCase();
        if (!key) return false;

        const sql = `
      WITH e AS (
        SELECT
          COALESCE(
            NULLIF(UPPER(TRIM(t.cluesimb)),''),
            um_a.cluesimb,
            um_s.cluesimb
          ) AS resolved_cluesimb
        FROM public.tmp_existencias t
        LEFT JOIN public.unidad_medica_alias ua
          ON t.alias_sas IS NOT NULL
         AND lower(t.alias_sas) = lower(ua.alias_sas)
        LEFT JOIN public.unidad_medica um_a
          ON ua.unidad_medica_id = um_a.id
        LEFT JOIN public.unidad_medica um_s
          ON t.cluessa IS NOT NULL
         AND t.cluessa = um_s.cluessa
      )
      SELECT 1
      FROM e
      WHERE resolved_cluesimb = $1
      LIMIT 1;
    `;
        const { rowCount } = await pool.query(sql, [key]);
        return (rowCount ?? 0) > 0;
    }

}