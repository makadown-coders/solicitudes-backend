import { Pool } from 'pg';
import dotenv from 'dotenv';
import { UnidadMedica } from '../models/unidadMedica.model';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
});

class UnidadMedicaService {
  async getAll(): Promise<UnidadMedica[]> {
    const query = `
      SELECT 
        um.id,
        um.cluessa,
        um.cluesimb,
        um.nombre,
        uma.alias_sas,
        um.direccion,
        um.latitud,
        um.longitud,
        um.estrato_unidad,
        um.nivel_atencion,
        tu.nombre_tipo AS tipo_unidad,
        l.nombre_localidad,
        m.nombre_municipio
      FROM unidad_medica um
      JOIN tipo_unidad tu ON um.tipo_unidad_id = tu.id
      JOIN localidad l ON um.localidad_id = l.id
      JOIN municipio m ON l.municipio_id = m.id 
      left join unidad_medica_alias uma on um.id = uma.unidad_medica_id 
      ORDER BY m.nombre_municipio, l.nombre_localidad;
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  async getById(id: number): Promise<UnidadMedica | null> {
    const { rows } = await pool.query('SELECT * FROM unidad_medica WHERE id = $1', [id]);
    return rows[0] || null;
  }

  async create(data: UnidadMedica): Promise<UnidadMedica> {
    const query = `
      INSERT INTO unidad_medica 
        (cluessa, cluesimb, nombre, direccion, latitud, longitud, estrato_unidad, nivel_atencion, tipo_unidad_id, localidad_id)
      VALUES 
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *;
    `;
    const values = [
      data.cluessa,
      data.cluesimb,
      data.nombre,
      data.direccion,
      data.latitud,
      data.longitud,
      data.estrato_unidad,
      data.nivel_atencion,
      data.tipo_unidad_id,
      data.localidad_id
    ];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  async update(id: number, data: UnidadMedica): Promise<UnidadMedica> {
    const query = `
      UPDATE unidad_medica SET
        cluessa=$1,
        cluesimb=$2,
        nombre=$3,
        direccion=$4,
        latitud=$5,
        longitud=$6,
        estrato_unidad=$7,
        nivel_atencion=$8,
        tipo_unidad_id=$9,
        localidad_id=$10
      WHERE id=$11
      RETURNING *;
    `;
    const values = [
      data.cluessa,
      data.cluesimb,
      data.nombre,
      data.direccion,
      data.latitud,
      data.longitud,
      data.estrato_unidad,
      data.nivel_atencion,
      data.tipo_unidad_id,
      data.localidad_id,
      id
    ];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  async delete(id: number): Promise<void> {
    await pool.query('DELETE FROM unidad_medica WHERE id = $1', [id]);
  }
}

export default UnidadMedicaService;
