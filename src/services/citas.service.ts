// src/services/citas.service.ts
import { Cita } from '../models/cita.model';
import axios from 'axios';
import { pool } from '../db/pool';
import { AxiosResponse } from 'axios';
import { PowerAutomateResponse } from '../models/powerAutomateResponse.model';

type SearchParams = {
  page?: string;            // 1..n
  limit?: string;           // 1..200
  ejercicio?: string;       // 2025
  proveedor?: string;       // like
  tipo_de_entrega?: string; // exact
  estatus?: string;         // exact
  clues?: string;           // exact
  unidad?: string;          // like
  clave?: string;           // clave_cnis exact
  recibido?: string;        // 'true' | 'false'
  fechaExacta?: string;     // 'YYYY-MM-DD'
  desde?: string;           // 'YYYY-MM-DD'
  hasta?: string;           // 'YYYY-MM-DD'
  q?: string;               // texto libre
  orderBy?: string; // 'emitidas' | 'recibidas' | 'cumplimiento_pct' | 'ordenes' | 'proveedor' | 'clave_cnis'
  sort?: string;    // 'asc' | 'desc'
  compra?: string;
};

function onlyEjercicio(p: SearchParams) {
  // Únicamente ejercicio presente; ningún otro filtro/texto/fecha/flag
  const { ejercicio, page, limit, orderBy, sort, ...rest } = p;
  if (!ejercicio) return false;
  for (const k of Object.keys(rest)) {
    const v = (rest as any)[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return false;
  }
  return true;
}

const allowedOrderColsProveedores = new Set(['emitidas', 'recibidas', 'cumplimiento_pct', 'ordenes', 'proveedor']);
const allowedOrderColsClaves = new Set(['emitidas', 'recibidas', 'cumplimiento_pct', 'clave_cnis']);

export default class CitasService {
  async init(reset: boolean) {
    if (reset) {
      await pool.query('TRUNCATE TABLE public.citas;');
    }
    return { ok: true };
  }

  /* Metodo BATCHA para esta estructura de citas
  public.citas (
    ejercicio integer,
    orden_de_suministro varchar(100),
    institucion varchar(50),
  contrato varchar(100),
    tipo_de_entrega varchar(100),
    clues_destino varchar(100),
    unidad varchar(255),
    fte_fmto varchar(100),
    proveedor varchar(255),
    clave_cnis varchar(100),
    descripcion text,
    compra varchar(100),
    tipo_de_red varchar(100),
    tipo_de_insumo varchar(100),
    grupo_terapeutico varchar(100),
    precio_unitario numeric,
    no_de_piezas_emitidas integer,
  fecha_emision date,
    fecha_limite_de_entrega date,
    pzas_recibidas_por_la_entidad numeric,
    fecha_recepcion_almacen varchar(100),
    numero_de_remision varchar(100),
    lote text,
    caducidad text,
    estatus varchar(100),
    folio_abasto varchar(100),
    almacen_hospital_que_recibio varchar(100),
    evidencia text,
    carga varchar(100),
    fecha_de_cita date
);
 */
  async batch(rows: Cita[]) {
    if (!rows?.length) return { inserted: 0 };
    const sql = `
      INSERT INTO public.citas (
        ejercicio,
        orden_de_suministro,
        institucion,
        contrato,
        tipo_de_entrega,
        clues_destino,
        unidad,
        fte_fmto,
        proveedor,
        clave_cnis,
        descripcion,
        compra,
        tipo_de_red,
        tipo_de_insumo,
        grupo_terapeutico,
        precio_unitario,
        no_de_piezas_emitidas,
        fecha_emision,
        fecha_limite_de_entrega,
        pzas_recibidas_por_la_entidad,
        fecha_recepcion_almacen,
        numero_de_remision,
        lote,
        caducidad,
        estatus,
        folio_abasto,
        almacen_hospital_que_recibio,
        evidencia,
        carga,
        fecha_de_cita)
      SELECT
        (x->>'ejercicio')::integer,
        NULLIF(x->>'orden_de_suministro',''),
        NULLIF(x->>'institucion',''),
        NULLIF(x->>'contrato',''),
        NULLIF(x->>'tipo_de_entrega',''),
        NULLIF(x->>'clues_destino',''),
        NULLIF(x->>'unidad',''),
        NULLIF(x->>'fte_fmto',''),
        NULLIF(x->>'proveedor',''),
        NULLIF(x->>'clave_cnis',''),
        NULLIF(x->>'descripcion',''),
        NULLIF(x->>'compra',''),
        NULLIF(x->>'tipo_de_red',''),
        NULLIF(x->>'tipo_de_insumo',''),
        NULLIF(x->>'grupo_terapeutico',''),
        (x->>'precio_unitario')::numeric,
        (x->>'no_de_piezas_emitidas')::integer,
        NULLIF(x->>'fecha_emision','')::date,
        NULLIF(x->>'fecha_limite_de_entrega','')::date,
        (x->>'pzas_recibidas_por_la_entidad')::numeric,
        NULLIF(x->>'fecha_recepcion_almacen',''),
        NULLIF(x->>'numero_de_remision',''),
        NULLIF(x->>'lote',''),
        NULLIF(x->>'caducidad',''),
        NULLIF(x->>'estatus',''),
        NULLIF(x->>'folio_abasto',''),
        NULLIF(x->>'almacen_hospital_que_recibio',''),
        NULLIF(x->>'evidencia',''),
        NULLIF(x->>'carga',''),
        NULLIF(x->>'fecha_de_cita','')::date
      FROM jsonb_array_elements($1::jsonb) AS x;
    `;
    const { rowCount } = await pool.query(sql, [JSON.stringify(rows)]);
    return { inserted: rowCount || 0 };
  }

  async search(qs: any) {
    const p: SearchParams = qs;
    const limit = Math.min(Math.max(Number(p.limit ?? 50), 1), 200);
    const page = Math.max(Number(p.page ?? 1), 1);
    const ofs = (page - 1) * limit;

    const wh: string[] = [];
    const args: any[] = [];
    const push = (sql: string, val: any) => {
      args.push(val);
      wh.push(sql.replace(/\?/g, `$${args.length}`));
    };

    if (p.ejercicio) push('ejercicio = ?', Number(p.ejercicio));
    if (p.proveedor) push('lower(proveedor) LIKE ?', `%${String(p.proveedor).toLowerCase()}%`);
    if (p.tipo_de_entrega) push('tipo_de_entrega = ?', p.tipo_de_entrega);
    if (p.estatus) push('estatus = ?', p.estatus);
    if (p.clues) push('clues_destino = ?', p.clues);
    if (p.unidad) push('lower(unidad) LIKE ?', `%${String(p.unidad).toLowerCase()}%`);
    if (p.clave) push('clave_cnis = ?', p.clave);

    if (p.recibido === 'true') wh.push('recibido = true');
    if (p.recibido === 'false') wh.push('recibido = false');

    // fecha exacta de recepción: 'YYYY-MM-DD' EN cualquiera de las fechas recibidas
    if (p.fechaExacta) {
      push('(?::date) = ANY(COALESCE(fecha_recepcion_lista, \'{}\'))', p.fechaExacta);
    }

    // rango por alguna de las fechas individuales recibidas
    if (p.desde && p.hasta) {
      // EXISTS sobre unnest del array (soporta N fechas por registro)
      args.push(p.desde, p.hasta);
      wh.push(`EXISTS (
        SELECT 1 FROM unnest(COALESCE(fecha_recepcion_lista, '{}')) AS f
        WHERE f BETWEEN $${args.length - 1} AND $${args.length}
      )`);
    } else if (p.desde) {
      push('fecha_recepcion_max >= ?', p.desde);
    } else if (p.hasta) {
      push('fecha_recepcion_min <= ?', p.hasta);
    }

    if (p.q) {
      const q = `%${String(p.q).toLowerCase()}%`;
      // ojo con índices: limita a columnas razonables
      args.push(q, q, q);
      wh.push(`(
        lower(orden_de_suministro) LIKE $${args.length - 2}
        OR lower(descripcion)      LIKE $${args.length - 1}
        OR lower(numero_de_remision) LIKE $${args.length}
      )`);
    }

    const where = wh.length ? 'WHERE ' + wh.join(' AND ') : '';

    const sql = `
      SELECT id, ejercicio, orden_de_suministro, institucion, contrato,
             tipo_de_entrega, clues_destino, unidad, proveedor,
             clave_cnis, descripcion, compra, tipo_de_red, tipo_de_insumo,
             grupo_terapeutico, precio_unitario,
             no_de_piezas_emitidas, pzas_recibidas_por_la_entidad,
             fecha_emision, fecha_limite_de_entrega, fecha_de_cita,
             fecha_recepcion_lista, fecha_recepcion_min, fecha_recepcion_max,
             numero_de_remision, estatus, folio_abasto, recibido, atraso_dias
      FROM public.citas
      ${where}
      ORDER BY fecha_de_cita NULLS LAST, id
      LIMIT $${args.length + 1} OFFSET $${args.length + 2};
    `;
    const countSql = `SELECT COUNT(*)::bigint AS total FROM public.citas ${where};`;

    const [rows, count] = await Promise.all([
      pool.query(sql, [...args, limit, ofs]),
      pool.query(countSql, args),
    ]);

    return {
      data: rows.rows,
      total: Number(count.rows[0].total),
      page,
      limit
    };
  }

  async statsResumen(qs: any) {
    const p: SearchParams = qs;
    console.log('statsResumen called with params:', p);

    if (onlyEjercicio(p)) {
      console.log('statsResumen: onlyEjercicio');
      // ⚡️ MV directa
      const { rows } = await pool.query(
        `SELECT * FROM public.mv_citas_resumen WHERE ejercicio = $1;`,
        [Number(p.ejercicio)]
      );

      // Para mantener el mismo shape de respuesta:
      const kpis = rows?.[0] ?? null;

      // Subtotales por estatus/tipo_de_entrega no están en esta MV;
      // si los quieres súper rápidos también, crea MVs por estatus/tipo. Mientras tanto, consulta “en vivo” por ejercicio.
      const [porEstatus, porTipo, cumplimiento] = await Promise.all([
        pool.query(`
        SELECT COALESCE(estatus,'(Sin estatus)') AS estatus,
               COUNT(DISTINCT orden_de_suministro) AS ordenes,
               COALESCE(SUM(no_de_piezas_emitidas),0) AS emitidas,
               COALESCE(SUM(pzas_recibidas_por_la_entidad),0) AS recibidas,
               CASE WHEN COALESCE(SUM(no_de_piezas_emitidas),0) > 0
                    THEN ROUND(100.0 * COALESCE(SUM(pzas_recibidas_por_la_entidad),0)
                                   / NULLIF(SUM(no_de_piezas_emitidas),0),2)
                    ELSE NULL END AS cumplimiento_pct
        FROM public.citas
        WHERE ejercicio = $1
        GROUP BY COALESCE(estatus,'(Sin estatus)')
        ORDER BY emitidas DESC, estatus ASC
      `, [Number(p.ejercicio)]),
        pool.query(`
        SELECT COALESCE(tipo_de_entrega,'(Sin tipo)') AS tipo_de_entrega,
               COUNT(DISTINCT orden_de_suministro) AS ordenes,
               COALESCE(SUM(no_de_piezas_emitidas),0) AS emitidas,
               COALESCE(SUM(pzas_recibidas_por_la_entidad),0) AS recibidas,
               CASE WHEN COALESCE(SUM(no_de_piezas_emitidas),0) > 0
                    THEN ROUND(100.0 * COALESCE(SUM(pzas_recibidas_por_la_entidad),0)
                                   / NULLIF(SUM(no_de_piezas_emitidas),0),2)
                    ELSE NULL END AS cumplimiento_pct
        FROM public.citas
        WHERE ejercicio = $1
        GROUP BY COALESCE(tipo_de_entrega,'(Sin tipo)')
        ORDER BY emitidas DESC, tipo_de_entrega ASC
      `, [Number(p.ejercicio)]),
        pool.query(`
        SELECT
          SUM(CASE WHEN recibido = true  AND atraso_dias IS NOT NULL AND atraso_dias <= 0 THEN 1 ELSE 0 END)::bigint AS on_time,
          SUM(CASE WHEN recibido = true  AND atraso_dias IS NOT NULL AND atraso_dias >  0 THEN 1 ELSE 0 END)::bigint AS late,
          SUM(CASE WHEN recibido = false OR  recibido IS NULL THEN 1 ELSE 0 END)::bigint AS pendientes
        FROM public.citas
        WHERE ejercicio = $1
      `, [Number(p.ejercicio)])
      ]);

      return {
        filtros_aplicados: { ejercicio: p.ejercicio },
        kpis,
        por_estatus: porEstatus.rows ?? [],
        por_tipo_entrega: porTipo.rows ?? [],
        cumplimiento: cumplimiento.rows?.[0] ?? null
      };
    }

    // 🔻 Si NO es “solo ejercicio”, cae a tu implementación actual (ya la tienes hecha arriba)
    return this.statsResumen_live(qs);
  }

  private async statsResumen_live(qs: any) {
    const p: SearchParams = qs;
    console.log('statsResumen_live called with params:', p);
    // Reusa la misma construcción de WHERE que en search()
    const wh: string[] = [];
    const args: any[] = [];
    const push = (sql: string, val: any) => {
      args.push(val);
      wh.push(sql.replace(/\?/g, `$${args.length}`));
    };

    if (p.ejercicio) push('ejercicio = ?', Number(p.ejercicio));
    if (p.proveedor) push('lower(proveedor) LIKE ?', `%${String(p.proveedor).toLowerCase()}%`);
    if (p.tipo_de_entrega) push('tipo_de_entrega = ?', p.tipo_de_entrega);
    if (p.estatus) push('estatus = ?', p.estatus);
    if (p.clues) push('clues_destino = ?', p.clues);
    if (p.unidad) push('lower(unidad) LIKE ?', `%${String(p.unidad).toLowerCase()}%`);
    if (p.clave) push('clave_cnis = ?', p.clave);

    if (p.recibido === 'true') wh.push('recibido = true');
    if (p.recibido === 'false') wh.push('recibido = false');

    if (p.fechaExacta) push('(?::date) = ANY(COALESCE(fecha_recepcion_lista, \'{}\'))', p.fechaExacta);

    if (p.desde && p.hasta) {
      args.push(p.desde, p.hasta);
      wh.push(`EXISTS (
        SELECT 1 FROM unnest(COALESCE(fecha_recepcion_lista, '{}')) AS f
        WHERE f BETWEEN $${args.length - 1} AND $${args.length}
      )`);
    } else if (p.desde) {
      push('fecha_recepcion_max >= ?', p.desde);
    } else if (p.hasta) {
      push('fecha_recepcion_min <= ?', p.hasta);
    }

    if (p.q) {
      const q = `%${String(p.q).toLowerCase()}%`;
      args.push(q, q, q);
      wh.push(`(
        lower(orden_de_suministro) LIKE $${args.length - 2}
        OR lower(descripcion)      LIKE $${args.length - 1}
        OR lower(numero_de_remision) LIKE $${args.length}
      )`);
    }

    const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';

    // 🔸 Query 1: KPIs generales + rango fechas
    const sqlKpis = `
      WITH b AS (
        SELECT *
        FROM public.citas
        ${where}
      )
      SELECT
        COUNT(*)::bigint                           AS registros,
        COUNT(DISTINCT orden_de_suministro)        AS ordenes,
        COALESCE(SUM(no_de_piezas_emitidas),0)     AS emitidas,
        COALESCE(SUM(pzas_recibidas_por_la_entidad),0) AS recibidas,
        CASE WHEN COALESCE(SUM(no_de_piezas_emitidas),0) > 0
             THEN ROUND(100.0 * COALESCE(SUM(pzas_recibidas_por_la_entidad),0)
                           / NULLIF(SUM(no_de_piezas_emitidas),0), 2)
             ELSE NULL
        END                                        AS cumplimiento_pct,
        MIN(fecha_de_cita)                         AS min_fecha_cita,
        MAX(fecha_de_cita)                         AS max_fecha_cita,
        MIN(fecha_recepcion_min)                   AS min_fecha_recepcion,
        MAX(fecha_recepcion_max)                   AS max_fecha_recepcion
      FROM b;
    `;

    // 🔸 Query 2: Subtotales por estatus
    const sqlPorEstatus = `
      WITH b AS (
        SELECT *
        FROM public.citas
        ${where}
      )
      SELECT
        COALESCE(estatus,'(Sin estatus)') AS estatus,
        COUNT(DISTINCT orden_de_suministro) AS ordenes,
        COALESCE(SUM(no_de_piezas_emitidas),0) AS emitidas,
        COALESCE(SUM(pzas_recibidas_por_la_entidad),0) AS recibidas,
        CASE WHEN COALESCE(SUM(no_de_piezas_emitidas),0) > 0
             THEN ROUND(100.0 * COALESCE(SUM(pzas_recibidas_por_la_entidad),0)
                           / NULLIF(SUM(no_de_piezas_emitidas),0), 2)
             ELSE NULL
        END AS cumplimiento_pct
      FROM b
      GROUP BY COALESCE(estatus,'(Sin estatus)')
      ORDER BY emitidas DESC, estatus ASC;
    `;

    // 🔸 Query 3: Subtotales por tipo_de_entrega
    const sqlPorTipoEntrega = `
      WITH b AS (
        SELECT *
        FROM public.citas
        ${where}
      )
      SELECT
        COALESCE(tipo_de_entrega,'(Sin tipo)') AS tipo_de_entrega,
        COUNT(DISTINCT orden_de_suministro) AS ordenes,
        COALESCE(SUM(no_de_piezas_emitidas),0) AS emitidas,
        COALESCE(SUM(pzas_recibidas_por_la_entidad),0) AS recibidas,
        CASE WHEN COALESCE(SUM(no_de_piezas_emitidas),0) > 0
             THEN ROUND(100.0 * COALESCE(SUM(pzas_recibidas_por_la_entidad),0)
                           / NULLIF(SUM(no_de_piezas_emitidas),0), 2)
             ELSE NULL
        END AS cumplimiento_pct
      FROM b
      GROUP BY COALESCE(tipo_de_entrega,'(Sin tipo)')
      ORDER BY emitidas DESC, tipo_de_entrega ASC;
    `;

    // 🔸 Query 4: Cumplimiento de tiempos (on-time / late / pendientes)
    const sqlCumplimiento = `
      WITH b AS (
        SELECT *
        FROM public.citas
        ${where}
      )
      SELECT
        SUM(CASE WHEN recibido = true  AND atraso_dias IS NOT NULL AND atraso_dias <= 0 THEN 1 ELSE 0 END)::bigint AS on_time,
        SUM(CASE WHEN recibido = true  AND atraso_dias IS NOT NULL AND atraso_dias >  0 THEN 1 ELSE 0 END)::bigint AS late,
        SUM(CASE WHEN recibido = false OR  recibido IS NULL THEN 1 ELSE 0 END)::bigint AS pendientes
      FROM b;
    `;
    // poner en log cada query con sus args
    console.log('statsResumen_live - SQL Queries:');
    console.log('SQL KPIs:', sqlKpis, 'ARGS:', args);
    console.log('SQL Por Estatus:', sqlPorEstatus, 'ARGS:', args);
    console.log('SQL Por Tipo Entrega:', sqlPorTipoEntrega, 'ARGS:', args);
    console.log('SQL Cumplimiento:', sqlCumplimiento, 'ARGS:', args);
    

    const [kpis, porEstatus, porTipo, cumplimiento] = await Promise.all([
      pool.query(sqlKpis, args),
      pool.query(sqlPorEstatus, args),
      pool.query(sqlPorTipoEntrega, args),
      pool.query(sqlCumplimiento, args),
    ]);

    return {
      filtros_aplicados: {
        ejercicio: p.ejercicio ?? null,
        proveedor: p.proveedor ?? null,
        tipo_de_entrega: p.tipo_de_entrega ?? null,
        estatus: p.estatus ?? null,
        clues: p.clues ?? null,
        unidad: p.unidad ?? null,
        clave: p.clave ?? null,
        recibido: p.recibido ?? null,
        fechaExacta: p.fechaExacta ?? null,
        desde: p.desde ?? null,
        hasta: p.hasta ?? null,
        q: p.q ?? null
      },
      kpis: kpis.rows?.[0] ?? null,
      por_estatus: porEstatus.rows ?? [],
      por_tipo_entrega: porTipo.rows ?? [],
      cumplimiento: cumplimiento.rows?.[0] ?? null
    };
  }

  private buildWhere(p: SearchParams, args: any[]) {
    const wh: string[] = [];
    const push = (sql: string, val: any) => {
      args.push(val);
      wh.push(sql.replace(/\?/g, `$${args.length}`));
    };

    if (p.ejercicio) push('ejercicio = ?', Number(p.ejercicio));
    if (p.proveedor) push('lower(proveedor) LIKE ?', `%${String(p.proveedor).toLowerCase()}%`);
    if (p.tipo_de_entrega) push('tipo_de_entrega = ?', p.tipo_de_entrega);
    if (p.estatus) push('estatus = ?', p.estatus);
    if (p.clues) push('clues_destino = ?', p.clues);
    if (p.unidad) push('lower(unidad) LIKE ?', `%${String(p.unidad).toLowerCase()}%`);
    if (p.clave) push('clave_cnis = ?', p.clave);

    if (p.recibido === 'true') wh.push('recibido = true');
    if (p.recibido === 'false') wh.push('recibido = false');

    if (p.fechaExacta) push('(?::date) = ANY(COALESCE(fecha_recepcion_lista, \'{}\'))', p.fechaExacta);
    if (p.compra) push('compra = ?', p.compra);

    if (p.desde && p.hasta) {
      args.push(p.desde, p.hasta);
      wh.push(`EXISTS (
        SELECT 1 FROM unnest(COALESCE(fecha_recepcion_lista, '{}')) AS f
        WHERE f BETWEEN $${args.length - 1} AND $${args.length}
      )`);
    } else if (p.desde) {
      push('fecha_recepcion_max >= ?', p.desde);
    } else if (p.hasta) {
      push('fecha_recepcion_min <= ?', p.hasta);
    }

    if (p.q) {
      const q = `%${String(p.q).toLowerCase()}%`;
      args.push(q, q, q);
      wh.push(`(
        lower(orden_de_suministro) LIKE $${args.length - 2}
        OR lower(descripcion)      LIKE $${args.length - 1}
        OR lower(numero_de_remision) LIKE $${args.length}
      )`);
    }

    return wh.length ? `WHERE ${wh.join(' AND ')}` : '';
  }

  async statsProveedores(qs: any) {
    const p: SearchParams = qs;
    const limit = Math.min(Math.max(Number(p.limit ?? 50), 1), 200);
    const page = Math.max(Number(p.page ?? 1), 1);
    const ofs = (page - 1) * limit;

    const sort = (p.sort ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const order = (p.orderBy ?? 'emitidas').toLowerCase();
    const orderCol = ['emitidas', 'recibidas', 'cumplimiento_pct', 'ordenes', 'proveedor'].includes(order) ? order : 'emitidas';

    if (onlyEjercicio(p)) {
      const args = [Number(p.ejercicio), limit, ofs];
      const { rows } = await pool.query(
        `
      SELECT proveedor_norm AS proveedor,
             ordenes, emitidas, recibidas, cumplimiento_pct
      FROM public.mv_citas_proveedores
      WHERE ejercicio = $1
      ORDER BY ${orderCol} ${sort}, proveedor_norm ASC
      LIMIT $2 OFFSET $3
      `, args
      );
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::bigint AS total FROM public.mv_citas_proveedores WHERE ejercicio = $1`, [Number(p.ejercicio)]
      );
      return { data: rows, total: Number(countRows[0].total), page, limit, orderBy: orderCol, sort };
    }

    // 🔻 Con filtros finos → versión “live” (ya la tienes)
    return this.statsProveedores_live(qs);
  }

  // 🔹 /citas/stats/proveedores
  private async statsProveedores_live(qs: any) {
    const p: SearchParams = qs;
    const limit = Math.min(Math.max(Number(p.limit ?? 50), 1), 200);
    const page = Math.max(Number(p.page ?? 1), 1);
    const ofs = (page - 1) * limit;

    const args: any[] = [];
    const where = this.buildWhere(p, args);

    // Orden seguro
    const orderCol = allowedOrderColsProveedores.has((p.orderBy ?? '').toLowerCase())
      ? (p.orderBy as string)
      : 'emitidas';
    const sortDir = (p.sort ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const sql = `
      WITH b AS (
        SELECT *
        FROM public.citas
        ${where}
      )
      SELECT
        COALESCE(NULLIF(trim(proveedor), ''), '(Sin proveedor)') AS proveedor,
        COUNT(DISTINCT orden_de_suministro) AS ordenes,
        COALESCE(SUM(no_de_piezas_emitidas),0) AS emitidas,
        COALESCE(SUM(pzas_recibidas_por_la_entidad),0) AS recibidas,
        CASE WHEN COALESCE(SUM(no_de_piezas_emitidas),0) > 0
             THEN ROUND(
               100.0 * COALESCE(SUM(pzas_recibidas_por_la_entidad),0)
               / NULLIF(SUM(no_de_piezas_emitidas),0), 2)
             ELSE NULL
        END AS cumplimiento_pct
      FROM b
      GROUP BY COALESCE(NULLIF(trim(proveedor), ''), '(Sin proveedor)')
      ORDER BY ${orderCol} ${sortDir}, proveedor ASC
      LIMIT $${args.length + 1} OFFSET $${args.length + 2};
    `;

    const countSql = `
      WITH b AS (
        SELECT *
        FROM public.citas
        ${where}
      )
      SELECT COUNT(*)::bigint AS total
      FROM (
        SELECT 1
        FROM b
        GROUP BY COALESCE(NULLIF(trim(proveedor), ''), '(Sin proveedor)')
      ) t;
    `;

    const [rows, count] = await Promise.all([
      pool.query(sql, [...args, limit, ofs]),
      pool.query(countSql, args),
    ]);

    return {
      data: rows.rows,
      total: Number(count.rows?.[0]?.total ?? 0),
      page, limit,
      orderBy: orderCol, sort: sortDir
    };
  }

  async statsCumplimientoClaves(qs: any) {
    const p: SearchParams = qs;
    const limit = Math.min(Math.max(Number(p.limit ?? 50), 1), 200);
    const page = Math.max(Number(p.page ?? 1), 1);
    const ofs = (page - 1) * limit;

    const sort = (p.sort ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'; // por defecto peor→mejor
    const order = (p.orderBy ?? 'cumplimiento_pct').toLowerCase();
    const orderCol = ['emitidas', 'recibidas', 'cumplimiento_pct', 'clave_cnis'].includes(order) ? order : 'cumplimiento_pct';

    if (onlyEjercicio(p)) {
      const args = [Number(p.ejercicio), limit, ofs];
      const { rows } = await pool.query(
        `
      SELECT clave_cnis, descripcion, emitidas, recibidas, cumplimiento_pct
      FROM public.mv_citas_claves
      WHERE ejercicio = $1
      ORDER BY ${orderCol} ${sort}, emitidas DESC, clave_cnis ASC
      LIMIT $2 OFFSET $3
      `, args
      );
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::bigint AS total FROM public.mv_citas_claves WHERE ejercicio = $1`, [Number(p.ejercicio)]
      );
      return { data: rows, total: Number(countRows[0].total), page, limit, orderBy: orderCol, sort };
    }

    // 🔻 Con filtros finos → versión “live”
    return this.statsCumplimientoClaves_live(qs);
  }

  // 🔹 /citas/stats/cumplimiento-claves
  private async statsCumplimientoClaves_live(qs: any) {
    const p: SearchParams = qs;
    const limit = Math.min(Math.max(Number(p.limit ?? 50), 1), 200);
    const page = Math.max(Number(p.page ?? 1), 1);
    const ofs = (page - 1) * limit;

    const args: any[] = [];
    const where = this.buildWhere(p, args);

    const orderCol = allowedOrderColsClaves.has((p.orderBy ?? '').toLowerCase())
      ? (p.orderBy as string)
      : 'cumplimiento_pct';
    const sortDir = (p.sort ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'; // por defecto: peor→mejor

    const sql = `
      WITH b AS (
        SELECT *
        FROM public.citas
        ${where}
      )
      SELECT
        clave_cnis,
        MIN(NULLIF(trim(descripcion), '')) AS descripcion,
        COALESCE(SUM(no_de_piezas_emitidas),0)    AS emitidas,
        COALESCE(SUM(pzas_recibidas_por_la_entidad),0) AS recibidas,
        CASE WHEN COALESCE(SUM(no_de_piezas_emitidas),0) > 0
             THEN ROUND(
               100.0 * COALESCE(SUM(pzas_recibidas_por_la_entidad),0)
               / NULLIF(SUM(no_de_piezas_emitidas),0), 2)
             ELSE NULL
        END AS cumplimiento_pct
      FROM b
      GROUP BY clave_cnis
      ORDER BY ${orderCol} ${sortDir}, emitidas DESC, clave_cnis ASC
      LIMIT $${args.length + 1} OFFSET $${args.length + 2};
    `;

    const countSql = `
      WITH b AS (
        SELECT *
        FROM public.citas
        ${where}
      )
      SELECT COUNT(*)::bigint AS total
      FROM (
        SELECT 1
        FROM b
        GROUP BY clave_cnis
      ) t;
    `;

    const [rows, count] = await Promise.all([
      pool.query(sql, [...args, limit, ofs]),
      pool.query(countSql, args),
    ]);

    return {
      data: rows.rows,
      total: Number(count.rows?.[0]?.total ?? 0),
      page, limit,
      orderBy: orderCol, sort: sortDir
    };
  }

  async refreshMaterializedViews() {
    // Llama el procedimiento que ya creaste en PASO 4
    await pool.query('CALL public.refresh_citas_mvs_all(true);');
    return {
      ok: true,
      refreshed: ['mv_citas_resumen',
        'mv_citas_proveedores',
        'mv_citas_claves'],
      concurrently: true
    };
  }

  /**
   * En vias de deprecación!
   * @returns 
   */
  async obtenerCitasDePowerAutomate64(): Promise<string> {
    console.log('🔁 Obteniendo info con Power Automate');
    let citasRetorno: Cita[] = [];
    let fila: any = null;
    try {
      // Hacer POST al flujo de Power Automate
      const response: AxiosResponse<PowerAutomateResponse> = await axios.post(
        process.env.AZURE_URL as string, // Aseguramos que AZURE_URL no sea undefined
        { claveSecreta: process.env.AZURE_PAYLOAD_SECRET },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.data?.archivo) {
        console.error('❌ No se recibió el archivo base64 en la respuesta.');
        return;
      }

      console.log(`✅ Datos en Base64 cargados desde Power Automate.`);
      return response.data.archivo;

    } catch (err: any) {
      console.error('❌ Error al ejecutar el seed de citas:', err);
      console.log('🔁 Procesando fila:', fila);
    }
    return null;
  }
}
