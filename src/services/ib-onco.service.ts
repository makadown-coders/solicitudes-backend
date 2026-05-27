import { pool } from '../db/pool';
import { fetch } from 'undici';

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

type SaciaOncoUnidad = {
  id: number;
  cluesimb: string;
  unidad: string;
};

type SaciaOncoCsvRow = {
  clave: string;
  cpm: number;
  existencias: number;
};

type SaciaOncoUnidadResult = SaciaOncoUnidad & {
  ok: boolean;
  leidos: number;
  claves: number;
  onco_claves_insertados: number;
  tmp_existencias_eliminados: number;
  tmp_existencias_insertados: number;
  error?: string;
};

const SACIA_ONCO_FUENTE = 'sacia-onco';

const SACIA_ONCO_UNIDADES: SaciaOncoUnidad[] = [
  { id: 1, cluesimb: 'BCIMB000010', unidad: 'Hospital General de Ensenada' },
  { id: 2, cluesimb: 'BCIMB000355', unidad: 'Hospital General de Mexicali' },
  { id: 3, cluesimb: 'BCIMB000734', unidad: 'Hospital General de Tijuana' },
  { id: 4, cluesimb: 'BCIMB001726', unidad: 'Uneme Oncologia Mexicali' },
];

export default class IbOncoService {
  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);
    return values.map((value) => value.trim());
  }

  private parseNumber(value: string | undefined): number {
    const normalized = String(value ?? '')
      .trim()
      .replace(/,/g, '');

    if (!normalized) return 0;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parseSaciaOncoCsv(csv: string): SaciaOncoCsvRow[] {
    const lines = csv
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length <= 1) return [];

    const rowsByClave = new Map<string, SaciaOncoCsvRow>();

    for (const line of lines.slice(1)) {
      const columns = this.parseCsvLine(line);
      const clave = String(columns[0] ?? '').trim().toUpperCase();

      if (!clave) continue;

      rowsByClave.set(clave, {
        clave,
        cpm: this.parseNumber(columns[2]),
        existencias: this.parseNumber(columns[3]),
      });
    }

    return Array.from(rowsByClave.values());
  }

  private async fetchSaciaOncoCsv(cluesId: number): Promise<string> {
    const baseUrl = process.env.SACIA_ONCO_EXISTENCIAS_URL;
    const token = process.env.SACIA_ONCO_TOKEN;

    if (!baseUrl) {
      throw new Error('Falta configurar SACIA_ONCO_EXISTENCIAS_URL');
    }

    if (!token) {
      throw new Error('Falta configurar SACIA_ONCO_TOKEN');
    }

    const response = await fetch(`${baseUrl}${encodeURIComponent(String(cluesId))}`, {
      method: 'GET',
      headers: {
        Accept: 'text/csv, text/plain, */*',
        Authorization: token,
      },
    });

    const body = await response.text();

    if (!response.ok) {
      throw new Error(`SACIA ONCO respondio ${response.status}: ${body.slice(0, 250)}`);
    }

    return body;
  }

  private async sincronizarUnidadSaciaOnco(unidad: SaciaOncoUnidad): Promise<SaciaOncoUnidadResult> {
    const csv = await this.fetchSaciaOncoCsv(unidad.id);
    const rows = this.parseSaciaOncoCsv(csv);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        'DELETE FROM public.onco_claves WHERE cluesimb = $1;',
        [unidad.cluesimb]
      );

      let oncoClavesInsertados = 0;
      let tmpExistenciasEliminados = 0;
      let tmpExistenciasInsertados = 0;

      if (rows.length) {
        const payload = JSON.stringify(rows);

        const oncoResult = await client.query(
          `
          WITH incoming AS (
            SELECT
              $1::varchar AS cluesimb,
              UPPER(TRIM(x->>'clave'))::varchar AS clave_cnis
            FROM jsonb_array_elements($2::jsonb) AS x
          )
          INSERT INTO public.onco_claves (cluesimb, clave_cnis)
          SELECT cluesimb, clave_cnis
          FROM incoming;
          `,
          [unidad.cluesimb, payload]
        );

        const deleteExistenciasResult = await client.query(
          `
          DELETE FROM public.tmp_existencias t
          USING public.onco_claves oc
          WHERE t.cluesimb = $1
            AND oc.cluesimb = $1
            AND t.clave_cnis = oc.clave_cnis;
          `,
          [unidad.cluesimb]
        );

        const existenciasResult = await client.query(
          `
          INSERT INTO public.tmp_existencias
            (fuente, alias_sas, cluessa, cluesimb, clave_cnis, lote, fecha_caducidad, existencia)
          SELECT
            $1::text AS fuente,
            (SELECT vumd.alias_sas FROM public.v_unidad_medica_detalle vumd WHERE vumd.cluesimb = $2 LIMIT 1) AS alias_sas,
            (SELECT vumd.cluessa FROM public.v_unidad_medica_detalle vumd WHERE vumd.cluesimb = $2 LIMIT 1) AS cluessa,
            $2::varchar AS cluesimb,
            UPPER(TRIM(x->>'clave'))::varchar AS clave_cnis,
            ''::varchar AS lote,
            NULL::date AS fecha_caducidad,
            COALESCE((x->>'existencias')::numeric, 0) AS existencia
          FROM jsonb_array_elements($3::jsonb) AS x;
          `,
          [SACIA_ONCO_FUENTE, unidad.cluesimb, payload]
        );

        oncoClavesInsertados = oncoResult.rowCount ?? 0;
        tmpExistenciasEliminados = deleteExistenciasResult.rowCount ?? 0;
        tmpExistenciasInsertados = existenciasResult.rowCount ?? 0;
      }

      await client.query('COMMIT');

      return {
        ...unidad,
        ok: true,
        leidos: rows.length,
        claves: rows.length,
        onco_claves_insertados: oncoClavesInsertados,
        tmp_existencias_eliminados: tmpExistenciasEliminados,
        tmp_existencias_insertados: tmpExistenciasInsertados,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async actualizarSaciaOnco() {
    const startedAt = new Date();
    const unidades: SaciaOncoUnidadResult[] = [];

    for (const unidad of SACIA_ONCO_UNIDADES) {
      try {
        unidades.push(await this.sincronizarUnidadSaciaOnco(unidad));
      } catch (error: any) {
        unidades.push({
          ...unidad,
          ok: false,
          leidos: 0,
          claves: 0,
          onco_claves_insertados: 0,
          tmp_existencias_eliminados: 0,
          tmp_existencias_insertados: 0,
          error: error?.message ?? 'Error desconocido',
        });
      }
    }

    const failed = unidades.filter((unidad) => !unidad.ok).length;

    return {
      ok: failed === 0,
      fuente: SACIA_ONCO_FUENTE,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      unidades_total: unidades.length,
      unidades_ok: unidades.length - failed,
      unidades_error: failed,
      claves_insertadas: unidades.reduce((total, unidad) => total + unidad.onco_claves_insertados, 0),
      existencias_eliminadas: unidades.reduce((total, unidad) => total + unidad.tmp_existencias_eliminados, 0),
      existencias_insertadas: unidades.reduce((total, unidad) => total + unidad.tmp_existencias_insertados, 0),
      unidades,
    };
  }

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
      FROM public.onco_claves_base oc
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
          INNER JOIN public.onco_claves_base oc
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
        INNER JOIN public.onco_claves_base oc
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
        INNER JOIN public.onco_claves_base oc
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
