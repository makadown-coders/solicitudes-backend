// src/services/kits-claves.service.ts
import { pool } from '../db/pool';
import { KitClaveRow } from '../models/KitClaveRow';

export default class KitsClavesService {
  async listByKit(kitId: number): Promise<KitClaveRow[]> {
    const sql = `
      SELECT id, kit_id, clave, aplica
      FROM public.kit_clave
      WHERE kit_id = $1
      ORDER BY clave;
    `;
    const { rows } = await pool.query(sql, [kitId]);
    return rows as KitClaveRow[];
  }

  async listByCodigo(codigo: string): Promise<KitClaveRow[]> {
    const sql = `
      SELECT kc.id, kc.kit_id, kc.clave, kc.aplica
      FROM public.kit_clave kc
      JOIN public.kit k ON k.id = kc.kit_id
      WHERE k.codigo = $1
      ORDER BY kc.clave;
    `;
    const { rows } = await pool.query(sql, [codigo]);
    return rows as KitClaveRow[];
  }

  async addClave(kitId: number, clave: string, aplica = true): Promise<KitClaveRow> {
    const sql = `
      INSERT INTO public.kit_clave (kit_id, clave, aplica)
      VALUES ($1, UPPER(TRIM($2)), $3)
      RETURNING id, kit_id, clave, aplica;
    `;
    const { rows } = await pool.query(sql, [kitId, clave, aplica]);
    return rows[0] as KitClaveRow;
  }

  async deleteClave(id: number): Promise<boolean> {
    const sql = `DELETE FROM public.kit_clave WHERE id = $1`;
    const { rowCount } = await pool.query(sql, [id]);
    return (rowCount ?? 0) > 0;
  }
}