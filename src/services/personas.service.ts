// src/services/personas.service.ts
import { pool } from '../db/pool';
import { CreatePayload } from '../models/CreatePayload';
import { PersonaLite } from '../models/persona.model';
import { UpdatePayload } from '../models/UpdatePayload';

const normEmail = (s: string) => String(s || '').trim();

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

    // SOLO ACTIVOS
    let where = 'WHERE p.activo = TRUE';

    // Filtro por texto: nombre de persona, nombre de unidad o correo de persona
    const q = (opts.q ?? '').trim();
    if (q.length >= 2) {
      params.push(q.toLowerCase());
      const qParam = `$${idx++}`;
      where += `
    AND (
      LOWER(p.nombre_completo) LIKE '%'||${qParam}||'%' OR
      LOWER(um.nombre)         LIKE '%'||${qParam}||'%' OR
      LOWER(COALESCE(p.correo_principal, '')) LIKE '%'||${qParam}||'%' OR
      EXISTS (
        SELECT 1
          FROM persona_correo pc
         WHERE pc.persona_id = p.id
           AND pc.activo = TRUE
           AND LOWER(pc.correo) LIKE '%'||${qParam}||'%'
      )
    )`;
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
         COALESCE(p.correo_principal, pe.email_principal) AS email_principal,
         COALESCE(pec.n_correos, 0) AS n_correos,
         COUNT(*) OVER() AS total
    FROM persona p
    LEFT JOIN unidad_medica um ON um.id = p.unidad_medica_id
    LEFT JOIN LATERAL (
      SELECT pc.correo AS email_principal
        FROM persona_correo pc
       WHERE pc.persona_id = p.id AND pc.activo = TRUE
       ORDER BY pc.es_principal DESC, pc.id DESC
       LIMIT 1
    ) pe ON TRUE   
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n_correos
        FROM persona_correo pc2
       WHERE pc2.persona_id = p.id AND pc2.activo = TRUE
    ) pec ON TRUE
   ${where}
   ORDER BY LOWER(p.nombre_completo) ASC, p.id ASC
   LIMIT ${pageSize} OFFSET ${offset}
