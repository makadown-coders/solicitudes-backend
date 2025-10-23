
// src/services/dispositivos.service.ts
import { pool } from '../db/pool';
import { Dispositivo, DispositivoRow, DispositivoRowEx } from '../models/dispositivo.model';

export default class DispositivosService {
  async list(opts: {
    unidad_medica_id?: number | null;
    tipo_dispositivo_id?: number | null;
    q?: string | null;
    limit: number; offset: number;
  }): Promise<DispositivoRow[]> {
    const { unidad_medica_id, tipo_dispositivo_id, q, limit, offset } = opts;
    const peticion = `SELECT d.id, d.serial, d.marca, d.modelo, d.ip, d.conexion,
              td.nombre AS tipo, um.id AS unidad_medica_id, um.nombre AS unidad_medica
         FROM dispositivo d
         JOIN tipo_dispositivo td ON td.id = d.tipo_dispositivo_id
         JOIN unidad_medica um    ON um.id = d.unidad_medica_id
        WHERE ($1::int IS NULL OR d.unidad_medica_id=$1)
          AND ($2::int IS NULL OR d.tipo_dispositivo_id=$2)
          AND ($3::text IS NULL OR (d.serial ILIKE '%'||$3||'%' OR d.modelo ILIKE '%'||$3||'%'))
        ORDER BY d.id DESC LIMIT $4 OFFSET $5`;

    /*console.log(peticion,
      [unidad_medica_id ?? null, tipo_dispositivo_id ?? null, q ?? null, limit, offset]
    );*/
    const { rows } = await pool.query(peticion,
      [unidad_medica_id ?? null, tipo_dispositivo_id ?? null, q ?? null, limit, offset]
    );
    return rows;
  }

  /**
   * Paginación en servidor + filtros + última asignación por dispositivo
   * Regresa items + total (COUNT() OVER la consulta filtrada)
   */
  async listPaged(opts: {
    unidad_medica_id?: number | null;
    tipo_dispositivo_id?: number | null;
    estado_dispositivo_id?: number | null;
    q?: string | null;
    page: number;
    pageSize: number;
  }): Promise<{ items: DispositivoRowEx[]; page: number; pageSize: number; total: number; }> {
    const pageSize = Math.min(Math.max(Number(opts.pageSize || 20), 1), 100);
    const page = Math.max(Number(opts.page || 1), 1);
    const offset = (page - 1) * pageSize;

    const sql = `
      WITH base AS (
      SELECT d.id, d.serial, d.marca, d.modelo, d.ip, d.conexion,
             td.nombre AS tipo, um.id AS unidad_medica_id, um.nombre AS unidad_medica
        FROM dispositivo d
        JOIN tipo_dispositivo td ON td.id = d.tipo_dispositivo_id
        JOIN unidad_medica um    ON um.id = d.unidad_medica_id
       WHERE ($1::int  IS NULL OR d.unidad_medica_id = $1)
         AND ($2::int  IS NULL OR d.tipo_dispositivo_id = $2)
    ),
    ult_asig AS (
      SELECT a.*,
             ROW_NUMBER() OVER (
               PARTITION BY a.dispositivo_id
               ORDER BY (a.fecha_retiro IS NULL) DESC, a.fecha_asignacion DESC, a.id DESC
             ) AS rn
        FROM asignacion_dispositivo a
    ),
    filtrado AS (
      SELECT b.*,
             ua.id  AS asignacion_dispositivo_id,
             ua.persona_id,
             p.nombre_completo AS persona_nombre_completo,
             ua.lugar_especifico,
             ua.estado_dispositivo_id,
             ua.fecha_asignacion,
             ua.fecha_retiro,
             ed.nombre AS estado_dispositivo
        FROM base b
        LEFT JOIN ult_asig ua ON ua.dispositivo_id = b.id AND ua.rn = 1
        LEFT JOIN persona p   ON p.id = ua.persona_id
        LEFT JOIN estado_dispositivo ed ON ed.id = ua.estado_dispositivo_id
    ),
    filtrado2 AS (
      SELECT *
        FROM filtrado
       WHERE ($3::text IS NULL OR (
              serial                ILIKE '%'||$3||'%' OR
              marca                 ILIKE '%'||$3||'%' OR
              modelo                ILIKE '%'||$3||'%' OR
              unidad_medica         ILIKE '%'||$3||'%' OR
              persona_nombre_completo ILIKE '%'||$3||'%' OR
              lugar_especifico      ILIKE '%'||$3||'%' OR
              EXISTS (
                SELECT 1 FROM dispositivo_nic n
                  WHERE n.dispositivo_id = filtrado.id
                    AND n.mac ILIKE '%'||$3||'%'
                    OR n.mac_norm ILIKE '%'||regexp_replace($3, '[^0-9A-Fa-f]', '', 'g')||'%'
              )
       ))
         AND ($4::int IS NULL OR estado_dispositivo_id = $4) 
    )
    SELECT f2.*, COUNT(*) OVER() AS total
      FROM filtrado2 f2
     ORDER BY f2.id DESC
     LIMIT $5 OFFSET $6
    `;

    const params = [
      opts.unidad_medica_id ?? null,
      opts.tipo_dispositivo_id ?? null,
      (opts.q ?? '').trim() || null,
      opts.estado_dispositivo_id ?? null,
      pageSize,
      offset
    ];
    //console.log('/**********************************************************************************/');
    //console.log(sql, params);
    //console.log('/**********************************************************************************/');
    const { rows } = await pool.query(sql, params);
    const total = rows.length ? Number(rows[0].total) : 0;
    const items: DispositivoRowEx[] = rows.map(({ total, ...r }) => r as DispositivoRowEx);
    return { items, page, pageSize, total };
  }

