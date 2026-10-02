import { pool } from '../db/pool';
import { RadarGlobalV2Row } from '../models/radar-abasto/RadarGlobalV2Row';
import { RadarGlobalV2OrdenRow } from '../models/radar-abasto/RadarGlobalV2OrdenRow';
import ReporteRadarSemanalExcel from './reporteRadarSemanal.excel';
import { ReporteRadarError } from './reporteRadarSemanal.service';
import { versionReporte } from './reporteRadarVersion';

type SalidaReporte = {
  cluesimb: string;
  clave: string;
  ultima_solicitud: string | null;
  id: number;
  fecha_entregado: string;
  folio: string | null;
  folio_extra: string | null;
  cantidad: number;
  tipo: string | null;
  programa: string | null;
  unidad_origen: string | null;
  unidad_destino: string | null;
};

type OrdenReporte = RadarGlobalV2OrdenRow & { cluesimb: string; clave: string };

export default class ReporteRadarSemanalTresMesesService {
  private static ocupado = false;

  async generarExcel(versionDatos?: string) {
    if (ReporteRadarSemanalTresMesesService.ocupado) {
      throw new ReporteRadarError(503, 'reporte_radar_ocupado', 'Ya se está preparando un reporte del radar. Intente nuevamente en unos segundos.');
    }
    ReporteRadarSemanalTresMesesService.ocupado = true;
    try {
      const inicio = Date.now();
      const [radarResult, salidasResult, ordenesResult] = await Promise.all([
        pool.query(`SELECT * FROM public.mv_reporte_radar_semanal_3m
          ORDER BY prioridad DESC, frecuencia_solicitud DESC, solicitado_periodo DESC, cluesimb, clave`),
        pool.query(`SELECT * FROM public.mv_reporte_radar_semanal_3m_salidas
          ORDER BY cluesimb, clave, fecha_entregado DESC, id DESC`),
        pool.query(`SELECT * FROM public.mv_reporte_radar_semanal_3m_ordenes
          ORDER BY cluesimb, clave, fecha_limite_de_entrega DESC NULLS LAST`)
      ]);
      if (radarResult.rows.length > 50000) {
        throw new ReporteRadarError(422, 'reporte_radar_incompleto', 'El radar supera el límite de 50,000 filas. No se generó un reporte parcial.');
      }

      const data = radarResult.rows.map(this.mapearRadar);
      const salidas: SalidaReporte[] = salidasResult.rows.map(row => ({
        ...row, id: Number(row.id), cantidad: Number(row.cantidad ?? 0),
        ultima_solicitud: this.fecha(row.ultima_solicitud), fecha_entregado: String(row.fecha_entregado)
      }));
      const ordenes: OrdenReporte[] = ordenesResult.rows.map(row => ({
        ...row,
        piezas_emitidas: Number(row.piezas_emitidas ?? 0),
        piezas_recibidas: Number(row.piezas_recibidas ?? 0),
        piezas_pendientes: Number(row.piezas_pendientes ?? 0)
      }));
      const summary = {
        criticas_cpm: data.filter(row => row.segmento === 'CRITICA_CPM').length,
        atencion_cpm: data.filter(row => row.segmento === 'ATENCION_CPM').length,
        demanda_sin_cpm: data.filter(row => row.segmento === 'DEMANDA_SIN_CPM').length,
        cpm_sin_solicitud: data.filter(row => row.segmento === 'CPM_SIN_SOLICITUD').length,
        cubiertas: data.filter(row => row.segmento === 'CUBIERTA').length
      };
      const out = { mode: 'radar-global-v2' as const, window: { months: 3 }, page: 1,
        pageSize: 50000, total: data.length, truncated: false, summary, data };
      const evidencia = { salidas, ordenes };
      const versionActual = versionDatos ? await versionReporte({ months: 3, out, evidencia }) : undefined;
      if (versionDatos && versionDatos !== versionActual) {
        throw new ReporteRadarError(409, 'reporte_radar_actualizado', 'Los datos cambiaron desde la consulta JSON. Vuelva a ejecutar el flujo completo antes de enviar el correo.');
      }

      const generadoEn = new Date().toISOString();
      const fechaGeneracion = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date(generadoEn));
      const nombreArchivo = `radar_demanda_cobertura_${fechaGeneracion.replace(/-/g, '')}.xlsx`;
      console.info('Reporte radar semanal 3m consultado desde vistas materializadas', {
        duracionMs: Date.now() - inicio, radar: data.length, salidas: salidas.length, ordenes: ordenes.length
      });
      const archivo = await new ReporteRadarSemanalExcel(3, generadoEn).generar(out, evidencia);
      return { ...archivo, reporte: { nombreArchivo, generadoEn, fechaGeneracion, versionDatos: versionActual } };
    } finally {
      ReporteRadarSemanalTresMesesService.ocupado = false;
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
    existencia_homologos_equivalente: Number(row.existencia_homologos_equivalente ?? 0),
    mejor_homologo: row.mejor_homologo ?? null,
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
}
