import { pool } from '../db/pool';

export type DashboardEstatalRiesgoFaltante = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';
export type DashboardEstatalRiesgoSobreabasto = 'BAJO' | 'MEDIO' | 'ALTO';

export type DashboardEstatalClave = {
  clave_cnis: string;
  descripcion: string | null;
};

export type DashboardEstatalResumenClave = {
  clave_cnis: string;
  descripcion: string | null;
  cpm_estatal: number;
  cpm_x_3_estatal: number;
  existencia_estatal: number;
  ordenes_pendientes: number;
  piezas_pendientes: number;
  cpms_equivalentes: number | null;
  faltante_estimado: number;
  sobreabasto_estimado: number;
  riesgo_faltante: DashboardEstatalRiesgoFaltante;
  riesgo_sobreabasto: DashboardEstatalRiesgoSobreabasto;
  lectura: string;
};

type ResumenRow = {
  clave_cnis: string;
  descripcion: string | null;
  cpm_estatal: unknown;
  cpm_x_3_estatal: unknown;
  existencia_estatal: unknown;
  ordenes_pendientes: unknown;
  piezas_pendientes: unknown;
  cpms_equivalentes: unknown;
  faltante_estimado: unknown;
  sobreabasto_estimado: unknown;
  riesgo_faltante: DashboardEstatalRiesgoFaltante;
  riesgo_sobreabasto: DashboardEstatalRiesgoSobreabasto;
};

