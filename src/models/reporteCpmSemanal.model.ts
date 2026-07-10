export interface ReporteCpmSemanalRow {
  fecha_corte: string;
  entidad: string;
  nombre_comercial: string;
  clues_imb: string;
  total_claves_en_cpm: number;
  total_claves_en_cpm_reportando: number;
  total_claves_reportando: number;
  claves_medicamentos_010_040_ultimo: number;
  claves_material_curacion_060_ultimo: number;
  otros_03_070_080: number;
  archivo_origen: string;
}

export interface ReporteCpmInitResult {
  ok: true;
  table: string;
  truncated: boolean;
}

export interface ReporteCpmBatchResult {
  processed: number;
}
