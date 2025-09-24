// src/services/tipoUnidad.service.ts
import { TipoUnidad } from '../models/tipoUnidad.model';
import { pool } from '../db/pool';

class TipoUnidadService {
  async getAll(): Promise<TipoUnidad[]> {
    const { rows } = await pool.query('SELECT * FROM tipo_unidad ORDER BY nombre_tipo');
    return rows;
  }
}

export default TipoUnidadService;
