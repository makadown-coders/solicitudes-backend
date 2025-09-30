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
              lugar_especifico      ILIKE '%'||$3||'%'
              -- OR ip              ILIKE '%'||$3||'%'   -- opcional
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

  async byId(id: number) {
    const dev = await pool.query(`SELECT * FROM dispositivo WHERE id=$1`, [id]);
    if (!dev.rowCount) return null;
    const mon = await pool.query(`SELECT * FROM monitor WHERE dispositivo_id=$1 ORDER BY id`, [id]);
    const per = await pool.query(`SELECT * FROM periferico WHERE dispositivo_id=$1 ORDER BY id`, [id]);
    return { ...dev.rows[0], monitores: mon.rows, perifericos: per.rows };
  }
}