export default class DashboardEstatalService {
  private normalizeLimit(value: unknown, fallback: number, max: number) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.floor(parsed), 1), max);
  }

  private normalizeWindowDays(value: unknown) {
    return this.normalizeLimit(value, 120, 365);
  }

  private resumenCte() {
    return `
      WITH claves AS (
        SELECT UPPER(TRIM(a.clave)) AS clave_cnis
        FROM public.articulos a
        WHERE NULLIF(UPPER(TRIM(a.clave)), '') IS NOT NULL

        UNION

        SELECT UPPER(TRIM(c.clave_cnis)) AS clave_cnis
        FROM public.cpm c
        WHERE NULLIF(UPPER(TRIM(c.clave_cnis)), '') IS NOT NULL

        UNION

        SELECT UPPER(TRIM(t.clave_cnis)) AS clave_cnis
        FROM public.tmp_existencias t
        WHERE NULLIF(UPPER(TRIM(t.clave_cnis)), '') IS NOT NULL

        UNION

        SELECT UPPER(TRIM(c.clave_cnis)) AS clave_cnis
        FROM public.citas c
        WHERE NULLIF(UPPER(TRIM(c.clave_cnis)), '') IS NOT NULL
      ),
      articulos_ AS (
        SELECT
          UPPER(TRIM(a.clave)) AS clave_cnis,
          MAX(a.descripcion) AS descripcion
        FROM public.articulos a
        GROUP BY UPPER(TRIM(a.clave))
      ),
      cpm_ AS (
        SELECT
          UPPER(TRIM(c.clave_cnis)) AS clave_cnis,
          COALESCE(SUM(c.cpm), 0)::numeric AS cpm_estatal
        FROM public.cpm c
        INNER JOIN public.unidad_medica um ON um.id = c.unidad_medica_id
        GROUP BY UPPER(TRIM(c.clave_cnis))
      ),
      existencias_ AS (
        SELECT
          UPPER(TRIM(t.clave_cnis)) AS clave_cnis,
          COALESCE(SUM(t.existencia), 0)::numeric AS existencia_estatal
        FROM public.tmp_existencias t
        GROUP BY UPPER(TRIM(t.clave_cnis))
      ),
      citas_ AS (
        SELECT
          UPPER(TRIM(c.clave_cnis)) AS clave_cnis,
          COUNT(*)::int AS ordenes_pendientes,
          COALESCE(
            SUM(
              GREATEST(
                COALESCE(c.no_de_piezas_emitidas, 0)
                  - COALESCE(c.pzas_recibidas_por_la_entidad, 0),
                0
              )
            ),
            0
          )::numeric AS piezas_pendientes
        FROM public.citas c
        WHERE c.fecha_emision >= (CURRENT_DATE - ($1::int || ' days')::interval)
          AND (
            c.fecha_recepcion_max IS NULL
            OR COALESCE(c.pzas_recibidas_por_la_entidad, 0) < COALESCE(c.no_de_piezas_emitidas, 0)
          )
        GROUP BY UPPER(TRIM(c.clave_cnis))
      ),
      calc AS (
        SELECT
          k.clave_cnis,
          a.descripcion,
          COALESCE(cpm_.cpm_estatal, 0)::numeric AS cpm_estatal,
          (COALESCE(cpm_.cpm_estatal, 0) * 3)::numeric AS cpm_x_3_estatal,
          COALESCE(existencias_.existencia_estatal, 0)::numeric AS existencia_estatal,
          COALESCE(citas_.ordenes_pendientes, 0)::int AS ordenes_pendientes,
          COALESCE(citas_.piezas_pendientes, 0)::numeric AS piezas_pendientes
        FROM claves k
        LEFT JOIN articulos_ a ON a.clave_cnis = k.clave_cnis
        LEFT JOIN cpm_ ON cpm_.clave_cnis = k.clave_cnis
        LEFT JOIN existencias_ ON existencias_.clave_cnis = k.clave_cnis
        LEFT JOIN citas_ ON citas_.clave_cnis = k.clave_cnis
      ),
      scored AS (
        SELECT
          c.*,
          CASE
            WHEN c.cpm_estatal > 0 THEN ROUND((c.existencia_estatal / c.cpm_estatal)::numeric, 2)
            ELSE NULL
          END AS cpms_equivalentes,
          GREATEST(c.piezas_pendientes - c.existencia_estatal, 0)::numeric AS faltante_estimado,
          GREATEST(c.existencia_estatal - c.cpm_x_3_estatal - c.piezas_pendientes, 0)::numeric AS sobreabasto_estimado
        FROM calc c
      )
    `;
  }

  private selectResumenFields() {
    return `
      s.clave_cnis,
      s.descripcion,
      s.cpm_estatal,
      s.cpm_x_3_estatal,
      s.existencia_estatal,
      s.ordenes_pendientes,
      s.piezas_pendientes,
      s.cpms_equivalentes,
      s.faltante_estimado,
      s.sobreabasto_estimado,
      CASE
        WHEN s.existencia_estatal <= 0 AND s.piezas_pendientes > 0 THEN 'CRITICO'
        WHEN s.faltante_estimado > 0 THEN 'ALTO'
        WHEN s.existencia_estatal < s.cpm_estatal THEN 'MEDIO'
        ELSE 'BAJO'
      END AS riesgo_faltante,
      CASE
        WHEN s.sobreabasto_estimado > s.cpm_estatal THEN 'ALTO'
        WHEN s.sobreabasto_estimado > 0 THEN 'MEDIO'
        ELSE 'BAJO'
      END AS riesgo_sobreabasto
    `;
  }

  private buildLectura(row: DashboardEstatalResumenClave) {
    if (row.riesgo_faltante === 'CRITICO') {
      return `Riesgo crítico de faltante estatal: no hay existencia disponible y permanecen ${row.piezas_pendientes} piezas pendientes.`;
    }

    if (row.faltante_estimado > 0) {
      return `Posible faltante estatal de ${row.faltante_estimado} piezas frente a ${row.piezas_pendientes} piezas pendientes y ${row.existencia_estatal} en existencia.`;
    }

    if (row.sobreabasto_estimado > 0) {
      return `Posible sobreabasto estatal de ${row.sobreabasto_estimado} piezas después de cubrir pendientes y umbral de CPM x3.`;
    }

    if (row.cpm_estatal <= 0) {
      return 'Clave sin CPM estatal registrado; revisar existencia y órdenes pendientes con cautela.';
    }

    return `Cobertura estatal estimada de ${row.cpms_equivalentes ?? 0} CPMs, sin faltante ni sobreabasto estimado bajo el criterio actual.`;
  }

  private mapResumen(row: ResumenRow): DashboardEstatalResumenClave {
    const mapped: DashboardEstatalResumenClave = {
      clave_cnis: row.clave_cnis,
      descripcion: row.descripcion,
      cpm_estatal: Number(row.cpm_estatal ?? 0),
      cpm_x_3_estatal: Number(row.cpm_x_3_estatal ?? 0),
      existencia_estatal: Number(row.existencia_estatal ?? 0),
      ordenes_pendientes: Number(row.ordenes_pendientes ?? 0),
      piezas_pendientes: Number(row.piezas_pendientes ?? 0),
      cpms_equivalentes: row.cpms_equivalentes === null ? null : Number(row.cpms_equivalentes),
      faltante_estimado: Number(row.faltante_estimado ?? 0),
      sobreabasto_estimado: Number(row.sobreabasto_estimado ?? 0),
      riesgo_faltante: row.riesgo_faltante,
      riesgo_sobreabasto: row.riesgo_sobreabasto,
      lectura: '',
    };

    return {
      ...mapped,
      lectura: this.buildLectura(mapped),
    };
  }

  async buscarClaves(search?: string, limitInput?: number): Promise<DashboardEstatalClave[]> {
    const term = String(search ?? '').trim() || null;
    const limit = this.normalizeLimit(limitInput, 20, 100);

    const result = await pool.query(
      `
      WITH claves AS (
        SELECT UPPER(TRIM(a.clave)) AS clave_cnis
        FROM public.articulos a
        WHERE NULLIF(UPPER(TRIM(a.clave)), '') IS NOT NULL

        UNION

        SELECT UPPER(TRIM(c.clave_cnis)) AS clave_cnis
        FROM public.cpm c
        WHERE NULLIF(UPPER(TRIM(c.clave_cnis)), '') IS NOT NULL

        UNION

        SELECT UPPER(TRIM(t.clave_cnis)) AS clave_cnis
        FROM public.tmp_existencias t
        WHERE NULLIF(UPPER(TRIM(t.clave_cnis)), '') IS NOT NULL

        UNION

        SELECT UPPER(TRIM(c.clave_cnis)) AS clave_cnis
        FROM public.citas c
        WHERE NULLIF(UPPER(TRIM(c.clave_cnis)), '') IS NOT NULL
      ),
      articulos_ AS (
        SELECT
          UPPER(TRIM(a.clave)) AS clave_cnis,
          MAX(a.descripcion) AS descripcion
        FROM public.articulos a
        GROUP BY UPPER(TRIM(a.clave))
      )
      SELECT
        k.clave_cnis,
        a.descripcion
      FROM claves k
      LEFT JOIN articulos_ a ON a.clave_cnis = k.clave_cnis
      WHERE
        $1::text IS NULL
        OR k.clave_cnis ILIKE '%' || $1 || '%'
        OR COALESCE(a.descripcion, '') ILIKE '%' || $1 || '%'
      ORDER BY
        CASE WHEN $1::text IS NOT NULL AND k.clave_cnis ILIKE $1 || '%' THEN 0 ELSE 1 END,
        k.clave_cnis
      LIMIT $2;
      `,
      [term, limit]
    );

    return result.rows.map((row) => ({
      clave_cnis: row.clave_cnis,
      descripcion: row.descripcion ?? null,
    }));
  }

  async obtenerResumenClave(claveCnis: string, windowDaysInput?: number): Promise<DashboardEstatalResumenClave | null> {
    const clave = String(claveCnis ?? '').trim().toUpperCase();
    if (!clave) return null;

    const windowDays = this.normalizeWindowDays(windowDaysInput);

    const result = await pool.query(
      `
      ${this.resumenCte()}
      SELECT ${this.selectResumenFields()}
      FROM scored s
      WHERE s.clave_cnis = $2
      LIMIT 1;
      `,
      [windowDays, clave]
    );

    if (!result.rows.length) return null;
    return this.mapResumen(result.rows[0]);
  }

  async obtenerTop(windowDaysInput?: number, limitInput?: number) {
    const windowDays = this.normalizeWindowDays(windowDaysInput);
    const limit = this.normalizeLimit(limitInput, 10, 100);

    const result = await pool.query(
      `
      ${this.resumenCte()},
      resumen AS (
        SELECT ${this.selectResumenFields()}
        FROM scored s
      ),
      top_sobreabasto AS (
        SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS data
        FROM (
          SELECT *
          FROM resumen
          WHERE sobreabasto_estimado > 0
          ORDER BY sobreabasto_estimado DESC, cpms_equivalentes DESC NULLS LAST, clave_cnis
          LIMIT $2
        ) x
      ),
      top_faltantes AS (
        SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS data
        FROM (
          SELECT *
          FROM resumen
          WHERE faltante_estimado > 0 OR riesgo_faltante IN ('CRITICO', 'ALTO')
          ORDER BY faltante_estimado DESC, piezas_pendientes DESC, clave_cnis
          LIMIT $2
        ) x
      )
      SELECT
        top_sobreabasto.data AS top_sobreabasto,
        top_faltantes.data AS top_faltantes
      FROM top_sobreabasto
      CROSS JOIN top_faltantes;
      `,
      [windowDays, limit]
    );

    const row = result.rows[0] ?? { top_sobreabasto: [], top_faltantes: [] };
    const topSobreabasto: ResumenRow[] = Array.isArray(row.top_sobreabasto) ? row.top_sobreabasto : [];
    const topFaltantes: ResumenRow[] = Array.isArray(row.top_faltantes) ? row.top_faltantes : [];

    return {
      top_sobreabasto: topSobreabasto.map((item) => this.mapResumen(item)),
      top_faltantes: topFaltantes.map((item) => this.mapResumen(item)),
    };
  }
}
