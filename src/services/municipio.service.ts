// src/services/municipio.service.ts
import { Municipio } from '../models/municipio.model';
import { pool } from '../db/pool';

class MunicipioService {
  async getAll(): Promise<Municipio[]> {
    const { rows } = await pool.query('SELECT * FROM municipio ORDER BY nombre_municipio');
    return rows;
  }
}

export default MunicipioService;
