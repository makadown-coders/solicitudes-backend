import { PaginationQuery } from '../models/PaginationQuery';
import { PaginationResult } from '../models/PaginationResult';
import { Cita } from '../models/Cita';
import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  user: process.env.POSTGRES_USERNAME,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10)
});

class CitasService {
  async obtenerCitas(query: PaginationQuery): Promise<PaginationResult<Cita>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'fecha_de_cita';
    const sortOrder = (query.sortOrder ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const search = query.search?.trim() ?? '';

    const allowedSortFields = [
      'fecha_de_cita',
      'orden_de_suministro',
      'tipo_de_entrega',
      'clave_cnis',
      'institucion',
      'unidad'
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'fecha_de_cita';

    // Lista de columnas donde buscar
    const searchFields = [
      'orden_de_suministro',
      'fte_fmto',
      'proveedor',
      'clave_cnis',
      'descripcion',
      'compra',
      'tipo_de_red',
      'tipo_de_insumo',
      'grupo_terapeutico',
      'fecha_limite_de_entrega',
      'numero_de_remision',
      'lote',
      'almacen_hospital_que_recibio',
      'carga',
      'observacion'
    ];

    let client: PoolClient | null = null;
    try {
      client = await pool.connect();

      let whereClause = '';
      const values: any[] = [limit, offset];

      if (search) {
        const searchConditions = searchFields.map((field, idx) => `${field} ILIKE $${idx + 3}`);
        whereClause = `WHERE ${searchConditions.join(' OR ')}`;
        for (let i = 0; i < searchFields.length; i++) {
          values.push(`%${search}%`);
        }
      }

      const citasResult = await client.query<Cita>(
        `
        SELECT *
        FROM citas
        ${whereClause}
        ORDER BY ${sortField} ${sortOrder}
        LIMIT $1 OFFSET $2
        `,
        values
      );

      const totalQueryValues: any[] = [];
      let totalWhereClause = '';

      if (search) {
        const searchConditions = searchFields.map((field, idx) => `${field} ILIKE $${idx + 1}`);
        totalWhereClause = `WHERE ${searchConditions.join(' OR ')}`;
        for (let i = 0; i < searchFields.length; i++) {
          totalQueryValues.push(`%${search}%`);
        }
      }

      const totalResult = await client.query(
        `
        SELECT COUNT(*)
        FROM citas
        ${totalWhereClause}
        `,
        totalQueryValues
      );
      const total = parseInt(totalResult.rows[0].count, 10);

      return {
        data: citasResult.rows,
        total,
        page,
        limit
      };
    } finally {
      if (client) client.release();
    }
  }
}

export default CitasService;
