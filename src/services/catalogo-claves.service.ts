import { pool } from '../db/pool';

export type CatalogoClavesReporteRow = {
  partida: string | null;
  clave: string;
  descripcion: string | null;
  kitBasicoComunitario: 'SI' | 'NO';
  kitHospitalGeneral: 'SI' | 'NO';
  kitHospitalMaterno: 'SI' | 'NO';
  primerNivel: 'SI' | 'NO';
  oncologicosEsenciales: 'SI' | 'NO';
  cpmEstatal: string;
  cpmTotal: number | null;
  existenciaAlmacenes: number;
  mesesInventario: number | null;
  pzasU013Emitidas: number;
  pzasFonsabiOtrosEmitidas: number;
  totalEmitido: number;
  proyeccionAbasto: number | null;
};

export type CatalogoClavesReporteMetricas = {
  totalClaves: number;
  existencia: {
    menorA1Mes: { cantidad: number; porcentaje: number };
    mayorA1Mes: { cantidad: number; porcentaje: number };
  };
  cpm: {
    sinCpm: { cantidad: number; porcentaje: number };
  };
  proyeccion: {
    menorA1Mes: { cantidad: number; porcentaje: number };
    mayorA1Mes: { cantidad: number; porcentaje: number };
    sinProyeccion: { cantidad: number; porcentaje: number };
  };
};

export type CatalogoClavesReporte = {
  datos: CatalogoClavesReporteRow[];
  metricas: CatalogoClavesReporteMetricas;
};

