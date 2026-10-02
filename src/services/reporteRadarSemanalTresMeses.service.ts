import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { RadarGlobalV2Row } from '../models/radar-abasto/RadarGlobalV2Row';
import ReporteRadarSemanalExcel, { ResumenRadarPaginado } from './reporteRadarSemanal.excel';
import { ReporteRadarError } from './reporteRadarSemanal.service';

const TAMANO_LOTE = 500;

export default class ReporteRadarSemanalTresMesesService {
  private static ocupado = false;

  async generarExcel() {
    if (ReporteRadarSemanalTresMesesService.ocupado) {
      throw new ReporteRadarError(503, 'reporte_radar_ocupado', 'Ya se está preparando un reporte del radar. Intente nuevamente en unos segundos.');
    }
    ReporteRadarSemanalTresMesesService.ocupado = true;
    const inicio = Date.now();
    try {
      const resumen = await this.consultarResumen();
      if (resumen.total > 50000) {
        throw new ReporteRadarError(422, 'reporte_radar_incompleto', 'El radar supera el límite de 50,000 filas. No se generó un reporte parcial.');
      }
      this.registrarMemoria('resumen consultado', inicio, { radar: resumen.total });
      const generadoEn = new Date().toISOString();
      const fechaGeneracion = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date(generadoEn));
      const nombreArchivo = `radar_demanda_cobertura_${fechaGeneracion.replace(/-/g, '')}.xlsx`;
      const archivo = await new ReporteRadarSemanalExcel(3, generadoEn).generarPaginado(resumen, {
        radar: this.filasRadar(), salidas: this.filasSalidas(), ordenes: this.filasOrdenes()
      });
      this.registrarMemoria('excel generado', inicio, { radar: resumen.total });
      return { ...archivo, reporte: { nombreArchivo, generadoEn, fechaGeneracion, versionDatos: undefined } };
    } finally {
      ReporteRadarSemanalTresMesesService.ocupado = false;
    }
  }

  private async consultarResumen(): Promise<ResumenRadarPaginado> {
    const conteos = await pool.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE segmento = 'CRITICA_CPM')::int AS criticas_cpm,
        COUNT(*) FILTER (WHERE segmento = 'ATENCION_CPM')::int AS atencion_cpm,
        COUNT(*) FILTER (WHERE segmento = 'DEMANDA_SIN_CPM')::int AS demanda_sin_cpm,
        COUNT(*) FILTER (WHERE segmento = 'CPM_SIN_SOLICITUD')::int AS cpm_sin_solicitud,
        COUNT(*) FILTER (WHERE segmento = 'CUBIERTA')::int AS cubiertas,
        COUNT(*) FILTER (WHERE estado_operativo = 'VIGENTE_EN_PROCESO')::int AS vigente_en_proceso,
        COUNT(*) FILTER (WHERE estado_operativo = 'VIGENTE_CON_SALIDA')::int AS vigente_con_salida,
        COUNT(*) FILTER (WHERE estado_operativo = 'FUERA_UMBRAL_SIN_SALIDA')::int AS fuera_umbral_sin_salida,
        COUNT(*) FILTER (WHERE estado_operativo = 'HISTORICA_CON_SALIDA')::int AS historica_con_salida,
        COUNT(*) FILTER (WHERE estado_operativo = 'SIN_SOLICITUD_OBSERVADA')::int AS sin_solicitud_observada,
        COUNT(*) FILTER (WHERE ordenes_vencidas > 0)::int AS con_ordenes_vencidas,
        COUNT(*) FILTER (WHERE salida_posterior)::int AS con_salida_posterior
      FROM public.mv_reporte_radar_semanal_3m`);
    const unidades = await pool.query(`
      SELECT COALESCE(NULLIF(TRIM(nombre_de_unidad), ''), 'UNIDAD SIN NOMBRE') || ' · ' || cluesimb AS unidad,
        COUNT(DISTINCT clave) FILTER (WHERE solicitado_periodo > 0)::int AS claves_solicitadas,
        COUNT(DISTINCT clave) FILTER (WHERE solicitado_periodo > 0 AND existencia_actual <= 0)::int AS sin_existencia
      FROM public.mv_reporte_radar_semanal_3m
      GROUP BY cluesimb, nombre_de_unidad
      HAVING COUNT(*) FILTER (WHERE solicitado_periodo > 0) > 0
      ORDER BY COALESCE(NULLIF(TRIM(nombre_de_unidad), ''), 'UNIDAD SIN NOMBRE'), cluesimb`);
    const row = conteos.rows[0] ?? {};
    return {
      total: Number(row.total ?? 0),
      segmentos: { criticas_cpm: Number(row.criticas_cpm ?? 0), atencion_cpm: Number(row.atencion_cpm ?? 0),
        demanda_sin_cpm: Number(row.demanda_sin_cpm ?? 0), cpm_sin_solicitud: Number(row.cpm_sin_solicitud ?? 0),
        cubiertas: Number(row.cubiertas ?? 0) },
      estados: { VIGENTE_EN_PROCESO: Number(row.vigente_en_proceso ?? 0),
        VIGENTE_CON_SALIDA: Number(row.vigente_con_salida ?? 0),
        FUERA_UMBRAL_SIN_SALIDA: Number(row.fuera_umbral_sin_salida ?? 0),
        HISTORICA_CON_SALIDA: Number(row.historica_con_salida ?? 0),
        SIN_SOLICITUD_OBSERVADA: Number(row.sin_solicitud_observada ?? 0) },
      fueraUmbralSinSalida: Number(row.fuera_umbral_sin_salida ?? 0),
      conOrdenesVencidas: Number(row.con_ordenes_vencidas ?? 0),
      conSalidaPosterior: Number(row.con_salida_posterior ?? 0),
      unidades: unidades.rows.map(item => ({ unidad: String(item.unidad),
        clavesSolicitadas: Number(item.claves_solicitadas ?? 0), sinExistencia: Number(item.sin_existencia ?? 0) }))
    };
  }

  private async *filasRadar(): AsyncGenerator<RadarGlobalV2Row> {
    for await (const row of this.consultarPorLotes('cursor_radar_3m', `SELECT * FROM public.mv_reporte_radar_semanal_3m
      ORDER BY prioridad DESC, frecuencia_solicitud DESC, solicitado_periodo DESC, cluesimb, clave`)) {
      yield this.mapearRadar(row);
    }
  }

  private async *filasSalidas(): AsyncGenerator<any> {
    for await (const row of this.consultarPorLotes('cursor_salidas_radar_3m', `SELECT s.*, r.nombre_de_unidad, r.descripcion
      FROM public.mv_reporte_radar_semanal_3m_salidas s
      JOIN public.mv_reporte_radar_semanal_3m r ON r.cluesimb = s.cluesimb AND r.clave = s.clave
      ORDER BY s.cluesimb, s.clave, s.fecha_entregado DESC, s.id DESC`)) {
      row.id = Number(row.id); row.cantidad = Number(row.cantidad ?? 0); yield row;
    }
  }

  private async *filasOrdenes(): AsyncGenerator<any> {
    for await (const row of this.consultarPorLotes('cursor_ordenes_radar_3m', `SELECT o.*, r.nombre_de_unidad, r.descripcion
      FROM public.mv_reporte_radar_semanal_3m_ordenes o
      JOIN public.mv_reporte_radar_semanal_3m r ON r.cluesimb = o.cluesimb AND r.clave = o.clave
      ORDER BY o.cluesimb, o.clave, o.fecha_limite_de_entrega DESC NULLS LAST`)) {
      row.piezas_emitidas = Number(row.piezas_emitidas ?? 0);
      row.piezas_recibidas = Number(row.piezas_recibidas ?? 0);
      row.piezas_pendientes = Number(row.piezas_pendientes ?? 0);
      yield row;
    }
  }

  private async *consultarPorLotes(nombre: string, sql: string): AsyncGenerator<any> {
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query('BEGIN READ ONLY');
      await client.query(`DECLARE ${nombre} NO SCROLL CURSOR FOR ${sql}`);
      while (true) {
        const lote = await client.query(`FETCH FORWARD ${TAMANO_LOTE} FROM ${nombre}`);
        if (!lote.rows.length) break;
        for (const row of lote.rows) yield row;
        if (lote.rows.length < TAMANO_LOTE) break;
      }
    } finally {
      if (client) { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
    }
  }

  private mapearRadar = (row: any): RadarGlobalV2Row => ({
    cluesimb: String(row.cluesimb ?? ''), nombre_de_unidad: row.nombre_de_unidad ?? null,
    clave: String(row.clave ?? ''), descripcion: row.descripcion ?? null,
    cpm: Number(row.cpm ?? 0), en_cpm: Boolean(row.en_cpm), existencia_actual: Number(row.existencia_actual ?? 0),
    snapshot_existencias: row.snapshot_existencias ? new Date(row.snapshot_existencias).toISOString() : null,
    cobertura_cpm: row.cobertura_cpm == null ? null : Number(row.cobertura_cpm),
    cobertura_dias: row.cobertura_dias == null ? null : Number(row.cobertura_dias),
    solicitado_periodo: Number(row.solicitado_periodo ?? 0), ciclos_con_clave: Number(row.ciclos_con_clave ?? 0),
    ciclos_unidad: Number(row.ciclos_unidad ?? 0), frecuencia_solicitud: Number(row.frecuencia_solicitud ?? 0),
    primera_solicitud: this.fecha(row.primera_solicitud), ultima_solicitud: this.fecha(row.ultima_solicitud),
    solicitado_vigente: Number(row.solicitado_vigente ?? 0), ciclos_vigentes: Number(row.ciclos_vigentes ?? 0),
    solicitud_vigente: Boolean(row.solicitud_vigente),
    dias_desde_ultima_solicitud: row.dias_desde_ultima_solicitud == null ? null : Number(row.dias_desde_ultima_solicitud),
    fecha_fin_umbral: this.fecha(row.fecha_fin_umbral),
    dias_restantes_umbral: row.dias_restantes_umbral == null ? null : Number(row.dias_restantes_umbral),
    salida_posterior: Boolean(row.salida_posterior), piezas_salida_posterior: Number(row.piezas_salida_posterior ?? 0),
    ultima_salida_posterior: this.fecha(row.ultima_salida_posterior), estado_operativo: row.estado_operativo,
    homologos_disponibles: Number(row.homologos_disponibles ?? 0),
    existencia_homologos_equivalente: Number(row.existencia_homologos_equivalente ?? 0), mejor_homologo: row.mejor_homologo ?? null,
    ordenes_pendientes: Number(row.ordenes_pendientes ?? 0), piezas_pendientes: Number(row.piezas_pendientes ?? 0),
    ordenes_por_vencer: Number(row.ordenes_por_vencer ?? 0), ordenes_vencidas: Number(row.ordenes_vencidas ?? 0),
    recepciones_recientes: Number(row.recepciones_recientes ?? 0),
    piezas_recibidas_recientes: Number(row.piezas_recibidas_recientes ?? 0),
    proxima_entrega: this.fecha(row.proxima_entrega), cobertura_proyectada: Number(row.cobertura_proyectada ?? 0),
    cobertura_proyectada_cpm: row.cobertura_proyectada_cpm == null ? null : Number(row.cobertura_proyectada_cpm),
    segmento: row.segmento, prioridad: Number(row.prioridad ?? 0), razones: Array.isArray(row.razones) ? row.razones : []
  });

  private fecha(value: any): string | null {
    return value?.toISOString?.().slice(0, 10) ?? (value == null ? null : String(value).slice(0, 10));
  }

  private registrarMemoria(etapa: string, inicio: number, extra: Record<string, number>): void {
    const memoria = process.memoryUsage();
    console.info('Reporte radar semanal 3m', { etapa, duracionMs: Date.now() - inicio,
      rssMiB: Math.round(memoria.rss / 2 ** 20), heapMiB: Math.round(memoria.heapUsed / 2 ** 20), ...extra });
  }
}
