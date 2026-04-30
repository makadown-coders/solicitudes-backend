import { pool } from '../db/pool';

type PaginationParams = {
  page?: number;
  limit?: number;
  offset?: number;
};

type AbastoParams = PaginationParams & {
  cluesimb?: string;
  clave_cnis?: string;
  estado_abasto?: string;
  search?: string;
  window_days?: number;
};

type CitasPendientesParams = PaginationParams & {
  cluesimb?: string;
  clave_cnis?: string;
  window_days?: number;
};

type PaginatedResult<T> = {
  rows: T[];
  total: number;
  page: number;
  limit: number;
  offset: number;
  totalPages: number;
};

export default class IbOncoService {
  private normalizePagination(params: PaginationParams) {
    const limit = Math.min(Math.max(Number(params.limit ?? 100), 1), 1000);
    const requestedPage = Number(params.page);
    const requestedOffset = Number(params.offset);

    const page = Number.isFinite(requestedPage) && requestedPage > 0
      ? Math.floor(requestedPage)
      : 1;

    const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0
      ? Math.floor(requestedOffset)
      : (page - 1) * limit;

    const effectivePage = Math.floor(offset / limit) + 1;
    return { limit, offset, page: effectivePage };
  }

  private paginated<T>(rows: T[], total: number, page: number, limit: number, offset: number): PaginatedResult<T> {
    return {
      rows,
      total,
      page,
      limit,
      offset,
      totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    };
  }

  async obtenerUnidades() {
    const result = await pool.query(
      `
      SELECT
        ou.id,
        ou.cluesimb,
        vumd.cluessa,
        vumd.nombre_de_unidad,
        vumd.nombre_municipio
      FROM public.onco_unidades ou
      LEFT JOIN public.v_unidad_medica_detalle vumd
        ON vumd.cluesimb::text = ou.cluesimb::text
      ORDER BY vumd.nombre_de_unidad NULLS LAST, ou.cluesimb;
      `
    );

    return result.rows;
  }

  async obtenerClaves(cluesimb?: string) {
    const result = await pool.query(
      `
      SELECT
        oc.id,
        oc.cluesimb,
        oc.clave_cnis,
        a.descripcion
      FROM public.onco_claves oc
      LEFT JOIN public.articulos a
        ON a.clave::text = oc.clave_cnis::text
      WHERE ($1::text IS NULL OR oc.cluesimb = $1)
      ORDER BY oc.cluesimb, oc.clave_cnis;
      `,
      [cluesimb ?? null]
    );

    return result.rows;
  }

