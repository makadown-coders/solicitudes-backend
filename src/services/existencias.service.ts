import { Pool } from 'pg';
import dotenv from 'dotenv';
import { BatchPayload, TemporalExistenciaRow } from '../models/batchRow';
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
}