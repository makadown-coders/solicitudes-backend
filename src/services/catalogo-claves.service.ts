import { pool } from '../db/pool';
import * as XLSX from 'xlsx';

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
  private formatPct(value: number): string {
    return `${Number(value ?? 0).toFixed(2)}%`;
  }

  private addCellStyle(ws: XLSX.WorkSheet, cellAddress: string, style: XLSX.CellObject['s']) {
    const cell = ws[cellAddress];
    if (!cell) return;
    cell.s = style;
  }

  private addRangeStyle(ws: XLSX.WorkSheet, range: XLSX.Range, style: XLSX.CellObject['s']) {
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        this.addCellStyle(ws, XLSX.utils.encode_cell({ r: row, c: col }), style);
      }
    }
  }

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

  async generarReporteExcel(): Promise<Buffer> {
    const reporte = await this.obtenerReporte();
    const { metricas, datos } = reporte;

    const headerRow = [
      'Partida',
      'Clave',
      'Descripcion',
      'Kit Basico Comunitario',
      'Kit Hospital General',
      'Kit Hospital Materno',
      '1er Nivel',
      'Oncologicos Esenciales',
      'CPM Estatal',
      'Existencia en almacenes',
      'Meses de inventario',
      'U013',
      'FONSABI',
      'Programa',
      'Total emitido',
      'Proyeccion de abasto',
    ];

    const rows: unknown[][] = [
      ['CATALOGO DE CLAVES IMSS BIENESTAR'],
      [],
      ['', '', '', '', '', 'Total de claves', metricas.totalClaves],
      [
        '',
        '',
        '',
        '',
        'Claves con existencia menor a un mes',
        metricas.existencia.menorA1Mes.cantidad,
        this.formatPct(metricas.existencia.menorA1Mes.porcentaje),
        '',
        '',
        'Claves con proyeccion menor a un mes',
        metricas.proyeccion.menorA1Mes.cantidad,
        this.formatPct(metricas.proyeccion.menorA1Mes.porcentaje),
      ],
      [
        '',
        '',
        '',
        '',
        'Claves con existencia mayor a un mes',
        metricas.existencia.mayorA1Mes.cantidad,
        this.formatPct(metricas.existencia.mayorA1Mes.porcentaje),
        '',
        '',
        'Claves con proyeccion mayor a un mes',
        metricas.proyeccion.mayorA1Mes.cantidad,
        this.formatPct(metricas.proyeccion.mayorA1Mes.porcentaje),
      ],
      [
        '',
        '',
        '',
        '',
        'Claves sin CPM',
        metricas.cpm.sinCpm.cantidad,
        this.formatPct(metricas.cpm.sinCpm.porcentaje),
        '',
        '',
        'Claves sin proyeccion',
        metricas.proyeccion.sinProyeccion.cantidad,
        this.formatPct(metricas.proyeccion.sinProyeccion.porcentaje),
      ],
      [],
      headerRow,
      ...datos.map((row) => [
        row.partida,
        row.clave,
        row.descripcion,
        row.kitBasicoComunitario,
        row.kitHospitalGeneral,
        row.kitHospitalMaterno,
        row.primerNivel,
        row.oncologicosEsenciales,
        row.cpmEstatal,
        row.existenciaAlmacenes,
        row.mesesInventario,
        row.pzasU013Emitidas,
        row.pzasFonsabiOtrosEmitidas,
        '',
        row.totalEmitido,
        row.proyeccionAbasto,
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const lastRow = rows.length;

    ws['!cols'] = [
      { wch: 16 },
      { wch: 18 },
      { wch: 64 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 },
      { wch: 18 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 18 },
    ];

    ws['!merges'] = [
      XLSX.utils.decode_range('A1:P1'),
      XLSX.utils.decode_range('E3:F3'),
      XLSX.utils.decode_range('J4:K4'),
      XLSX.utils.decode_range('J5:K5'),
      XLSX.utils.decode_range('J6:K6'),
    ];

    ws['!autofilter'] = { ref: `A8:P${lastRow}` };

    const titleStyle: XLSX.CellObject['s'] = {
      font: { bold: true, sz: 14 },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    const headerStyle: XLSX.CellObject['s'] = {
      font: { bold: true },
      fill: { fgColor: { rgb: 'D9EAD3' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: '777777' } },
        bottom: { style: 'thin', color: { rgb: '777777' } },
        left: { style: 'thin', color: { rgb: '777777' } },
        right: { style: 'thin', color: { rgb: '777777' } },
      },
    };
    const metricLabelStyle: XLSX.CellObject['s'] = {
      font: { bold: true },
      alignment: { horizontal: 'right' },
    };

    this.addCellStyle(ws, 'A1', titleStyle);
    this.addRangeStyle(ws, XLSX.utils.decode_range('A8:P8'), headerStyle);
    this.addRangeStyle(ws, XLSX.utils.decode_range('E3:E6'), metricLabelStyle);
    this.addRangeStyle(ws, XLSX.utils.decode_range('J4:J6'), metricLabelStyle);

    for (let rowIndex = 9; rowIndex <= lastRow; rowIndex += 1) {
      for (const col of ['K', 'P']) {
        const cell = ws[`${col}${rowIndex}`];
        if (cell && cell.v !== null && cell.v !== undefined && cell.v !== '') {
          cell.z = '0.00';
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Catalogo de claves');

    return XLSX.write(wb, {
      bookType: 'xlsx',
      type: 'buffer',
    }) as Buffer;
  }
}
