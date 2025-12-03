import { pool } from '../db/pool';
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
}
