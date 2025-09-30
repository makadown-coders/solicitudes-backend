// src/services/estadoDispositivo.service.ts
import { pool } from '../db/pool';
import { EstadoDispositivo } from '../models/estadoDispositivo.model';

export default class EstadoDispositivoService {
  async getAll(): Promise<EstadoDispositivo[]> {
    const { rows } = await pool.query('SELECT id, nombre FROM estado_dispositivo ORDER BY id');
    return rows;
  }
}
