import { Pool } from 'pg';
import { TipoUnidad } from '../models/tipoUnidad.model';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
});

class TipoUnidadService {
  async getAll(): Promise<TipoUnidad[]> {
    const { rows } = await pool.query('SELECT * FROM tipo_unidad ORDER BY nombre_tipo');
    return rows;
  }
}

export default TipoUnidadService;
