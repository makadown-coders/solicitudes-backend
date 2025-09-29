// src/services/dispositivos.service.ts
import { pool } from '../db/pool';
import { Dispositivo, DispositivoRow } from '../models/dispositivo.model';

export default class DispositivosService {
  async list(opts: {
    unidad_medica_id?: number | null;
    tipo_dispositivo_id?: number | null;
    q?: string | null;
    limit: number; offset: number;
  }): Promise<DispositivoRow[]> {
    const { unidad_medica_id, tipo_dispositivo_id, q, limit, offset } = opts;
    const { rows } = await pool.query(
      `SELECT d.id, d.serial, d.marca, d.modelo, d.ip, d.conexion,
              td.nombre AS tipo, um.id AS unidad_medica_id, um.nombre AS unidad_medica
         FROM dispositivo d
         JOIN tipo_dispositivo td ON td.id = d.tipo_dispositivo_id
         JOIN unidad_medica um    ON um.id = d.unidad_medica_id
        WHERE ($1::int IS NULL OR d.unidad_medica_id=$1)
          AND ($2::int IS NULL OR d.tipo_dispositivo_id=$2)
          AND ($3::text IS NULL OR (d.serial ILIKE '%'||$3||'%' OR d.modelo ILIKE '%'||$3||'%'))
        ORDER BY d.id DESC LIMIT $4 OFFSET $5`,
      [unidad_medica_id ?? null, tipo_dispositivo_id ?? null, q ?? null, limit, offset]
    );
    return rows;
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
    const dev  = await pool.query(`SELECT * FROM dispositivo WHERE id=$1`, [id]);
    if (!dev.rowCount) return null;
    const mon  = await pool.query(`SELECT * FROM monitor WHERE dispositivo_id=$1 ORDER BY id`, [id]);
    const per  = await pool.query(`SELECT * FROM periferico WHERE dispositivo_id=$1 ORDER BY id`, [id]);
    return { ...dev.rows[0], monitores: mon.rows, perifericos: per.rows };
  }
}
