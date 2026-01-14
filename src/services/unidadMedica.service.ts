// src/services/unidadMedica.service.ts
import { UnidadExistente, UnidadMedica, UnidadMedicaDetalle } from '../models/unidadMedica.model';
import { pool } from '../db/pool';

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

  /**
  * Búsqueda paginada para TI:
  * - Filtros opcionales: tipo_unidad_id, municipio_id, localidad_id, q (nombre/CLUES)
  * - Retorna items + total (via COUNT() OVER())
  */
  async searchForTI(opts: {
    tipo_unidad_id?: number | null;
    municipio_id?: number | null;
    localidad_id?: number | null;
    q?: string | null;
    page?: number;
    pageSize?: number;
  }) {
    const pageSize = Math.min(Number(opts.pageSize ?? 20), 100);
    const page = Math.max(Number(opts.page ?? 1), 1);
    const offset = (page - 1) * pageSize;

    const sql = `
      SELECT
        um.id,
        um.cluessa,
        um.cluesimb,
        um.nombre,
        um.direccion,
        tu.id    AS tipo_unidad_id,
        tu.nombre_tipo AS tipo_unidad,
        l.id     AS localidad_id,
        l.nombre_localidad AS localidad,
        m.id     AS municipio_id,
        m.nombre_municipio AS municipio,
        COUNT(*) OVER() AS total
      FROM unidad_medica um
      JOIN tipo_unidad tu ON tu.id = um.tipo_unidad_id
      JOIN localidad   l  ON l.id  = um.localidad_id
      JOIN municipio   m  ON m.id  = l.municipio_id
      WHERE ($1::int  IS NULL OR um.tipo_unidad_id = $1)
        AND ($2::int  IS NULL OR m.id = $2)
        AND ($3::int  IS NULL OR l.id = $3)
        AND ($4::text IS NULL OR (
             um.nombre   ILIKE '%'||$4||'%' OR
             um.cluessa  ILIKE '%'||$4||'%' OR
             um.cluesimb ILIKE '%'||$4||'%'
        ))
      ORDER BY um.nombre
      LIMIT $5 OFFSET $6
    `;

    const params = [
      opts.tipo_unidad_id ?? null,
      opts.municipio_id ?? null,
      opts.localidad_id ?? null,
      (opts.q ?? '').trim() || null,
      pageSize,
      offset
    ];

    const { rows } = await pool.query(sql, params);
    const total = rows[0]?.total ? Number(rows[0].total) : 0;
    const items = rows.map(({ total, ...r }) => r);

    return { items, page, pageSize, total };
  }

  async getPrimerNivel(): Promise<UnidadExistente[]> {
    const sql = `
      select
	cluesimb as key,
	cluessa, 
	cluesimb, 
	nombre_municipio as nombre, 
	nombre_localidad as localidad, 	 
		    CASE 
		        WHEN nombre_municipio IN ('TIJUANA', 'TECATE', 'PLAYAS DE ROSARITO') THEN 'TIJUANA'
		        WHEN nombre_municipio IN ('MEXICALI', 'SAN FELIPE') THEN 'MEXICALI'
		        WHEN nombre_municipio IN ('ENSENADA', 'SAN QUINTIN') THEN 'ENSENADA'
		        ELSE nombre_municipio
		    END as jurisdiccion,
	 direccion, 
	 latitud, 
	 longitud,
	 estrato_unidad, 
	 nivel_atencion,
	 'CENTROS DE SALUD' as tipoUnidad 
from v_unidad_medica_detalle 
where tipo_unidad = 'CENTRO DE SALUD' 
order by jurisdiccion, cluesimb 
    `;
    const { rows } = await pool.query<UnidadExistente>(sql);
    return rows;
  }
}

export default UnidadMedicaService;
