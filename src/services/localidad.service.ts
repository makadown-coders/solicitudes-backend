// src/services/localidad.service.ts
import { Localidad } from '../models/localidad.model';
import { pool } from '../db/pool';

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
