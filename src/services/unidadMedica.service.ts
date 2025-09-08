import { Pool } from 'pg';
import dotenv from 'dotenv';
import { UnidadMedica, UnidadMedicaDetalle } from '../models/unidadMedica.model';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
});

class UnidadMedicaService {
  async getAll(): Promise<UnidadMedicaDetalle[]> {
    const sql = `
      SELECT
        id,
        cluessa,
        cluesimb,
        nombre_municipio,
        nombre_localidad,
        nombre_tipologia,
        es_segundo_nivel,
        nombre_de_unidad,
        tipo_unidad,
        alias_sas,                 -- ⬅️ nuevo
        direccion,
        latitud,
        longitud,
        estrato_unidad,
        nivel_atencion
      FROM public.v_unidad_medica_detalle
      ORDER BY nombre_municipio, nombre_localidad, nombre_de_unidad;
    `;
    const { rows } = await pool.query<UnidadMedicaDetalle>(sql);
    return rows;
  }

  async getById(id: number): Promise<UnidadMedicaDetalle | null> {
    const sql = `
      SELECT
        id,
        cluessa,
        cluesimb,
        nombre_municipio,
        nombre_localidad,
        nombre_tipologia,
        es_segundo_nivel,
        nombre_de_unidad,
        tipo_unidad,
        alias_sas,                 -- ⬅️ nuevo
        direccion,
        latitud,
        longitud,
        estrato_unidad,
        nivel_atencion
      FROM public.v_unidad_medica_detalle
      WHERE id = $1
      LIMIT 1;
    `;
    const { rows } = await pool.query<UnidadMedicaDetalle>(sql, [id]);
    return rows[0] ?? null;
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
