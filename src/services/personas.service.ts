// src/services/personas.service.ts
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

    // Filtro por texto: nombre de persona, nombre de unidad o correo de persona
    const q = (opts.q ?? '').trim();
    if (q.length >= 2) {
      params.push(q.toLowerCase());
      const qParam = `$${idx}`;
      where += `
    AND (
      LOWER(p.nombre_completo) LIKE '%'||${qParam}||'%'
      OR LOWER(um.nombre)      LIKE '%'||${qParam}||'%'
      OR EXISTS (
        SELECT 1
          FROM persona_correo pc
         WHERE pc.persona_id = p.id
           AND LOWER(pc.correo) LIKE '%'||${qParam}||'%'
      )
    )`;
      idx++;
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
         pe.email_principal,
         pec.n_correos,
         COUNT(*) OVER() AS total
    FROM persona p
    LEFT JOIN unidad_medica um ON um.id = p.unidad_medica_id

    -- correo principal (el marcado es_principal, si no hay, toma el más nuevo por id)
    LEFT JOIN LATERAL (
      SELECT pc.correo AS email_principal
        FROM persona_correo pc
       WHERE pc.persona_id = p.id
       ORDER BY pc.es_principal DESC, pc.id DESC
       LIMIT 1
    ) pe ON TRUE

    -- conteo de correos
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n_correos
        FROM persona_correo pc2
       WHERE pc2.persona_id = p.id
    ) pec ON TRUE

   ${where}
   ORDER BY LOWER(p.nombre_completo) ASC
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

  async byId(id: number) {
    const p = await pool.query(`
    SELECT p.id, p.nombre_completo, p.unidad_medica_id, um.nombre AS unidad_medica
      FROM persona p
      LEFT JOIN unidad_medica um ON um.id = p.unidad_medica_id
     WHERE p.id = $1
  `, [id]);

    if (!p.rowCount) return null;

    const correos = await pool.query(`
    SELECT id, correo, es_principal
      FROM persona_correo
     WHERE persona_id = $1
     ORDER BY es_principal DESC, id DESC
  `, [id]);

    return { ...p.rows[0], correos: correos.rows };
  }

}
