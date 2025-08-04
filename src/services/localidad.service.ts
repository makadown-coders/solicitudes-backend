import { Pool } from 'pg';
import dotenv from 'dotenv';
import { Localidad } from '../models/localidad.model';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
});

class LocalidadService {
  async getAll(): Promise<Localidad[]> {
    const { rows } = await pool.query(`
      SELECT l.*, m.nombre_municipio 
      FROM localidad l
      JOIN municipio m ON l.municipio_id = m.id
      ORDER BY m.nombre_municipio, l.nombre_localidad
    `);
    return rows;
  }

  async getByMunicipio(municipioId: number): Promise<Localidad[]> {
    const { rows } = await pool.query(
      `SELECT * FROM localidad WHERE municipio_id = $1 ORDER BY nombre_localidad`,
      [municipioId]
    );
    return rows;
  }
}

export default LocalidadService;
