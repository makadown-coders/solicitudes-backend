import { pool } from '../db/pool';
import { TipoDispositivo } from '../models/tipoDispositivo.model';

export default class TipoPerifericoService {
  async getAll(): Promise<TipoDispositivo[]> {
    const { rows } = await pool
    .query('SELECT id, nombre FROM cat_periferico_tipo ORDER BY nombre');
    return rows;
  }
}