export default class CatalogoClavesService {
  async obtenerReporte(): Promise<CatalogoClavesReporte> {
    const sql = `
      WITH articulos_base AS (
        SELECT DISTINCT a.partida, a.clave, a.descripcion
        FROM public.articulos a
        INNER JOIN public.v_unidad_medica_kit_claves vumkcv ON vumkcv.clave_cnis = a.clave
        INNER JOIN public.kit k ON k.codigo = vumkcv.kit_codigo
        WHERE k.id IN (433, 434, 435, 429, 428)
      ),
      kits_por_articulo AS MATERIALIZED (
        SELECT
          vumkcv.clave_cnis,
          BOOL_OR(k.id = 433) AS kit_basico,
          BOOL_OR(k.id = 434) AS kit_hosp_gral,
          BOOL_OR(k.id = 435) AS kit_materno,
          BOOL_OR(k.id = 429) AS primer_nivel,
          BOOL_OR(k.id = 428) AS oncologicos
        FROM public.v_unidad_medica_kit_claves vumkcv
        INNER JOIN public.kit k ON k.codigo = vumkcv.kit_codigo
        WHERE k.id IN (433, 434, 435, 429, 428)
        GROUP BY vumkcv.clave_cnis
      ),
      cpm_por_articulo AS MATERIALIZED (
        SELECT clave_cnis, SUM(cpm) AS cpm_total
        FROM public.cpm_real
        GROUP BY clave_cnis
      ),
      existencias_almacen AS MATERIALIZED (
        SELECT vec.clave_cnis, SUM(vec.existencia) AS existencia_total
        FROM public.v_existencias_consolidadas vec
        INNER JOIN public.v_unidad_medica_detalle vumd ON vec.cluesimb = vumd.cluesimb
        WHERE vumd.tipo_unidad = 'ALMACENES'
        GROUP BY vec.clave_cnis
      ),
      citas_por_articulo AS MATERIALIZED (
        SELECT
          clave_cnis,
          SUM(no_de_piezas_emitidas) FILTER (WHERE fte_fmto = 'U013') AS pzas_u013,
          SUM(no_de_piezas_emitidas) FILTER (WHERE fte_fmto <> 'U013') AS pzas_fonsabi,
          SUM(no_de_piezas_emitidas) AS total_emitido
        FROM public.citas
        WHERE estatus NOT IN ('Completo', 'No recibir', 'Incompleto')
          AND fecha_emision >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY clave_cnis
      ),
      resultado_base AS (
        SELECT
          a.partida,
          a.clave,
          a.descripcion,
          CASE WHEN k.kit_basico THEN 'SI' ELSE 'NO' END AS kit_basico_comunitario,
          CASE WHEN k.kit_hosp_gral THEN 'SI' ELSE 'NO' END AS kit_hospital_general,
          CASE WHEN k.kit_materno THEN 'SI' ELSE 'NO' END AS kit_hospital_materno,
          CASE WHEN k.primer_nivel THEN 'SI' ELSE 'NO' END AS primer_nivel,
          CASE WHEN k.oncologicos THEN 'SI' ELSE 'NO' END AS oncologicos_escenciales,
          CASE
            WHEN c.cpm_total IS NULL OR c.cpm_total = 0 THEN 'SIN CPM'
            ELSE c.cpm_total::text
          END AS cpm_estatal,
          c.cpm_total,
          COALESCE(e.existencia_total, 0) AS existencia_almacenes,
          CASE
            WHEN c.cpm_total > 0 THEN COALESCE(e.existencia_total, 0)::numeric / c.cpm_total
            ELSE NULL
          END AS meses_inventario,
          COALESCE(ci.pzas_u013, 0) AS pzas_u013_emitidas,
          COALESCE(ci.pzas_fonsabi, 0) AS pzas_fonsabi_otros_emitidas,
          COALESCE(ci.total_emitido, 0) AS total_emitido,
          CASE
            WHEN c.cpm_total > 0 THEN COALESCE(ci.total_emitido, 0)::numeric / c.cpm_total
            ELSE NULL
          END AS proyeccion_abasto
        FROM articulos_base a
        LEFT JOIN kits_por_articulo k ON k.clave_cnis = a.clave
        LEFT JOIN cpm_por_articulo c ON c.clave_cnis = a.clave
        LEFT JOIN existencias_almacen e ON e.clave_cnis = a.clave
        LEFT JOIN citas_por_articulo ci ON ci.clave_cnis = a.clave
      )
      SELECT json_build_object(
        'datos', (
          SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
          FROM (
            SELECT
              partida,
              clave,
              descripcion,
              kit_basico_comunitario AS "kitBasicoComunitario",
              kit_hospital_general AS "kitHospitalGeneral",
              kit_hospital_materno AS "kitHospitalMaterno",
              primer_nivel AS "primerNivel",
              oncologicos_escenciales AS "oncologicosEsenciales",
              cpm_estatal AS "cpmEstatal",
              cpm_total AS "cpmTotal",
              existencia_almacenes AS "existenciaAlmacenes",
              ROUND(meses_inventario, 2) AS "mesesInventario",
              pzas_u013_emitidas AS "pzasU013Emitidas",
              pzas_fonsabi_otros_emitidas AS "pzasFonsabiOtrosEmitidas",
              total_emitido AS "totalEmitido",
              ROUND(proyeccion_abasto, 2) AS "proyeccionAbasto"
            FROM resultado_base
            ORDER BY clave
          ) r
        ),
        'metricas', (
          SELECT json_build_object(
            'totalClaves', COUNT(*),
            'existencia', json_build_object(
              'menorA1Mes', json_build_object(
                'cantidad', COUNT(*) FILTER (WHERE meses_inventario < 1),
                'porcentaje', COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE meses_inventario < 1) / NULLIF(COUNT(*), 0), 2), 0)
              ),
              'mayorA1Mes', json_build_object(
                'cantidad', COUNT(*) FILTER (WHERE meses_inventario >= 1),
                'porcentaje', COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE meses_inventario >= 1) / NULLIF(COUNT(*), 0), 2), 0)
              )
            ),
            'cpm', json_build_object(
              'sinCpm', json_build_object(
                'cantidad', COUNT(*) FILTER (WHERE cpm_estatal = 'SIN CPM'),
                'porcentaje', COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE cpm_estatal = 'SIN CPM') / NULLIF(COUNT(*), 0), 2), 0)
              )
            ),
            'proyeccion', json_build_object(
              'menorA1Mes', json_build_object(
                'cantidad', COUNT(*) FILTER (WHERE proyeccion_abasto > 0 AND proyeccion_abasto < 1),
                'porcentaje', COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE proyeccion_abasto > 0 AND proyeccion_abasto < 1) / NULLIF(COUNT(*), 0), 2), 0)
              ),
              'mayorA1Mes', json_build_object(
                'cantidad', COUNT(*) FILTER (WHERE proyeccion_abasto >= 1),
                'porcentaje', COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE proyeccion_abasto >= 1) / NULLIF(COUNT(*), 0), 2), 0)
              ),
              'sinProyeccion', json_build_object(
                'cantidad', COUNT(*) FILTER (WHERE proyeccion_abasto IS NULL OR proyeccion_abasto = 0),
                'porcentaje', COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE proyeccion_abasto IS NULL OR proyeccion_abasto = 0) / NULLIF(COUNT(*), 0), 2), 0)
              )
            )
          )
          FROM resultado_base
        )
      ) AS respuesta;
    `;

    const { rows } = await pool.query<{ respuesta: CatalogoClavesReporte }>(sql);
    return rows[0]?.respuesta ?? {
      datos: [],
      metricas: {
        totalClaves: 0,
        existencia: {
          menorA1Mes: { cantidad: 0, porcentaje: 0 },
          mayorA1Mes: { cantidad: 0, porcentaje: 0 },
        },
        cpm: {
          sinCpm: { cantidad: 0, porcentaje: 0 },
        },
        proyeccion: {
          menorA1Mes: { cantidad: 0, porcentaje: 0 },
          mayorA1Mes: { cantidad: 0, porcentaje: 0 },
          sinProyeccion: { cantidad: 0, porcentaje: 0 },
        },
      },
    };
  }
}
