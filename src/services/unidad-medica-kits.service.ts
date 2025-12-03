import { pool } from '../db/pool';
import { UnidadAsignadaRow } from '../models/UnidadAsignadaRow';

export default class UnidadMedicaKitsService {

  /** Unidades asignadas a un kit (para tu UI principal) */
  async getUnidadesByKit(kitId: number): Promise<UnidadAsignadaRow[]> {
    const sql = `
      SELECT
        um.id          AS unidad_medica_id,
        um.cluesimb,
        um.nombre      AS nombre
      FROM public.unidad_medica_kit umk
      JOIN public.unidad_medica um
        ON um.id = umk.unidad_medica_id
      WHERE umk.kit_id = $1
      ORDER BY um.cluesimb;
    `;
    const { rows } = await pool.query(sql, [kitId]);
    return rows as UnidadAsignadaRow[];
  }

  /**
   * Actualiza las unidades de un kit a partir de un arreglo de CLUESIMB.
   * - Limpia asignaciones anteriores del kit
   * - Inserta sólo las nuevas
   */
  async setUnidadesByKitUsingClues(kitId: number, cluesimbs: string[]): Promise<void> {
    const clean = (cluesimbs || [])
      .map(c => (c || '').trim().toUpperCase())
      .filter(c => c.length > 0);

    await pool.query('BEGIN');

    // 1) borrar asignaciones actuales del kit
    await pool.query(
      `DELETE FROM public.unidad_medica_kit WHERE kit_id = $1`,
      [kitId],
    );

    if (!clean.length) {
      await pool.query('COMMIT');
      return;
    }

    // 2) mapear cluesimb → unidad_medica.id
    const sqlUnidades = `
      SELECT id, cluesimb
      FROM public.unidad_medica
      WHERE UPPER(TRIM(cluesimb)) = ANY($1::text[]);
    `;
    const { rows: unidades } = await pool.query(sqlUnidades, [clean]);
    if (!unidades.length) {
      await pool.query('COMMIT');
      return;
    }

    // 3) insertar asignaciones
    const values: string[] = [];
    const params: any[] = [kitId];
    let idx = 2;
    for (const u of unidades) {
      values.push(`($1, $${idx}, 'admin_front')`);
      params.push(u.id);
      idx++;
    }

    const insertSql = `
      INSERT INTO public.unidad_medica_kit (kit_id, unidad_medica_id, fuente)
      VALUES ${values.join(', ')}
      ON CONFLICT (unidad_medica_id, kit_id) DO NOTHING;
    `;
    await pool.query(insertSql, params);

    await pool.query('COMMIT');
  }

  /** Endpoint espejo: kits asignados a una unidad (por id) */
  async getKitsByUnidad(unidadId: number) {
    const sql = `
      SELECT k.id, k.codigo, k.nombre
      FROM public.unidad_medica_kit umk
      JOIN public.kit k ON k.id = umk.kit_id
      WHERE umk.unidad_medica_id = $1
      ORDER BY k.codigo;
    `;
    const { rows } = await pool.query(sql, [unidadId]);
    return rows;
  }
}