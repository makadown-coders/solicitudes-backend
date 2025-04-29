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

    const allowedSortFields = [
      'fecha_de_cita', 'orden_de_suministro', 'tipo_de_entrega',
      'clave_cnis', 'institucion', 'unidad'
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'fecha_de_cita';

    const camposTexto: (keyof Cita)[] = [
      'orden_de_suministro', 'institucion', 'tipo_de_entrega', 'clues_destino', 'unidad',
      'fte_fmto', 'proveedor', 'clave_cnis', 'descripcion', 'compra', 'tipo_de_red',
      'tipo_de_insumo', 'grupo_terapeutico', 'numero_de_remision', 'lote', 'caducidad',
      'estatus', 'folio_abasto', 'almacen_hospital_que_recibio', 'evidencia', 'carga',
      'observacion', 'fecha_recepcion_almacen'
    ];

    const camposNumericos: (keyof Cita)[] = [
      'ejercicio', 'precio_unitario', 'no_de_piezas_emitidas', 'pzas_recibidas_por_la_entidad'
    ];

    const camposFecha: (keyof Cita)[] = [
      'fecha_de_cita', 'fecha_limite_de_entrega'
    ];

    const condiciones: string[] = [];
    const values: any[] = [];
    let idx = 1;
   // console.log('Query: ', query);

    for (const campo of [...camposTexto, ...camposNumericos, ...camposFecha]) {
      const valor = (query as any)[campo];
     // console.log('Iterando sobre campo', campo, 'con valor', valor);
      if (valor !== undefined && valor !== null && valor !== '') {
        if (camposTexto.includes(campo)) {
          condiciones.push(`${campo} ILIKE $${idx}`);
          values.push(`%${valor}%`);
          idx++;
        } else if (camposNumericos.includes(campo)) {
          condiciones.push(`${campo} = $${idx}`);
          values.push(Number(valor));
          idx++;
        } else if (camposFecha.includes(campo)) {
          condiciones.push(`${campo} = $${idx}`);
          values.push(valor); // formato 'YYYY-MM-DD'
          idx++;
        }
      }
    }

    const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    // Guarda los valores de filtros aparte
    const filtrosValues = [...values];

    const limitPlaceholder = `$${idx++}`;
    const offsetPlaceholder = `$${idx++}`;
    values.push(limit, offset);

    let client: PoolClient | null = null;
    try {
      client = await pool.connect();

      console.log('FULL QUERY');
console.log(        `SELECT * FROM citas ${whereClause} 
  ORDER BY ${sortField} ${sortOrder}
  LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
  values);


      const citasResult = await client.query<Cita>(
        `SELECT * FROM citas ${whereClause} 
        ORDER BY ${sortField} ${sortOrder}
        LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        values
      );

      const totalResult = await client.query(
        `SELECT COUNT(*) FROM citas ${whereClause}`,
        filtrosValues
      );

      const total = parseInt(totalResult.rows[0].count, 10);

      return {
        data: citasResult.rows,
        total,
        page,
        limit
      };
    } catch (err: any) {
      console.error('Error en obtenerCitas:', err);
      throw new Error('Error al obtener citas');
    }
     finally {
      if (client) client.release();
    }
  }
}

export default CitasService;
