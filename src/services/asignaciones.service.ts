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

  async crear(dispositivo_id: number, payload: Asignacion) {
    const { persona_id, lugar_especifico, estado_dispositivo_id, observaciones } = payload;
    const { rows } = await pool.query(
      `INSERT INTO asignacion_dispositivo
         (dispositivo_id, persona_id, lugar_especifico, estado_dispositivo_id, observaciones)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [dispositivo_id, persona_id ?? null, lugar_especifico ?? null, estado_dispositivo_id, observaciones ?? null]
    );
    return rows[0];
  }
}
