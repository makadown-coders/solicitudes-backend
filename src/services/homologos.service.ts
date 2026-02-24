// src/services/homologos.service.ts
import { pool } from '../db/pool';
import { HomologoEdgeRow } from '../models/homologos/HomologoEdgeRow';
import { HomologoRow } from '../models/homologos/HomologoRow';

export type HomologoCrudRow = {
  id: number;
  clave: string;
  sustituto: string;
  factor: string; // numeric -> text to preserve precision
};

export type HomologoCrudCreateInput = {
  clave: string;
  sustituto: string;
  factor: string | number;
};

export type HomologoCrudUpdateInput = {
  clave?: string;
  sustituto?: string;
  factor?: string | number;
};

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

  /**
   * Batch FORWARD: solo clave -> sustituto, sin inversos REVERSE.
   */
  async batchForward(claves: string[]): Promise<HomologoEdgeRow[]> {
    const uniq = Array.from(
      new Set((claves ?? []).map(c => (c || '').trim().toUpperCase()).filter(Boolean))
    );
    if (!uniq.length) return [];

    const sql = `
      WITH in_keys AS (
        SELECT unnest($1::text[]) AS k
      )
      SELECT
        ik.k                      AS "claveConsultada",
        UPPER(TRIM(h.sustituto))  AS "candidato",
        h.factor::text            AS "factor",
        'FORWARD'                 AS "direccion"
      FROM in_keys ik
      JOIN public.homologos h
        ON UPPER(TRIM(h.clave)) = ik.k
      ORDER BY "claveConsultada", "candidato";
    `;

    const { rows } = await pool.query(sql, [uniq]);
    return (rows ?? []) as HomologoEdgeRow[];
  }

  /**
   * CRUD: lista registros de homologos.
   */
  async listCrud(): Promise<HomologoCrudRow[]> {
    const sql = `
      SELECT
        id,
        UPPER(TRIM(clave))     AS clave,
        UPPER(TRIM(sustituto)) AS sustituto,
        factor::text           AS factor
      FROM public.homologos
      ORDER BY id ASC;
    `;

    const { rows } = await pool.query(sql);
    return (rows ?? []) as HomologoCrudRow[];
  }

  /**
   * CRUD: obtiene un registro por id.
   */
  async getCrudById(id: number): Promise<HomologoCrudRow | null> {
    const sql = `
      SELECT
        id,
        UPPER(TRIM(clave))     AS clave,
        UPPER(TRIM(sustituto)) AS sustituto,
        factor::text           AS factor
      FROM public.homologos
      WHERE id = $1
      LIMIT 1;
    `;

    const { rows } = await pool.query(sql, [id]);
    return (rows?.[0] as HomologoCrudRow) ?? null;
  }

  /**
   * CRUD: crea un registro.
   */
  async createCrud(payload: HomologoCrudCreateInput): Promise<HomologoCrudRow> {
    const sql = `
      INSERT INTO public.homologos (clave, sustituto, factor)
      VALUES (UPPER(TRIM($1)), UPPER(TRIM($2)), $3::numeric)
      RETURNING
        id,
        UPPER(TRIM(clave))     AS clave,
        UPPER(TRIM(sustituto)) AS sustituto,
        factor::text           AS factor;
    `;

    const { rows } = await pool.query(sql, [
      payload.clave,
      payload.sustituto,
      payload.factor,
    ]);

    return rows[0] as HomologoCrudRow;
  }

  /**
   * CRUD: actualiza un registro por id.
   */
  async updateCrud(id: number, payload: HomologoCrudUpdateInput): Promise<HomologoCrudRow | null> {
    const updates: string[] = [];
    const values: any[] = [id];
    let idx = 2;

    if (payload.clave !== undefined) {
      updates.push(`clave = UPPER(TRIM($${idx++}))`);
      values.push(payload.clave);
    }

    if (payload.sustituto !== undefined) {
      updates.push(`sustituto = UPPER(TRIM($${idx++}))`);
      values.push(payload.sustituto);
    }

    if (payload.factor !== undefined) {
      updates.push(`factor = $${idx++}::numeric`);
      values.push(payload.factor);
    }

    if (!updates.length) {
      throw new Error('No hay campos para actualizar.');
    }

    const sql = `
      UPDATE public.homologos
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING
        id,
        UPPER(TRIM(clave))     AS clave,
        UPPER(TRIM(sustituto)) AS sustituto,
        factor::text           AS factor;
    `;

    const { rows } = await pool.query(sql, values);
    return (rows?.[0] as HomologoCrudRow) ?? null;
  }

  /**
   * CRUD: elimina un registro por id.
   */
  async deleteCrud(id: number): Promise<boolean> {
    const sql = `
      DELETE FROM public.homologos
      WHERE id = $1;
    `;
    const { rowCount } = await pool.query(sql, [id]);
    return (rowCount ?? 0) > 0;
  }
}
