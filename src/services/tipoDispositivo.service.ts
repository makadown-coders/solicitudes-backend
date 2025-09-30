// src/services/tipoDispositivo.service.ts
import { pool } from '../db/pool';
import { TipoDispositivo } from '../models/tipoDispositivo.model';

export default class TipoDispositivoService {
  async getAll(): Promise<TipoDispositivo[]> {
    const { rows } = await pool.query('SELECT id, nombre FROM tipo_dispositivo ORDER BY nombre');
    return rows;
  }
}
