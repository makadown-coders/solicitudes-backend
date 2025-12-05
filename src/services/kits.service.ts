import { pool } from '../db/pool';
import { KitMatrixRow } from '../models/kit-matrix';
import { KitRow } from '../models/KitRow';

export default class KitsService {
  async listKits(search?: string): Promise<KitRow[]> {
    const baseSql = `
      SELECT id, codigo, nombre
      FROM public.kit
    `;
    const params: any[] = [];
    let where = '';

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      where = `
        WHERE codigo ILIKE $1
           OR nombre ILIKE $1
      `;
    }

    const sql = baseSql + where + ' ORDER BY codigo';
    const { rows } = await pool.query(sql, params);
    return rows as KitRow[];
  }

  async createKit(codigo: string, nombre?: string | null): Promise<KitRow> {
    const sql = `
      INSERT INTO public.kit (codigo, nombre)
      VALUES (UPPER(TRIM($1)), $2)
      RETURNING id, codigo, nombre;
    `;
    const { rows } = await pool.query(sql, [codigo, nombre ?? null]);
    return rows[0] as KitRow;
  }

  async updateKit(id: number, codigo: string, nombre?: string | null): Promise<KitRow | null> {
    const sql = `
      UPDATE public.kit
      SET codigo = UPPER(TRIM($2)),
          nombre = $3
      WHERE id = $1
      RETURNING id, codigo, nombre;
    `;
    const { rows } = await pool.query(sql, [id, codigo, nombre ?? null]);
    return rows[0] ?? null;
  }

  async deleteKit(id: number): Promise<boolean> {
    // kit_clave tiene FK ON DELETE CASCADE
    const sql = `DELETE FROM public.kit WHERE id = $1`;
    const { rowCount } = await pool.query(sql, [id]);
    return (rowCount ?? 0) > 0;
  }

  /**
   * Carga masiva de kits + claves a partir de matriz (Excel aplanado).
   * - Crea kits nuevos si no existen.
   * - Reemplaza COMPLETAMENTE kit_clave de los kits presentes en la matriz.
   * - No toca las relaciones unidad_medica_kit.
   */
  async bulkUpsertFromMatrix(rows: KitMatrixRow[]) {
    if (!rows?.length) {
      return { ok: false, message: 'No se recibieron filas de matriz', stats: null };
    }

    // Todo el chiste va en un solo SQL usando JSONB
    const sql = `
      WITH src_raw AS (
        SELECT
          upper(trim(x->>'codigo')) AS codigo,
          upper(trim(x->>'clave'))  AS clave
        FROM jsonb_array_elements($1::jsonb) x
        WHERE coalesce(x->>'codigo','') <> ''
          AND coalesce(x->>'clave','')  <> ''
      ),
      -- Por seguridad, removemos duplicados clave+kit
      src AS (
        SELECT DISTINCT codigo, clave
        FROM src_raw
      ),
      codigos_excel AS (
        SELECT DISTINCT codigo FROM src
      ),
      existing_kits AS (
        SELECT id, upper(trim(codigo)) AS codigo
        FROM public.kit
      ),
      -- 3) Códigos que están en Excel pero no en BD: @codigosACrearEnBD
      to_create AS (
        SELECT e.codigo
        FROM codigos_excel e
        LEFT JOIN existing_kits k ON k.codigo = e.codigo
        WHERE k.id IS NULL
      ),
      -- 6) Insertar kits nuevos (nombre = código por simplicidad)
      inserted_kits AS (
        INSERT INTO public.kit (codigo, nombre)
        SELECT codigo, codigo
        FROM to_create
        RETURNING id, upper(trim(codigo)) AS codigo
      ),
      -- union de kits ya existentes + recién creados
      all_kits AS (
        SELECT * FROM existing_kits
        UNION ALL
        SELECT * FROM inserted_kits
      ),
      -- 4) @codigosAModificar = intersección BD + Excel
      codigos_a_modificar AS (
        SELECT DISTINCT s.codigo
        FROM src s
        JOIN all_kits k ON k.codigo = s.codigo
      ),
      -- 5) borrar kit_clave de los códigos que aparecen en Excel
      deleted_claves AS (
        DELETE FROM public.kit_clave kc
        USING all_kits k
        WHERE kc.kit_id = k.id
          AND k.codigo IN (SELECT codigo FROM codigos_a_modificar)
        RETURNING kc.kit_id, kc.clave
      ),
      -- 5.2 y 6.2) insertar claves para todos los kits presentes en la matriz
      src_with_kit AS (
        SELECT
          k.id    AS kit_id,
          s.clave AS clave
        FROM src s
        JOIN all_kits k
          ON k.codigo = s.codigo
      ),
      inserted_claves AS (
        INSERT INTO public.kit_clave (kit_id, clave, aplica)
        SELECT
          swk.kit_id,
          swk.clave,
          true
        FROM src_with_kit swk
        RETURNING kit_id, clave
      )
      SELECT
        (SELECT count(*) FROM to_create)        AS kits_creados,
        (SELECT count(*) FROM codigos_a_modificar) AS kits_modificados,
        (SELECT count(*) FROM deleted_claves)   AS claves_borradas,
        (SELECT count(*) FROM inserted_claves)  AS claves_insertadas;
    `;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: res } = await client.query(sql, [JSON.stringify(rows)]);
      await client.query('COMMIT');

      return {
        ok: true,
        stats: res[0],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Error en bulkUpsertFromMatrix:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Carga masiva para UN solo kit:
   * - Crea el kit si no existe.
   * - Borra TODAS sus kit_clave.
   * - Inserta solo las nuevas claves (aplica = true).
   */
  async upsertSingleKit(payload: { codigo: string; claves: string[] }) {
    const codigoRaw = (payload.codigo || '').trim();
    const clavesRaw = (payload.claves || []).map(c => c.trim()).filter(Boolean);

    if (!codigoRaw || clavesRaw.length === 0) {
      return { ok: false, message: 'Código vacío o sin claves' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) asegurar kit (create si no existe)
      const sqlKit = `
        INSERT INTO public.kit (codigo, nombre)
        VALUES (upper(trim($1)), $1)
        ON CONFLICT ( (upper(codigo)) )
        DO UPDATE SET nombre = EXCLUDED.nombre
        RETURNING id, upper(trim(codigo)) AS codigo;
      `;
      const { rows: kitRows } = await client.query(sqlKit, [codigoRaw]);
      const kitId = kitRows[0].id as number;

      // 2) borrar claves actuales del kit
      const sqlDelete = `
        DELETE FROM public.kit_clave
        WHERE kit_id = $1;
      `;
      await client.query(sqlDelete, [kitId]);

      // 3) insertar nuevas claves
      const sqlInsert = `
        INSERT INTO public.kit_clave (kit_id, clave, aplica)
        SELECT $1, unnest($2::text[]), true
        RETURNING id;
      `;
      const { rowCount } = await client.query(sqlInsert, [kitId, clavesRaw]);

      await client.query('COMMIT');
      return {
        ok: true,
        kitId,
        codigo: kitRows[0].codigo,
        clavesInsertadas: rowCount || 0,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Error en upsertSingleKit:', err);
      throw err;
    } finally {
      client.release();
    }
  }
}