  async obtenerAbastoCpm(params: AbastoParams): Promise<PaginatedResult<any>> {
    const { cluesimb, clave_cnis, estado_abasto } = params;
    const search = String(params.search ?? '').trim() || null;
    const windowDays = Math.min(Math.max(Number(params.window_days ?? 120), 1), 365);
    const { limit, offset, page } = this.normalizePagination(params);

    const result = await pool.query(
      `
      SELECT *
      FROM (
        WITH citas AS (
          SELECT
            c.clues_destino AS cluesimb,
            c.clave_cnis,
            COUNT(*)::int AS citas_pendientes,
            COALESCE(SUM(c.no_de_piezas_emitidas), 0)::numeric AS piezas_pendientes
          FROM public.citas c
          INNER JOIN public.onco_claves oc
            ON oc.cluesimb::text = c.clues_destino::text
           AND oc.clave_cnis::text = c.clave_cnis::text
          WHERE c.fecha_recepcion_max IS NULL
            AND c.fecha_emision >= (CURRENT_DATE - ($1::int || ' days')::interval)
          GROUP BY c.clues_destino, c.clave_cnis
        )
        SELECT
          v.cluesimb,
          v.nombre_de_unidad,
          v.clave_cnis,
          a.descripcion,
          v.existencias,
          v.cpm,
          v.cpm_x_3,
          v.cpms_eq,
          v.estado_abasto,
          COALESCE(citas.citas_pendientes, 0)::int AS citas_pendientes,
          COALESCE(citas.piezas_pendientes, 0)::numeric AS piezas_pendientes,
          (COALESCE(citas.citas_pendientes, 0) > 0) AS tiene_citas_pendientes,
          COUNT(*) OVER() AS total_count
        FROM public.v_onco_abasto_cpm v
        LEFT JOIN public.articulos a
          ON a.clave::text = v.clave_cnis::text
        LEFT JOIN citas
          ON citas.cluesimb::text = v.cluesimb::text
         AND citas.clave_cnis::text = v.clave_cnis::text
        WHERE
          ($2::text IS NULL OR v.cluesimb = $2)
          AND ($3::text IS NULL OR v.clave_cnis = $3)
          AND ($4::text IS NULL OR v.estado_abasto = $4)
          AND (
            $5::text IS NULL
            OR v.cluesimb ILIKE '%' || $5 || '%'
            OR v.nombre_de_unidad ILIKE '%' || $5 || '%'
            OR v.clave_cnis ILIKE '%' || $5 || '%'
            OR COALESCE(a.descripcion, '') ILIKE '%' || $5 || '%'
          )
      ) base
      ORDER BY
        CASE WHEN estado_abasto = 'posible sobre abasto' THEN 0 ELSE 1 END,
        cluesimb,
        clave_cnis
      LIMIT $6 OFFSET $7;
      `,
      [
        windowDays,
        cluesimb ?? null,
        clave_cnis ?? null,
        estado_abasto ?? null,
        search,
        limit,
        offset,
      ]
    );

    const total = result.rows.length ? Number(result.rows[0].total_count) : 0;
    const rows = result.rows.map((row) => ({
      cluesimb: row.cluesimb,
      nombre_de_unidad: row.nombre_de_unidad,
      clave_cnis: row.clave_cnis,
      descripcion: row.descripcion,
      existencias: Number(row.existencias ?? 0),
      cpm: Number(row.cpm ?? 0),
      cpm_x_3: Number(row.cpm_x_3 ?? 0),
      cpms_eq: Number(row.cpms_eq ?? 0),
      estado_abasto: row.estado_abasto,
      citas_pendientes: Number(row.citas_pendientes ?? 0),
      piezas_pendientes: Number(row.piezas_pendientes ?? 0),
      tiene_citas_pendientes: Boolean(row.tiene_citas_pendientes),
    }));

    return this.paginated(rows, total, page, limit, offset);
  }

  async obtenerCitasPendientes(params: CitasPendientesParams): Promise<PaginatedResult<any>> {
    const windowDays = Math.min(Math.max(Number(params.window_days ?? 120), 1), 365);
    const { limit, offset, page } = this.normalizePagination(params);

    const result = await pool.query(
      `
      SELECT *
      FROM (
        SELECT
          c.id,
          c.ejercicio,
          c.orden_de_suministro,
          c.institucion,
          c.contrato,
          c.clues_destino AS cluesimb,
          c.unidad AS nombre_de_unidad,
          c.clave_cnis,
          c.descripcion,
          c.proveedor,
          c.compra,
          c.tipo_de_entrega,
          c.fte_fmto,
          c.tipo_de_red,
          c.tipo_de_insumo,
          c.grupo_terapeutico,
          c.precio_unitario,
          c.no_de_piezas_emitidas,
          c.pzas_recibidas_por_la_entidad,
          c.fecha_emision,
          c.fecha_limite_de_entrega,
          c.fecha_de_cita,
          c.estatus,
          c.folio_abasto,
          COUNT(*) OVER() AS total_count
        FROM public.citas c
        INNER JOIN public.onco_claves oc
          ON oc.cluesimb::text = c.clues_destino::text
         AND oc.clave_cnis::text = c.clave_cnis::text
        WHERE
          c.fecha_emision >= (CURRENT_DATE - ($1::int || ' days')::interval)
          AND c.fecha_recepcion_max IS NULL
          AND ($2::text IS NULL OR c.clues_destino = $2)
          AND ($3::text IS NULL OR c.clave_cnis = $3)
      ) base
      ORDER BY fecha_limite_de_entrega DESC NULLS LAST, id DESC
      LIMIT $4 OFFSET $5;
      `,
      [
        windowDays,
        params.cluesimb ?? null,
        params.clave_cnis ?? null,
        limit,
        offset,
      ]
    );

    const total = result.rows.length ? Number(result.rows[0].total_count) : 0;
    const rows = result.rows.map((row) => ({
      id: row.id,
      ejercicio: row.ejercicio,
      orden_de_suministro: row.orden_de_suministro,
      institucion: row.institucion,
      contrato: row.contrato,
      cluesimb: row.cluesimb,
      nombre_de_unidad: row.nombre_de_unidad,
      clave_cnis: row.clave_cnis,
      descripcion: row.descripcion,
      proveedor: row.proveedor,
      compra: row.compra,
      tipo_de_entrega: row.tipo_de_entrega,
      fte_fmto: row.fte_fmto,
      tipo_de_red: row.tipo_de_red,
      tipo_de_insumo: row.tipo_de_insumo,
      grupo_terapeutico: row.grupo_terapeutico,
      precio_unitario: Number(row.precio_unitario ?? 0),
      no_de_piezas_emitidas: Number(row.no_de_piezas_emitidas ?? 0),
      pzas_recibidas_por_la_entidad: Number(row.pzas_recibidas_por_la_entidad ?? 0),
      fecha_emision: row.fecha_emision,
      fecha_limite_de_entrega: row.fecha_limite_de_entrega,
      fecha_de_cita: row.fecha_de_cita,
      estatus: row.estatus,
      folio_abasto: row.folio_abasto,
    }));

    return this.paginated(rows, total, page, limit, offset);
  }

