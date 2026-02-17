// src/services/homologos.service.ts
import { pool } from '../db/pool';
import { HomologoEdgeRow } from '../models/homologos/HomologoEdgeRow';
import { HomologoRow } from '../models/homologos/HomologoRow';

export default class HomologosService {
  /**
   * Devuelve homólogos para una clave.
   */
  async getByClave(clave: string): Promise<HomologoRow[]> {
    const k = (clave || '').trim().toUpperCase();
    if (!k) return [];

    const sql = `
      SELECT
        UPPER(TRIM(clave))     AS clave,
        UPPER(TRIM(sustituto)) AS sustituto,
        factor::text           AS factor
      FROM public.homologos
      WHERE UPPER(TRIM(clave)) = $1
      ORDER BY sustituto;
    `;

    const { rows } = await pool.query(sql, [k]);
    return (rows ?? []) as HomologoRow[];
  }

  /**
   * Batch: devuelve homólogos para un conjunto de claves.
   * Recomendado para el mini-balanceador.
   */
  async batch(claves: string[]): Promise<HomologoEdgeRow[]> {
    const uniq = Array.from(
      new Set((claves ?? []).map(c => (c || '').trim().toUpperCase()).filter(Boolean))
    );
    if (!uniq.length) return [];

    const sql = `
    WITH in_keys AS (
      SELECT unnest($1::text[]) AS k
    )
    SELECT
      ik.k AS "claveConsultada",
      CASE
        WHEN UPPER(TRIM(h.clave)) = ik.k THEN UPPER(TRIM(h.sustituto))
        ELSE UPPER(TRIM(h.clave))
      END AS "candidato",
      (
        CASE
          WHEN UPPER(TRIM(h.clave)) = ik.k THEN h.factor::numeric
          ELSE (1 / h.factor::numeric)
        END
      )::text AS "factor",
      CASE
        WHEN UPPER(TRIM(h.clave)) = ik.k THEN 'FORWARD'
        ELSE 'REVERSE'
      END AS "direccion"
    FROM in_keys ik
    JOIN public.homologos h
      ON UPPER(TRIM(h.clave)) = ik.k
      OR UPPER(TRIM(h.sustituto)) = ik.k
    ORDER BY "claveConsultada", "direccion", "candidato";
  `;

    const { rows } = await pool.query(sql, [uniq]);
    return (rows ?? []) as HomologoEdgeRow[];
  }
}