`;

    const { rows } = await pool.query(sql, params);
    const total = rows.length ? Number(rows[0].total) : 0;
    const items: PersonaLite[] = rows.map(r => ({
      id: r.id,
      nombre_completo: r.nombre_completo,
      unidad_medica_id: r.unidad_medica_id,
      unidad_medica: r.unidad_medica,
      email_principal: r.email_principal ?? null,
      n_correos: r.n_correos ?? 0,
    }));
    return { items, page, pageSize, total };
  }

  async byId(id: number) {
    const p = await pool.query(`
    SELECT p.id, p.nombre_completo, p.unidad_medica_id, um.nombre AS unidad_medica
      FROM persona p
      LEFT JOIN unidad_medica um ON um.id = p.unidad_medica_id
     WHERE p.id = $1 AND p.activo = TRUE
  `, [id]);

    if (!p.rowCount) return null;

    const correos = await pool.query(`
    SELECT id, correo, es_principal
      FROM persona_correo
     WHERE persona_id = $1 AND activo = TRUE
     ORDER BY es_principal DESC, id DESC
  `, [id]);

    return { ...p.rows[0], correos: correos.rows };
  }

  // =============== CREATE ===============
  async create(payload: {
    nombre_completo: string;
    unidad_medica_id?: number | null;
    correos?: string[];        // el primero será principal si no especificas más reglas
  }): Promise<{ id: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO persona (nombre_completo, unidad_medica_id, activo, created_at, updated_at)
         VALUES ($1, $2, TRUE, NOW(), NOW())
         RETURNING id`,
        [payload.nombre_completo, payload.unidad_medica_id ?? null]
      );
      const personaId = Number(rows[0].id);

      const correos = Array.isArray(payload.correos)
        ? payload.correos.map(c => String(c).trim()).filter(Boolean)
        : [];

      if (correos.length) {
        for (let i = 0; i < correos.length; i++) {
          await client.query(
            `INSERT INTO persona_correo (persona_id, correo, es_principal, activo)
             VALUES ($1, $2, $3, TRUE)`,
            [personaId, correos[i], i === 0]  // primero = principal
          );
        }
        // la función/trigger actualizará persona.correo_principal
      }

      await client.query('COMMIT');
      return { id: personaId };
    } catch (e: any) {
      await client.query('ROLLBACK');
      // mensaje amigable ante colisión de correo activo
      if ((e?.message || '').toLowerCase().includes('uq_persona_correo_ci_active')) {
        throw new Error('El correo ya está siendo usado por otra persona activa.');
      }
      throw e;
    } finally {
      client.release();
    }
  }

  // =============== UPDATE (incluye sync de correos) ===============
  async update(id: number, payload: {
    nombre_completo?: string;
    unidad_medica_id?: number | null;
    correos?: string[]; // lista completa deseada (ACTIVOS). Los no incluidos se desactivan (soft-delete).
  }): Promise<{ id: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Asegura que persona esté activa (si quieres permitir actualizar inactivos, quita esta cláusula)
      const chk = await client.query(`SELECT id FROM persona WHERE id=$1 AND activo=TRUE`, [id]);
      if (!chk.rowCount) throw new Error('Persona no encontrada o inactiva.');

      // Actualiza datos básicos si vienen
      if (payload.nombre_completo != null || payload.unidad_medica_id !== undefined) {
        await client.query(
          `UPDATE persona
              SET nombre_completo = COALESCE($2, nombre_completo),
                  unidad_medica_id = $3,
                  updated_at = NOW()
            WHERE id = $1`,
          [id, payload.nombre_completo ?? null, payload.unidad_medica_id ?? null]
        );
      }

      // Sincronía de correos activos (si se envía la lista)
      if (Array.isArray(payload.correos)) {
        const incoming = payload.correos.map(c => String(c).trim()).filter(Boolean);

        // a) desactivar los que ya no están en la lista entrante
        await client.query(
          `UPDATE persona_correo
              SET activo = FALSE
            WHERE persona_id = $1
              AND activo = TRUE
              AND lower(correo) <> ALL ($2::text[])`,
          [id, incoming.map(c => c.toLowerCase())]
        );

        // b) upsert de los entrantes (reactiva si existían inactivos)
        for (let i = 0; i < incoming.length; i++) {
          const correo = incoming[i];
          // intenta reactivar
          const upd = await client.query(
            `UPDATE persona_correo
                SET activo = TRUE,
                    es_principal = es_principal -- lo ajustamos luego
              WHERE persona_id = $1 AND lower(correo) = $2
            RETURNING id`,
            [id, correo.toLowerCase()]
          );
          if (!upd.rowCount) {
            await client.query(
              `INSERT INTO persona_correo (persona_id, correo, es_principal, activo)
               VALUES ($1, $2, FALSE, TRUE)`,
              [id, correo]
            );
          }
        }

        // c) fija principal = primer correo de la lista (si hay lista)
        await client.query(
          `UPDATE persona_correo SET es_principal = FALSE WHERE persona_id = $1 AND activo = TRUE`,
          [id]
        );
        if (incoming.length) {
          await client.query(
            `UPDATE persona_correo
                SET es_principal = TRUE
              WHERE persona_id = $1 AND lower(correo) = $2`,
            [id, incoming[0].toLowerCase()]
          );
        }
        // trigger actualiza persona.correo_principal
      }

      await client.query('COMMIT');
      return { id };
    } catch (e: any) {
      await client.query('ROLLBACK');
      if ((e?.message || '').toLowerCase().includes('uq_persona_correo_ci_active')) {
        throw new Error('El correo ya está siendo usado por otra persona activa.');
      }
      if ((e?.message || '').toLowerCase().includes('uq_persona_correo_1principal_active')) {
        throw new Error('Solo puede existir un correo principal activo por persona.');
      }
      throw e;
    } finally {
      client.release();
    }
  }

  // =============== SOFT DELETE ===============
  async softDelete(id: number): Promise<{ ok: boolean }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      /* Valida que no tenga asignaciones activas*/

      const asign = await client.query(
        `SELECT 1 FROM asignacion_dispositivo WHERE persona_id=$1 AND fecha_retiro IS NULL LIMIT 1`, [id]
      );
      if (asign.rowCount) throw new Error('No se puede eliminar: persona con equipo asignado.');

      await client.query(
        `UPDATE persona
            SET activo = FALSE,
                fecha_baja = NOW(),
                correo_principal = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [id]
      );

      await client.query(
        `UPDATE persona_correo
            SET activo = FALSE
          WHERE persona_id = $1`,
        [id]
      );

      await client.query('COMMIT');
      return { ok: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

}