  async create(payload: Dispositivo) {
    const { unidad_medica_id, tipo_dispositivo_id, ip, conexion, serial, marca, modelo, observaciones } = payload;
    const { rows } = await pool.query(
      `INSERT INTO dispositivo
        (unidad_medica_id, tipo_dispositivo_id, ip, conexion, serial, marca, modelo, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [unidad_medica_id ?? null, tipo_dispositivo_id, ip ?? null, conexion ?? null,
      serial ?? null, marca ?? null, modelo ?? null, observaciones ?? null]
    );
    return rows[0];
  }

  /**
   * OBTIENE DATO DE DISPOSITIVO + MONITORES + PERIFÉRICOS + ASIGNACIÓN ACTUAL   * 
   * @param id 
   * @returns 
   */
  async byId(id: number) {
    const dev = await pool.query(`SELECT * FROM dispositivo WHERE id=$1`, [id]);
    if (!dev.rowCount) return null;

    const nics = await pool.query(`
    SELECT id, iface_name, kind, mac, mac_norm, en_uso, creado_en
      FROM dispositivo_nic
     WHERE dispositivo_id=$1
     ORDER BY en_uso DESC, id
  `, [id]);
    const mon = await pool.query(`SELECT * FROM monitor WHERE dispositivo_id=$1 ORDER BY id`, [id]);
    // const per = await pool.query(`SELECT * FROM periferico WHERE dispositivo_id=$1 ORDER BY id`, [id]);
    const per = await pool.query(`
  SELECT p.id, 
         p.serial, p.marca, p.modelo,
         t.nombre AS tipo, p.tipo_id
    FROM periferico p
    JOIN cat_periferico_tipo t ON t.id = p.tipo_id
   WHERE p.dispositivo_id=$1
   ORDER BY p.id`, [id]);

    const asig = await pool.query(`
      SELECT a.*, p.nombre_completo, ed.nombre AS estado_nombre
        FROM asignacion_dispositivo a
        LEFT JOIN persona p ON p.id = a.persona_id
        LEFT JOIN estado_dispositivo ed ON ed.id = a.estado_dispositivo_id
       WHERE a.dispositivo_id=$1
       ORDER BY (a.fecha_retiro IS NULL) DESC, a.fecha_asignacion DESC, a.id DESC
       LIMIT 1
    `, [id]);

    return {
      ...dev.rows[0],
      nics: nics.rows,
      monitores: mon.rows,
      perifericos: per.rows,
      asignacion_actual: asig.rowCount ? asig.rows[0] : null
    };
    // return { ...dev.rows[0], monitores: mon.rows, perifericos: per.rows };
  }

  // ========= UPDATE BÁSICO =========
  async updateBasic(payload: {
    id: number;
    ip?: string | null;
    conexion?: string | null;
    observaciones?: string | null;
    serial?: string | null;
    marca?: string | null;
    modelo?: string | null;
    nics?: any;
  }) {
    const norm = (s: string) => (s || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
    const { id, ip, conexion, observaciones, serial, marca, modelo, nics } = payload;
    const desired = Array.isArray(nics)
      ? nics
        .map((m: any) => ({
          id: m?.id ?? null,
          mac: String(m?.mac ?? '').trim(),
          mac_norm: norm(String(m?.mac ?? '')),
          iface_name: m?.iface_name ?? null,
          kind: m?.kind ?? 'ethernet',
          en_uso: !!m?.en_uso
        }))
        .filter(m => m.mac_norm.length === 12) // 12 hex dígitos
      : [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) Actualiza campos del dispositivo (solo los enviados)
      await client.query(`
      UPDATE dispositivo
         SET ip = COALESCE($2, ip),
             conexion = COALESCE($3, conexion),
             observaciones = COALESCE($4, observaciones),
             serial = COALESCE($5, serial),
             marca = COALESCE($6, marca),
             modelo = COALESCE($7, modelo)
       WHERE id = $1
    `, [id, ip ?? null, conexion ?? null, observaciones ?? null, serial ?? null, marca ?? null, modelo ?? null]);

      // 2) Si vinieron NICs: sincroniza (reemplazo declarativo)
      if (Array.isArray(nics)) {
        // lee actuales
        const cur = await client.query(
          `SELECT id, mac_norm FROM dispositivo_nic WHERE dispositivo_id=$1`,
          [id]
        );
        const currentById = new Map<number, string>(cur.rows.map((r: any) => [r.id, r.mac_norm]));
        const currentByNorm = new Map<string, number>(cur.rows.map((r: any) => [r.mac_norm, r.id]));

        const incomingIds = new Set<number>();
        const incomingNorms = new Set<string>();

        // a) upserts por id (si lo traen) o por mac_norm (si no traen id)
        for (const d of desired) {
          if (d.id && currentById.has(d.id)) {
            incomingIds.add(d.id);
            await client.query(
              `UPDATE dispositivo_nic
                SET mac=$2, iface_name=$3, kind=$4, en_uso=$5
              WHERE id=$1`,
              [d.id, d.mac, d.iface_name, d.kind, d.en_uso]
            );
          } else {
            const maybeId = currentByNorm.get(d.mac_norm);
            if (maybeId) {
              incomingIds.add(maybeId);
              await client.query(
                `UPDATE dispositivo_nic
                  SET mac=$2, iface_name=$3, kind=$4, en_uso=$5
                WHERE id=$1`,
                [maybeId, d.mac, d.iface_name, d.kind, d.en_uso]
              );
            } else {
              const ins = await client.query(
                `INSERT INTO dispositivo_nic(dispositivo_id, mac, iface_name, kind, en_uso)
               VALUES($1,$2,$3,$4,$5) RETURNING id, mac_norm`,
                [id, d.mac, d.iface_name, d.kind, d.en_uso]
              );
              incomingIds.add(ins.rows[0].id);
              incomingNorms.add(ins.rows[0].mac_norm);
            }
          }
        }

        // b) elimina las que ya no vinieron (modo "replace")
        if (cur.rowCount) {
          const toDelete: number[] = [];
          for (const [cid] of currentById) {
            if (!incomingIds.has(cid)) toDelete.push(cid);
          }
          if (toDelete.length) {
            await client.query(
              `DELETE FROM dispositivo_nic WHERE dispositivo_id=$1 AND id = ANY($2::bigint[])`,
              [id, toDelete]
            );
          }
        }
      }

      await client.query('COMMIT');
      return { ok: true, id };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ========= CAMBIAR ASIGNACIÓN (cierra la activa e inserta una nueva) =========
  async changeAssignment(payload: {
    dispositivo_id: number;
    unidad_medica_id?: number | null;
    persona_id?: number | null;
    lugar_especifico?: string | null;
    estado_dispositivo_id?: number | null;
    fecha_asignacion?: string | null; // ISO
  }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // (opcional) mover el dispositivo de unidad si viene
      if (payload.unidad_medica_id) {
        await client.query(
          `UPDATE dispositivo SET unidad_medica_id=$2
         WHERE id=$1`,
          [payload.dispositivo_id, payload.unidad_medica_id]
        );
      }

      // Cerrar la asignación anterior (si existe activa)
      await client.query(`
        UPDATE asignacion_dispositivo
           SET fecha_retiro = NOW()
         WHERE dispositivo_id=$1 AND fecha_retiro IS NULL
      `, [payload.dispositivo_id]);

      // Insertar nueva
      const { rows } = await client.query(
        `INSERT INTO asignacion_dispositivo
           (dispositivo_id, persona_id, lugar_especifico, estado_dispositivo_id, fecha_asignacion)
         VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, NOW()))
         RETURNING id`,
        [
          payload.dispositivo_id,
          payload.persona_id ?? null,
          payload.lugar_especifico ?? null,
          payload.estado_dispositivo_id ?? null,
          payload.fecha_asignacion ?? null
        ]
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ========= MONITORES =========
  async addMonitor(payload: {
    dispositivo_id: number;
    serial?: string | null;
    marca?: string | null;
    modelo?: string | null;
    es_principal?: boolean;
  }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (payload.es_principal) {
        await client.query(`UPDATE monitor SET es_principal=false WHERE dispositivo_id=$1`, [payload.dispositivo_id]);
      }

      const { rows } = await client.query(
        `INSERT INTO monitor (dispositivo_id, serial, marca, modelo, es_principal)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [payload.dispositivo_id, payload.serial ?? null, payload.marca ?? null, payload.modelo ?? null, !!payload.es_principal]
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }
  }

  async updateMonitor(payload: {
    id: number; dispositivo_id: number;
    serial?: string | null; marca?: string | null; modelo?: string | null; es_principal?: boolean;
  }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (payload.es_principal === true) {
        await client.query(`UPDATE monitor SET es_principal=false WHERE dispositivo_id=$1`, [payload.dispositivo_id]);
      }

      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;
      const push = (col: string, val: any) => { fields.push(`${col}=$${idx++}`); values.push(val); };

      if (payload.serial !== undefined) push('serial', payload.serial);
      if (payload.marca !== undefined) push('marca', payload.marca);
      if (payload.modelo !== undefined) push('modelo', payload.modelo);
      if (payload.es_principal !== undefined) push('es_principal', !!payload.es_principal);

      if (!fields.length) {
        await client.query('COMMIT');
        return { id: payload.id };
      }

      const sql = `UPDATE monitor SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${idx} AND dispositivo_id=$${idx + 1} RETURNING id`;
      values.push(payload.id, payload.dispositivo_id);

      const { rows } = await client.query(sql, values);
      await client.query('COMMIT');
      return rows[0];
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }
  }

  async deleteMonitor(dispositivoId: number, monitorId: number) {
    await pool.query(
      'DELETE FROM monitor WHERE dispositivo_id=$1 AND id=$2',
      [dispositivoId, monitorId]
    );
    return { ok: true };
  }

  // ========= PERIFÉRICOS =========
  async addPeriferico(payload: {
    dispositivo_id: number;
    tipo_id: number;
    serial?: string | null; marca?: string | null; modelo?: string | null;
  }) {
    const { rows } = await pool.query(
      `INSERT INTO periferico (dispositivo_id, tipo_id, serial, marca, modelo)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [payload.dispositivo_id, payload.tipo_id, payload.serial ?? null, payload.marca ?? null, payload.modelo ?? null]
    );
    return rows[0];
  }

  async updatePeriferico(payload: {
    id: number; dispositivo_id: number;
    tipo_id?: number | null;
    serial?: string | null;
    marca?: string | null;
    modelo?: string | null;
  }) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const push = (col: string, val: any) => { fields.push(`${col}=$${idx++}`); values.push(val); };

    if (payload.tipo_id !== undefined) push('tipo_id', payload.tipo_id);
    if (payload.serial !== undefined) push('serial', payload.serial);
    if (payload.marca !== undefined) push('marca', payload.marca);
    if (payload.modelo !== undefined) push('modelo', payload.modelo);

    if (!fields.length) return { id: payload.id };

    const sql = `UPDATE periferico SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${idx} AND dispositivo_id=$${idx + 1} RETURNING id`;
    values.push(payload.id, payload.dispositivo_id);

    const { rows } = await pool.query(sql, values);
    return rows[0];
  }

  async deletePeriferico(dispositivoId: number, perifericoId: number) {
    await pool.query(
      'DELETE FROM periferico WHERE dispositivo_id=$1 AND id=$2',
      [dispositivoId, perifericoId]
    );
    return { ok: true };
  }

}