import { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { pool } from '../db/pool';
import { RadarGlobalV2Row } from '../models/radar-abasto/RadarGlobalV2Row';
import ReporteRadarSemanalExcel, { ResumenRadarPaginado } from './reporteRadarSemanal.excel';
import { ReporteRadarError } from './reporteRadarSemanal.service';

const TAMANO_LOTE = 500;

export default class ReporteRadarSemanalUnMesService {
  private static ocupado = false;
  private static preparado?: Awaited<ReturnType<ReporteRadarSemanalUnMesService['generarNuevo']>>;
  private static errorPreparacion?: string;

  estado() {
    const preparado = ReporteRadarSemanalUnMesService.preparado;
    return { ok: true as const, procesando: ReporteRadarSemanalUnMesService.ocupado,
      listo: Boolean(preparado) && !ReporteRadarSemanalUnMesService.ocupado,
      nombreArchivo: preparado?.reporte.nombreArchivo, generadoEn: preparado?.reporte.generadoEn };
  }

  preparar() {
    if (!ReporteRadarSemanalUnMesService.ocupado) {
      ReporteRadarSemanalUnMesService.errorPreparacion = undefined;
      void this.generarNuevo().then(async nuevo => {
        const anterior = ReporteRadarSemanalUnMesService.preparado;
        ReporteRadarSemanalUnMesService.preparado = nuevo;
        if (anterior) await anterior.limpiar().catch(() => undefined);
      }).catch(error => {
        ReporteRadarSemanalUnMesService.errorPreparacion = error instanceof Error ? error.message : String(error);
        console.error('Error al preparar reporte radar semanal 1m', error);
      });
    }
    return { status: 202, ...this.estado() };
  }

  async generarExcel() {
    const preparado = ReporteRadarSemanalUnMesService.preparado;
    if (preparado) return { ...preparado, limpiar: async () => undefined };
    return this.generarNuevo();
  }

  /** Resumen ligero para el cuerpo del correo; nunca carga el detalle unidad-clave. */
  async obtenerReporte() {
    const resumen = await this.consultarResumen();
    const snapshots = await pool.query<{ snapshot: Date | string }>(`
      SELECT DISTINCT snapshot_existencias AS snapshot
      FROM public.mv_reporte_radar_semanal_1m
      WHERE snapshot_existencias IS NOT NULL
      ORDER BY snapshot_existencias
    `);
    const generadoEn = new Date().toISOString();
    const fechaGeneracion = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(generadoEn));
    const fechasSnapshotExistencias = snapshots.rows.map(row => new Date(row.snapshot).toISOString());
    const hospitales = resumen.unidades.map(item => ({
      clues: item.clues ?? '', unidad: item.nombreUnidad ?? item.unidad,
      clavesSolicitadas: item.clavesSolicitadas, sinExistencia: item.sinExistencia,
      requiereSeguimiento: item.requiereSeguimiento ?? 0,
      fueraUmbralSinSalida: item.fueraUmbralSinSalida ?? 0,
    }));
    const versionDatos = createHash('sha256').update(JSON.stringify({
      totalUniverso: resumen.totalUniverso, totalOperativo: resumen.total,
      segmentos: resumen.segmentos, estados: resumen.estados,
      hospitales, fechasSnapshotExistencias,
    })).digest('hex');
    const advertencias = [
      'Información de prueba: las solicitudes provienen de registros asociados a los Excel generados con la herramienta de solicitudes; no acreditan recepción, autorización, procesamiento ni surtimiento por Abasto y/o Almacenes.',
      'La fecha de generación no es un corte común de todas las fuentes. Las fechas del snapshot de existencias se muestran en el Excel; no son existencias históricas ni en tiempo real.',
      'Sin solicitud observada no significa que la unidad no necesite la clave.',
      'Una salida posterior no confirma recepción ni atención completa. Las órdenes pendientes y la cobertura proyectada no equivalen a existencia disponible.',
      'El Excel detalla el perfil operativo; CPM sin solicitud, cubiertas y por observar permanecen contabilizados en el resumen.',
    ];
    if (!(resumen.totalUniverso ?? 0)) advertencias.push('No se encontraron registros en la fotografía mensual consultada.');
    return {
      ok: true as const, piloto: true as const, generadoEn, fechaGeneracion,
      zonaHoraria: 'America/Tijuana', months: 1, versionDatos,
      nombreArchivo: `radar_demanda_cobertura_${fechaGeneracion.replace(/-/g, '')}.xlsx`,
      asuntoCorreo: `[PILOTO · Información de prueba] Radar de demanda y cobertura | ${fechaGeneracion}`,
      resumen: {
        unidades: hospitales.length,
        registrosUnidadClave: resumen.totalUniverso ?? resumen.total,
        registrosConSeguimiento: hospitales.reduce((sum, item) => sum + item.requiereSeguimiento, 0),
        segmentos: resumen.segmentos,
      },
      fechasSnapshotExistencias, hospitales,
      tablaCorreo: hospitales.map(item => ({
        Unidad: item.unidad, CLUES: item.clues,
        'Claves solicitadas': item.clavesSolicitadas,
        'Solicitadas sin existencia': item.sinExistencia,
        'Claves con seguimiento': item.requiereSeguimiento,
        'Fuera de umbral sin salida': item.fueraUmbralSinSalida,
      })),
      correo: {
        encabezadoHtml: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#243746;line-height:1.6;max-width:1000px"><h2 style="color:#176b58">Radar de demanda y cobertura</h2><p><strong>PILOTO SEMANAL · INFORMACIÓN DE PRUEBA</strong></p><p>Buen día:</p><p>Les compartimos este reporte para apoyar la revisión y el seguimiento de claves por unidad médica.</p><p style="background:#fff5dc;padding:16px"><strong>La información de solicitudes proviene de los registros asociados a los Excel generados con la herramienta de solicitudes.</strong> Generar un Excel no acredita que la solicitud haya sido recibida, procesada o surtida por Abasto y/o Almacenes.</p><p><strong>Periodo analizado:</strong> último mes. <strong>Generado:</strong> ${generadoEn} (UTC). El envío semanal no limita el análisis a la última semana.</p><h3>Resumen por unidad</h3><p>Las cifras cuentan combinaciones unidad–clave. “Solicitadas sin existencia” es un subconjunto de las claves solicitadas.</p>`,
        notaMetodologicaHtml: `<h3>Cómo revisar el archivo</h3><p>Comiencen por “Guía y alcance”, “Resumen por unidad” y “Radar”, especialmente las columnas “Requiere seguimiento” y “Motivos de seguimiento”.</p><ul>${advertencias.map(texto => `<li>${texto}</li>`).join('')}</ul><p>La cobertura en CPM es existencia / CPM; los días estimados corresponden a ese valor multiplicado por 30 cuando el CPM es mensual.</p><p>Muchas gracias por su colaboración.<br>Seguimiento de abasto · Prueba piloto</p></div>`,
      },
      advertencias,
    };
  }

  private async generarNuevo() {
    if (ReporteRadarSemanalUnMesService.ocupado) {
      throw new ReporteRadarError(503, 'reporte_radar_ocupado', 'Ya se está preparando un reporte del radar. Intente nuevamente en unos segundos.');
    }
    ReporteRadarSemanalUnMesService.ocupado = true;
    const inicio = Date.now();
    try {
      const resumen = await this.consultarResumen();
      this.registrarMemoria('resumen consultado', inicio, { radar: resumen.total });
      const generadoEn = new Date().toISOString();
      const fechaGeneracion = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date(generadoEn));
      const nombreArchivo = `radar_demanda_cobertura_${fechaGeneracion.replace(/-/g, '')}.xlsx`;
      const archivo = await new ReporteRadarSemanalExcel(1, generadoEn).generarPaginado(resumen, {
        radar: this.filasRadar(), salidas: this.filasSalidas(), ordenes: this.filasOrdenes()
      });
      this.registrarMemoria('excel generado', inicio, { radar: resumen.total });
      return { ...archivo, reporte: { nombreArchivo, generadoEn, fechaGeneracion, versionDatos: undefined } };
    } finally {
      ReporteRadarSemanalUnMesService.ocupado = false;
    }
  }

  private async consultarResumen(): Promise<ResumenRadarPaginado> {
    const conteos = await pool.query(`
      SELECT COUNT(*)::int AS total_universo,
        COUNT(*) FILTER (WHERE
          segmento IN ('CRITICA_CPM', 'ATENCION_CPM', 'DEMANDA_SIN_CPM')
          OR estado_operativo IN ('VIGENTE_EN_PROCESO', 'FUERA_UMBRAL_SIN_SALIDA')
          OR ordenes_vencidas > 0
        )::int AS total,
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
      FROM public.mv_reporte_radar_semanal_1m`);
    const unidades = await pool.query(`
      SELECT cluesimb,
        COALESCE(NULLIF(TRIM(nombre_de_unidad), ''), 'UNIDAD SIN NOMBRE') AS nombre_unidad,
        COALESCE(NULLIF(TRIM(nombre_de_unidad), ''), 'UNIDAD SIN NOMBRE') || ' · ' || cluesimb AS unidad,
        COUNT(DISTINCT clave) FILTER (WHERE solicitado_periodo > 0)::int AS claves_solicitadas,
        COUNT(DISTINCT clave) FILTER (WHERE solicitado_periodo > 0 AND existencia_actual <= 0)::int AS sin_existencia,
        COUNT(*) FILTER (WHERE segmento = 'CRITICA_CPM'
          OR estado_operativo = 'FUERA_UMBRAL_SIN_SALIDA'
          OR ordenes_vencidas > 0)::int AS requiere_seguimiento,
        COUNT(*) FILTER (WHERE estado_operativo = 'FUERA_UMBRAL_SIN_SALIDA')::int AS fuera_umbral_sin_salida
      FROM public.mv_reporte_radar_semanal_1m
      GROUP BY cluesimb, nombre_de_unidad
      ORDER BY COALESCE(NULLIF(TRIM(nombre_de_unidad), ''), 'UNIDAD SIN NOMBRE'), cluesimb`);
    const unidadesSinSolicitud = await pool.query(`
      SELECT cluesimb, nombre_de_unidad, jurisdiccion, es_segundo_nivel,
             tipo_unidad, ultima_solicitud_registrada
      FROM public.mv_reporte_radar_semanal_1m_unidades_sin_solicitud
      ORDER BY jurisdiccion NULLS LAST, nombre_de_unidad, cluesimb`);
    const row = conteos.rows[0] ?? {};
    return {
      total: Number(row.total ?? 0),
      totalUniverso: Number(row.total_universo ?? 0),
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
        clues: String(item.cluesimb ?? ''), nombreUnidad: String(item.nombre_unidad ?? 'UNIDAD SIN NOMBRE'),
        clavesSolicitadas: Number(item.claves_solicitadas ?? 0), sinExistencia: Number(item.sin_existencia ?? 0),
        requiereSeguimiento: Number(item.requiere_seguimiento ?? 0),
        fueraUmbralSinSalida: Number(item.fuera_umbral_sin_salida ?? 0) })),
      unidadesSinSolicitud: unidadesSinSolicitud.rows.map(item => ({
        cluesimb: String(item.cluesimb ?? ''), nombre_de_unidad: item.nombre_de_unidad ?? null,
        jurisdiccion: item.jurisdiccion ?? null, es_segundo_nivel: Boolean(item.es_segundo_nivel),
        tipo_unidad: item.tipo_unidad ?? null, ultima_solicitud_registrada: this.fecha(item.ultima_solicitud_registrada)
      }))
    };
  }

  private async *filasRadar(): AsyncGenerator<RadarGlobalV2Row> {
    for await (const row of this.consultarPorLotes('cursor_radar_1m', `SELECT * FROM public.mv_reporte_radar_semanal_1m
      WHERE segmento IN ('CRITICA_CPM', 'ATENCION_CPM', 'DEMANDA_SIN_CPM')
         OR estado_operativo IN ('VIGENTE_EN_PROCESO', 'FUERA_UMBRAL_SIN_SALIDA')
         OR ordenes_vencidas > 0
      ORDER BY prioridad DESC, frecuencia_solicitud DESC, solicitado_periodo DESC, cluesimb, clave`)) {
      yield this.mapearRadar(row);
    }
  }

  private async *filasSalidas(): AsyncGenerator<any> {
    for await (const row of this.consultarPorLotes('cursor_salidas_radar_1m', `SELECT s.*, r.nombre_de_unidad, r.descripcion
      FROM public.mv_reporte_radar_semanal_1m_salidas s
      JOIN public.mv_reporte_radar_semanal_1m r ON r.cluesimb = s.cluesimb AND r.clave = s.clave
      WHERE r.segmento IN ('CRITICA_CPM', 'ATENCION_CPM', 'DEMANDA_SIN_CPM')
         OR r.estado_operativo IN ('VIGENTE_EN_PROCESO', 'FUERA_UMBRAL_SIN_SALIDA')
         OR r.ordenes_vencidas > 0
      ORDER BY s.cluesimb, s.clave, s.fecha_entregado DESC, s.id DESC`)) {
      row.id = Number(row.id); row.cantidad = Number(row.cantidad ?? 0); yield row;
    }
  }

  private async *filasOrdenes(): AsyncGenerator<any> {
    for await (const row of this.consultarPorLotes('cursor_ordenes_radar_1m', `SELECT o.*, r.nombre_de_unidad, r.descripcion
      FROM public.mv_reporte_radar_semanal_1m_ordenes o
      JOIN public.mv_reporte_radar_semanal_1m r ON r.cluesimb = o.cluesimb AND r.clave = o.clave
      WHERE r.segmento IN ('CRITICA_CPM', 'ATENCION_CPM', 'DEMANDA_SIN_CPM')
         OR r.estado_operativo IN ('VIGENTE_EN_PROCESO', 'FUERA_UMBRAL_SIN_SALIDA')
         OR r.ordenes_vencidas > 0
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
    es_segundo_nivel: Boolean(row.es_segundo_nivel),
    jurisdiccion: row.jurisdiccion ?? null,
    clave: String(row.clave ?? ''), descripcion: row.descripcion ?? null,
    cpm: Number(row.cpm ?? 0), en_cpm: Boolean(row.en_cpm), existencia_actual: Number(row.existencia_actual ?? 0),
    snapshot_existencias: row.snapshot_existencias ? new Date(row.snapshot_existencias).toISOString() : null,
    existencia_azm: Number(row.existencia_azm ?? 0), existencia_azt: Number(row.existencia_azt ?? 0),
    existencia_aze: Number(row.existencia_aze ?? 0), existencia_almacenes: Number(row.existencia_almacenes ?? 0),
    snapshot_almacenes: row.snapshot_almacenes ? new Date(row.snapshot_almacenes).toISOString() : null,
    cobertura_cpm: row.cobertura_cpm == null ? null : Number(row.cobertura_cpm),
    cobertura_dias: row.cobertura_dias == null ? null : Number(row.cobertura_dias),
    solicitado_periodo: Number(row.solicitado_periodo ?? 0),
    solicitado_ultima_solicitud: Number(row.solicitado_ultima_solicitud ?? 0),
    ciclos_con_clave: Number(row.ciclos_con_clave ?? 0),
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
    console.info('Reporte radar semanal 1m', { etapa, duracionMs: Date.now() - inicio,
      rssMiB: Math.round(memoria.rss / 2 ** 20), heapMiB: Math.round(memoria.heapUsed / 2 ** 20), ...extra });
  }
}
