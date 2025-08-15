import { Pool } from 'pg';
import { Municipio } from '../models/municipio.model';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
});

class MunicipioService {
  async getAll(): Promise<Municipio[]> {
    const { rows } = await pool.query('SELECT * FROM municipio ORDER BY nombre_municipio');
    return rows;
  }
}

export default MunicipioService;
