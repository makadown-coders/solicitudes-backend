// src/services/citas.service.ts
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
    console.log('PaginationQuery recibido', query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'fecha_de_cita';
    const sortOrder = (query.sortOrder ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const search = query.search?.trim();

    console.log('sortBy', sortBy);

    /*const allowedSortFields = [
      'fecha_de_cita', 'orden_de_suministro', 'tipo_de_entrega',
      'clave_cnis', 'institucion', 'unidad'
    ];*/
    const sortField = sortBy; // allowedSortFields.includes(sortBy) ? sortBy : 'fecha_de_cita';

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

    // Filtros explícitos del frontend
    const filtrosExplicitos = new Set(Object.keys(query).filter(k => !['page', 'limit', 'sortBy', 'sortOrder', 'search'].includes(k)));

    // Aplica filtros explícitos
    for (const campo of [...camposTexto, ...camposNumericos, ...camposFecha]) {
      const valor = (query as any)[campo];
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
          values.push(valor);
          idx++;
        }
      }
    }

    // Aplica filtro global 'search' sobre los campos no enviados explícitamente
    if (search) {
      const orSearch: string[] = [];
      for (const campo of [...camposTexto, ...camposNumericos, ...camposFecha]) {
        if (!filtrosExplicitos.has(campo)) {
          orSearch.push(`${campo}::text ILIKE $${idx}`);
          values.push(`%${search}%`);
          idx++; // << AQUI es crítico incrementar idx
        }
      }
      if (orSearch.length > 0) {
        condiciones.push(`(${orSearch.join(' OR ')})`);
      }
    }

    const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
    let filtrosValues = [...values];

    const limitPlaceholder = `$${idx++}`;
    const offsetPlaceholder = `$${idx++}`;
    values.push(limit, offset);

    /*if (search) {
      filtrosValues = values.slice(0, idx - 2);
    }*/

    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      console.log(`SELECT * FROM citas ${whereClause} ORDER BY ${sortField} ${sortOrder} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        values);
      const citasResult = await client.query<Cita>(
        `SELECT * FROM citas ${whereClause} ORDER BY ${sortField} ${sortOrder} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
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
    } finally {
      if (client) client.release();
    }
  }
}

export default CitasService;
