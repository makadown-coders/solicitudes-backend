import { pool } from '../db/pool';  
import { PersonaLite } from '../models/persona.model';

export default class PersonasService {
  async listPaged(opts: {
    q?: string | null;
    unidad_medica_id?: number | null;
    page: number;
    pageSize: number;
  }): Promise<{ items: PersonaLite[]; page: number; pageSize: number; total: number }> {
    const pageSize = Math.min(Math.max(Number(opts.pageSize || 20), 1), 100);
    const page = Math.max(Number(opts.page || 1), 1);
    const offset = (page - 1) * pageSize;

    const params: any[] = [];
    let idx = 1;

    let where = 'WHERE 1=1';
    if (opts.q?.trim()) {
      params.push(opts.q.trim());
      // si tienes EXTENSION unaccent, cambia a: unaccent(p.nombre_completo) ILIKE '%'||unaccent($idx)||'%'
      where += ` AND p.nombre_completo ILIKE '%'||$${idx++}||'%'`;
    }
    if (opts.unidad_medica_id) {
      params.push(opts.unidad_medica_id);
      where += ` AND p.unidad_medica_id = $${idx++}`;
    }

    const sql = `
      SELECT p.id,
             p.nombre_completo,
             p.unidad_medica_id,
             um.nombre AS unidad_medica,
             COUNT(*) OVER() AS total
        FROM persona p
        LEFT JOIN unidad_medica um ON um.id = p.unidad_medica_id
       ${where}
       ORDER BY p.nombre_completo ASC
       LIMIT ${pageSize} OFFSET ${offset}
    `;

    const { rows } = await pool.query(sql, params);
    const total = rows.length ? Number(rows[0].total) : 0;
    const items: PersonaLite[] = rows.map(r => ({
      id: r.id,
      nombre_completo: r.nombre_completo,
      unidad_medica_id: r.unidad_medica_id,
      unidad_medica: r.unidad_medica,
    }));
    return { items, page, pageSize, total };
  }
}