  async obtenerResumen(windowDays = 120) {
    const dias = Math.min(Math.max(Number(windowDays), 1), 365);

    const result = await pool.query(
      `
      WITH base AS (
        SELECT
          v.cluesimb,
          v.nombre_de_unidad,
          v.clave_cnis,
          v.existencias,
          v.cpm,
          v.cpm_x_3,
          v.cpms_eq,
          v.estado_abasto
        FROM public.v_onco_abasto_cpm v
      ),
      citas AS (
        SELECT
          c.clues_destino AS cluesimb,
          c.clave_cnis,
          COUNT(*)::int AS citas_pendientes,
          COALESCE(SUM(c.no_de_piezas_emitidas), 0)::numeric AS piezas_pendientes
        FROM public.citas c
        INNER JOIN public.onco_claves oc
          ON oc.cluesimb::text = c.clues_destino::text
         AND oc.clave_cnis::text = c.clave_cnis::text
        WHERE c.fecha_emision >= (CURRENT_DATE - ($1::int || ' days')::interval)
          AND c.fecha_recepcion_max IS NULL
        GROUP BY c.clues_destino, c.clave_cnis
      )
      SELECT
        base.cluesimb,
        MAX(base.nombre_de_unidad) AS nombre_de_unidad,
        COUNT(*)::int AS claves_onco,
        COUNT(*) FILTER (WHERE base.estado_abasto = 'posible sobre abasto')::int AS claves_posible_sobre_abasto,
        COALESCE(SUM(base.existencias), 0)::numeric AS existencias_total,
        COALESCE(SUM(base.cpm), 0)::numeric AS cpm_total,
        COALESCE(SUM(citas.citas_pendientes), 0)::int AS citas_pendientes,
        COALESCE(SUM(citas.piezas_pendientes), 0)::numeric AS piezas_pendientes
      FROM base
      LEFT JOIN citas
        ON citas.cluesimb = base.cluesimb
       AND citas.clave_cnis = base.clave_cnis
      GROUP BY base.cluesimb
      ORDER BY claves_posible_sobre_abasto DESC, citas_pendientes DESC, nombre_de_unidad;
      `,
      [dias]
    );

    return result.rows.map((row) => ({
      cluesimb: row.cluesimb,
      nombre_de_unidad: row.nombre_de_unidad,
      claves_onco: Number(row.claves_onco ?? 0),
      claves_posible_sobre_abasto: Number(row.claves_posible_sobre_abasto ?? 0),
      existencias_total: Number(row.existencias_total ?? 0),
      cpm_total: Number(row.cpm_total ?? 0),
      citas_pendientes: Number(row.citas_pendientes ?? 0),
      piezas_pendientes: Number(row.piezas_pendientes ?? 0),
    }));
  }
}
