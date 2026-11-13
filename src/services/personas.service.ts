// src/services/personas.service.ts
import { pool } from '../db/pool';
import { CreatePayload } from '../models/CreatePayload';
import { PersonaLite } from '../models/persona.model';
import { UpdatePayload } from '../models/UpdatePayload';

const normEmail = (s: string) => String(s || '').trim();

function deduplicateEmails(emails: string[], excludeEmail?: string | null): string[] {
  const seen = new Set<string>();
  if (excludeEmail) {
    seen.add(excludeEmail.toLowerCase());
  }
  const result: string[] = [];
  for (const raw of emails) {
    const clean = normEmail(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

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
         COALESCE(NULLIF(TRIM(p.correo_principal), ''), NULLIF(TRIM(pe.email_principal), '')) AS email_principal,
         COALESCE(pec.n_correos, 0) AS n_correos,
         COUNT(*) OVER() AS total
    FROM persona p
    LEFT JOIN unidad_medica um ON um.id = p.unidad_medica_id
    LEFT JOIN LATERAL (
      SELECT pc.correo AS email_principal
        FROM persona_correo pc
       WHERE pc.persona_id = p.id
         AND pc.activo = TRUE
         AND pc.es_principal = TRUE
         AND NULLIF(TRIM(pc.correo), '') IS NOT NULL
       ORDER BY pc.id DESC
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
    SELECT p.id,
           p.nombre_completo,
           p.unidad_medica_id,
           um.nombre AS unidad_medica,
           COALESCE(NULLIF(TRIM(p.correo_principal), ''), NULLIF(TRIM(pe.email_principal), '')) AS correo
      FROM persona p
      LEFT JOIN unidad_medica um ON um.id = p.unidad_medica_id
      LEFT JOIN LATERAL (
        SELECT pc.correo AS email_principal
          FROM persona_correo pc
         WHERE pc.persona_id = p.id
           AND pc.activo = TRUE
           AND pc.es_principal = TRUE
           AND NULLIF(TRIM(pc.correo), '') IS NOT NULL
         ORDER BY pc.id DESC
         LIMIT 1
      ) pe ON TRUE
     WHERE p.id = $1 AND p.activo = TRUE
  `, [id]);

    if (!p.rowCount) return null;

    const correos = await pool.query(`
    SELECT id, correo, es_principal
      FROM persona_correo
     WHERE persona_id = $1 AND activo = TRUE
     ORDER BY es_principal DESC, id DESC
  `, [id]);

    const row = p.rows[0];
    const correoPrincipal = row.correo ?? null;

    return { ...row, correo: correoPrincipal, email_principal: correoPrincipal, correos: correos.rows };
  }

  // =============== CREATE ===============
  async create(payload: {
    nombre_completo: string;
    unidad_medica_id?: number | null;
    correo_principal?: string | null;
    correos_complementarios?: string[];
    correos?: string[];
  }): Promise<{ id: number }> {
    const hasLegacy = payload.correos !== undefined;
    const hasNew = payload.correo_principal !== undefined || payload.correos_complementarios !== undefined;
    if (hasLegacy && hasNew) {
      throw new Error('Payload ambiguo: no mezcles "correos" con "correo_principal" o "correos_complementarios".');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let correoPrincipal: string | null = null;
      let complementarios: string[] = [];

      if (hasLegacy) {
        const legacyList = deduplicateEmails(Array.isArray(payload.correos) ? payload.correos : []);
        correoPrincipal = legacyList[0] ?? null;
        complementarios = legacyList.slice(1);
      } else {
        correoPrincipal =
          payload.correo_principal !== undefined && payload.correo_principal !== null
            ? normEmail(payload.correo_principal) || null
            : null;
        complementarios = deduplicateEmails(
          Array.isArray(payload.correos_complementarios) ? payload.correos_complementarios : [],
          correoPrincipal
        );
      }

      const { rows } = await client.query(
        `INSERT INTO persona (nombre_completo, unidad_medica_id, correo_principal, activo, creado_en, actualizado_en)
         VALUES ($1, $2, $3, TRUE, NOW(), NOW())
         RETURNING id`,
        [payload.nombre_completo, payload.unidad_medica_id ?? null, correoPrincipal]
      );
      const personaId = Number(rows[0].id);

      for (const correo of complementarios) {
        await client.query(
          `INSERT INTO persona_correo (persona_id, correo, es_principal, activo)
           VALUES ($1, $2, FALSE, TRUE)`,
          [personaId, correo]
        );
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
    correo_principal?: string | null;
    correos_complementarios?: string[];
    correos?: string[]; // contrato heredado
  }): Promise<{ id: number }> {
    const hasLegacy = payload.correos !== undefined;
    const hasCorreoPrincipalField = payload.correo_principal !== undefined;
    const hasComplementariosField = payload.correos_complementarios !== undefined;
    if (hasLegacy && (hasCorreoPrincipalField || hasComplementariosField)) {
      throw new Error('Payload ambiguo: no mezcles "correos" con "correo_principal" o "correos_complementarios".');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Asegura que persona esté activa
      const chk = await client.query(`SELECT id, correo_principal FROM persona WHERE id=$1 AND activo=TRUE`, [id]);
      if (!chk.rowCount) throw new Error('Persona no encontrada o inactiva.');

      const hasCorreosArray = Array.isArray(payload.correos);
      const legacyIncoming = hasCorreosArray
        ? deduplicateEmails(payload.correos!)
        : [];

      let shouldUpdateCorreoPrincipal = false;
      let nextCorreoPrincipal: string | null = null;

      if (hasCorreoPrincipalField) {
        shouldUpdateCorreoPrincipal = true;
        nextCorreoPrincipal =
          payload.correo_principal !== null ? normEmail(payload.correo_principal) || null : null;
      } else if (hasCorreosArray) {
        shouldUpdateCorreoPrincipal = true;
        nextCorreoPrincipal = legacyIncoming[0] ?? null;
      }

      // Actualiza datos básicos si vienen (distinguiendo explícitamente omisión vs NULL)
      if (
        payload.nombre_completo != null ||
        payload.unidad_medica_id !== undefined ||
        shouldUpdateCorreoPrincipal
      ) {
        await client.query(
          `UPDATE persona
              SET nombre_completo = COALESCE($2, nombre_completo),
                  unidad_medica_id = CASE WHEN $4::boolean THEN $3::integer ELSE unidad_medica_id END,
                  correo_principal = CASE WHEN $6::boolean THEN $5::text ELSE correo_principal END,
                  actualizado_en = NOW()
            WHERE id = $1`,
          [
            id,
            payload.nombre_completo ?? null,
            payload.unidad_medica_id ?? null,
            payload.unidad_medica_id !== undefined,
            nextCorreoPrincipal,
            shouldUpdateCorreoPrincipal
          ]
        );
      }

      // Contrato nuevo: manejo explícito de correo_principal sin tocar los complementarios si no se enviaron
      if (hasCorreoPrincipalField) {
        if (nextCorreoPrincipal === null) {
          await client.query(
            `UPDATE persona_correo
                SET activo = FALSE,
                    es_principal = FALSE
              WHERE persona_id = $1
                AND es_principal = TRUE`,
            [id]
          );
        } else {
          await client.query(
            `UPDATE persona_correo
                SET es_principal = FALSE
              WHERE persona_id = $1
                AND es_principal = TRUE
                AND lower(correo) <> $2`,
            [id, nextCorreoPrincipal.toLowerCase()]
          );
        }
      }

      // Contrato nuevo: sincronía exclusiva de correos_complementarios sin alterar persona.correo_principal
      if (hasComplementariosField && Array.isArray(payload.correos_complementarios)) {
        const effectivePrincipal = shouldUpdateCorreoPrincipal
          ? nextCorreoPrincipal
          : (chk.rows[0]?.correo_principal ? normEmail(chk.rows[0].correo_principal) || null : null);

        const complementarios = deduplicateEmails(payload.correos_complementarios, effectivePrincipal);

        await client.query(
          `UPDATE persona_correo
              SET activo = FALSE,
                  es_principal = FALSE
            WHERE persona_id = $1
              AND (activo = TRUE OR es_principal = TRUE)
              AND lower(correo) <> ALL ($2::text[])`,
          [id, complementarios.map(c => c.toLowerCase())]
        );

        for (const correo of complementarios) {
          const upd = await client.query(
            `UPDATE persona_correo
                SET activo = TRUE,
                    es_principal = FALSE
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
      }

      // Contrato heredado: sincronía completa mediante arreglo `correos`
      if (hasCorreosArray) {
        await client.query(
          `UPDATE persona_correo
              SET activo = FALSE,
                  es_principal = FALSE
            WHERE persona_id = $1
              AND (activo = TRUE OR es_principal = TRUE)
              AND lower(correo) <> ALL ($2::text[])`,
          [id, legacyIncoming.map(c => c.toLowerCase())]
        );

        await client.query(
          `UPDATE persona_correo
              SET es_principal = FALSE
            WHERE persona_id = $1
              AND es_principal = TRUE`,
          [id]
        );

        for (const correo of legacyIncoming) {
          const upd = await client.query(
            `UPDATE persona_correo
                SET activo = TRUE,
                    es_principal = FALSE
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

        if (legacyIncoming.length) {
          await client.query(
            `UPDATE persona_correo
                SET es_principal = TRUE
              WHERE persona_id = $1 AND lower(correo) = $2`,
            [id, legacyIncoming[0].toLowerCase()]
          );
        }
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
                actualizado_en = NOW()
          WHERE id = $1`,
        [id]
      );

      await client.query(
        `UPDATE persona_correo
            SET activo = FALSE,
                es_principal = FALSE
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
