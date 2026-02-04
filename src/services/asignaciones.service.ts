// src/services/asignaciones.service.ts
import { pool } from '../db/pool';
import { Asignacion } from '../models/asignacion.model';

export default class AsignacionesService {
  async historialPorDispositivo(id: number) {
    const { rows } = await pool.query(
      `SELECT a.*, e.nombre AS estado
         FROM asignacion_dispositivo a
         JOIN estado_dispositivo e ON e.id=a.estado_dispositivo_id
        WHERE a.dispositivo_id=$1
        ORDER BY a.fecha_asignacion DESC`, [id]
    );
    return rows;
  }

  /**
   * Historial paginado (bitácora) con LEAD() para calcular 'hasta'
   * GET /api/dispositivos/:id/asignaciones?from=&to=&page=&pageSize=
   */
  async historialPorDispositivoPaged(opts: {
    dispositivo_id: number;
    from: string | null; // ISO
    to: string | null;   // ISO
    page: number;
    pageSize: number;
  }) {
    const pageSize = Math.min(Math.max(Number(opts.pageSize ?? 10), 1), 100);
    const page = Math.max(Number(opts.page ?? 1), 1);
    const offset = (page - 1) * pageSize;

    const values: any[] = [opts.dispositivo_id];
    const where: string[] = ['a.dispositivo_id = $1'];

    if (opts.from) { values.push(opts.from); where.push(`a.fecha_asignacion >= $${values.length}`); }
    if (opts.to) { values.push(opts.to); where.push(`a.fecha_asignacion <= $${values.length}`); }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalSql = `
      SELECT COUNT(*)::int AS total
      FROM asignacion_dispositivo a
      ${whereSql}
    `;
    const totalRes = await pool.query(totalSql, values);
    const total = totalRes.rows?.[0]?.total ?? 0;

    // Tu query base (con LEAD) + paginación
    const itemsSql = `
      WITH base AS (
        SELECT
          a.id,
          a.dispositivo_id,
          d.tipo_dispositivo_id,
          td.nombre as tipo_dispositivo,
          d.serial,
          d.marca,
          d.modelo,
          a.fecha_asignacion AS desde,
          LEAD(a.fecha_asignacion) OVER (PARTITION BY a.dispositivo_id ORDER BY a.fecha_asignacion, a.id) AS hasta,
          d.unidad_medica_id,
          um.nombre AS unidad_medica,
          a.persona_id,
          p.nombre_completo AS persona,
          a.lugar_especifico,
          a.estado_dispositivo_id,
          ed.nombre AS estado_dispositivo,
          a.observaciones,
          a.creado_por,
          a.fecha_retiro
        FROM asignacion_dispositivo a
        LEFT JOIN dispositivo d on d.id = a.dispositivo_id 
        LEFT JOIN tipo_dispositivo td on td.id = d.tipo_dispositivo_id 
        LEFT JOIN unidad_medica um ON um.id = d.unidad_medica_id 
        LEFT JOIN persona p ON p.id = a.persona_id
        LEFT JOIN estado_dispositivo ed ON ed.id = a.estado_dispositivo_id
        ${whereSql}
      )
      SELECT *
      FROM base
      ORDER BY desde DESC, id DESC
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `;
    const { rows } = await pool.query(itemsSql, [...values, pageSize, offset]);

    return { items: rows, total, page, pageSize };
  }

  /**
   * Crear movimiento normal: cierra asignación activa (fecha_retiro=NOW) y agrega una nueva
   */
  async crear(dispositivo_id: number, payload: Asignacion, creado_por?: string | null) {
    const { persona_id, lugar_especifico, estado_dispositivo_id, observaciones } = payload;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Cierra asignación activa (si existe)
      await client.query(
        `UPDATE asignacion_dispositivo
            SET fecha_retiro = NOW()
          WHERE dispositivo_id = $1
            AND fecha_retiro IS NULL`,
        [dispositivo_id]
      );

      const { rows } = await client.query(
        `INSERT INTO asignacion_dispositivo
           (dispositivo_id, persona_id, lugar_especifico, estado_dispositivo_id, observaciones, creado_por, fecha_retiro)
         VALUES ($1,$2,$3,$4,$5,$6,NULL)
         RETURNING id`,
        [dispositivo_id, persona_id ?? null, lugar_especifico ?? null, estado_dispositivo_id, observaciones ?? null, creado_por ?? null]
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

  /**
   * Revertir: clona la asignación elegida como un nuevo movimiento con fecha_asignacion=NOW,
   * cierra la activa (fecha_retiro=NOW) y deja fecha_retiro NULL en la nueva.
   */
  async revertir(params: { dispositivo_id: number; asignacion_id: number; creado_por?: string | null }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const pick = await client.query(
        `SELECT *
           FROM asignacion_dispositivo
          WHERE id = $1 AND dispositivo_id = $2
          LIMIT 1`,
        [params.asignacion_id, params.dispositivo_id]
      );

      if (!pick.rows.length) throw new Error('NOT_FOUND');

      const src = pick.rows[0];

      // Cierra asignación activa actual
      await client.query(
        `UPDATE asignacion_dispositivo
            SET fecha_retiro = NOW()
          WHERE dispositivo_id = $1 AND fecha_retiro IS NULL`,
        [params.dispositivo_id]
      );

      const ins = await client.query(
        `INSERT INTO asignacion_dispositivo
           (dispositivo_id, persona_id, lugar_especifico, estado_dispositivo_id, fecha_asignacion, observaciones, creado_por, fecha_retiro)
         VALUES
           ($1, $2, $3, $4, NOW(), $5, $6, NULL)
         RETURNING id`,
        [
          params.dispositivo_id,
          src.persona_id ?? null,
          src.lugar_especifico ?? null,
          src.estado_dispositivo_id ?? null,
          src.observaciones ?? null,
          params.creado_por ?? src.creado_por ?? null,
        ]
      );

      await client.query('COMMIT');
      return { ok: true, asignacion_id: ins.rows[0].id };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
