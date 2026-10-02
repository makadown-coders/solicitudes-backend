import { versionReporte } from './reporteRadarVersion';
import RadarAbastoService from './radar-abasto.service';
import ReporteRadarSemanalExcel from './reporteRadarSemanal.excel';

type FuenteRadar = Pick<RadarAbastoService, 'listarGlobalV2' | 'exportarGlobalV2Detalles'>;

export class ReporteRadarError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export default class ReporteRadarSemanalService {
  // Compartido entre controladores/instancias del servicio dentro del mismo proceso.
  private static ocupado = false;

  private async exclusivo<T>(tarea: () => Promise<T>): Promise<T> {
    if (ReporteRadarSemanalService.ocupado) {
      throw new ReporteRadarError(503, 'reporte_radar_ocupado', 'Ya se está preparando un reporte del radar. Intente nuevamente en unos segundos.');
    }
    ReporteRadarSemanalService.ocupado = true;
    try { return await tarea(); }
    finally { ReporteRadarSemanalService.ocupado = false; }
  }

  constructor(private readonly radar: FuenteRadar = new RadarAbastoService()) {}

  private async consultar(months: number) {
    const out = await this.radar.listarGlobalV2({ months, page: 1, pageSize: 50000, export: true });
    if (out.truncated || out.total !== out.data.length) {
      throw new ReporteRadarError(422, 'reporte_radar_incompleto', 'El radar supera el límite de 50,000 filas o cambió durante la consulta. No se generó un reporte parcial.');
    }
    const pares = out.data.filter(row => row.salida_posterior || row.ordenes_pendientes > 0 || row.recepciones_recientes > 0)
      .map(row => ({ cluesimb: row.cluesimb, clave: row.clave }));
    const evidencia = pares.length
      ? await this.radar.exportarGlobalV2Detalles(pares, months)
      : { salidas: [], ordenes: [] };
    const generadoEn = new Date().toISOString();
    const fechaGeneracion = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(generadoEn));
    return { out, evidencia, generadoEn, fechaGeneracion,
      nombreArchivo: `radar_demanda_cobertura_${fechaGeneracion.replace(/-/g, '')}.xlsx` };
  }

  private async preparar(months: number) {
    const { out, evidencia, generadoEn, fechaGeneracion, nombreArchivo } = await this.consultar(months);
    const versionDatos = await versionReporte({ months, out, evidencia });
    const unidades = new Map<string, {
      clues: string; unidad: string; clavesSolicitadas: number; sinExistencia: number;
      requiereSeguimiento: number; fueraUmbralSinSalida: number;
    }>();
    for (const row of out.data) {
      const unidad = unidades.get(row.cluesimb) ?? {
        clues: row.cluesimb, unidad: row.nombre_de_unidad?.trim() || 'UNIDAD SIN NOMBRE',
        clavesSolicitadas: 0, sinExistencia: 0, requiereSeguimiento: 0, fueraUmbralSinSalida: 0
      };
      if (row.solicitado_periodo > 0) {
        unidad.clavesSolicitadas++;
        if (row.existencia_actual <= 0) unidad.sinExistencia++;
      }
      if (row.segmento === 'CRITICA_CPM' || row.estado_operativo === 'FUERA_UMBRAL_SIN_SALIDA' || row.ordenes_vencidas > 0) unidad.requiereSeguimiento++;
      if (row.estado_operativo === 'FUERA_UMBRAL_SIN_SALIDA') unidad.fueraUmbralSinSalida++;
      unidades.set(row.cluesimb, unidad);
    }
    const hospitales = Array.from(unidades.values()).sort((a, b) => a.unidad.localeCompare(b.unidad, 'es') || a.clues.localeCompare(b.clues));
    const fechasSnapshot = Array.from(new Set(out.data.map(row => row.snapshot_existencias).filter((fecha): fecha is string => Boolean(fecha)))).sort();
    const advertencias = [
      'Información de prueba: las solicitudes provienen de registros asociados a LOS EXCELES GENERADOS CON LA HERRAMIENTA DE SOLICITUDES; no acreditan recepción, autorización, procesamiento ni surtimiento por Abasto y/o Almacenes.',
      'La fecha de generación no es un corte común de todas las fuentes. Las fechas del snapshot de existencias se muestran en el Excel; no son existencias históricas ni en tiempo real.',
      'Sin solicitud observada no significa que la unidad no necesite la clave.',
      'Una salida posterior no confirma recepción ni atención completa. Las órdenes pendientes y la cobertura proyectada no equivalen a existencia disponible.',
      'La vigencia operativa es de 14 días; el periodo de demanda histórica es independiente.',
      'Los cruces se consultan en momentos próximos, sin un snapshot transaccional único. La versión verifica coincidencia entre las dos consultas del flujo.'
    ];
    if (!out.data.length) advertencias.push('No se encontraron registros para el periodo consultado.');
    if (out.data.some(row => !row.snapshot_existencias)) advertencias.push('Hay registros sin fecha de snapshot de existencias disponible.');
    const reporte = {
      ok: true as const, piloto: true as const, generadoEn, fechaGeneracion, zonaHoraria: 'America/Tijuana',
      months, versionDatos,
      nombreArchivo,
      asuntoCorreo: `[PILOTO · Información de prueba] Radar de demanda y cobertura | ${fechaGeneracion}`,
      resumen: { unidades: hospitales.length, registrosUnidadClave: out.total,
        registrosConSeguimiento: hospitales.reduce((sum, item) => sum + item.requiereSeguimiento, 0),
        segmentos: out.summary },
      fechasSnapshotExistencias: fechasSnapshot,
      hospitales,
      tablaCorreo: hospitales.map(item => ({
        Unidad: item.unidad, CLUES: item.clues, 'Claves solicitadas': item.clavesSolicitadas,
        'Solicitadas sin existencia': item.sinExistencia, 'Claves con seguimiento': item.requiereSeguimiento,
        'Fuera de umbral sin salida': item.fueraUmbralSinSalida
      })),
      correo: {
        encabezadoHtml: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#243746;line-height:1.6;max-width:1000px"><h2 style="color:#176b58">Radar de demanda y cobertura</h2><p><strong>PILOTO SEMANAL · INFORMACIÓN DE PRUEBA</strong></p><p>Buen día:</p><p>Les compartimos este reporte para apoyar la revisión y el seguimiento de claves por unidad médica.</p><p style="background:#fff5dc;padding:16px"><strong>La información de solicitudes proviene de los registros asociados a LOS EXCELES GENERADOS CON LA HERRAMIENTA DE SOLICITUDES.</strong> Generar un Excel no acredita que la solicitud haya sido recibida, procesada o surtida por Abasto y/o Almacenes.</p><p>La estructura ilustra cómo podría presentarse el análisis si se integrara el registro de cada solicitud efectivamente procesada por las áreas responsables. Esa integración aún no forma parte de este piloto.</p><p><strong>Periodo analizado:</strong> últimos ${months} meses. <strong>Generado:</strong> ${generadoEn} (UTC). El envío semanal no limita el análisis a la última semana.</p><h3>Resumen por unidad</h3><p>Las cifras cuentan combinaciones unidad–clave. “Solicitadas sin existencia” es un subconjunto de las claves solicitadas; “Claves con seguimiento” considera todo el universo del radar.</p>${out.total ? '' : '<p><strong>Sin registros para el periodo consultado.</strong></p>'}`,
        notaMetodologicaHtml: `<h3>Cómo revisar el archivo</h3><p>Comiencen por “Guía y alcance”, “Resumen por unidad” y “Radar”, especialmente las columnas “Requiere seguimiento” y “Motivos de seguimiento”.</p><ul>${advertencias.map(texto => `<li>${texto}</li>`).join('')}</ul><p>La cobertura en CPM es existencia / CPM; los días estimados corresponden a ese valor multiplicado por 30 cuando el CPM es mensual.</p><p>Agradeceremos sus comentarios sobre la claridad del reporte, las claves que requieren revisión y las diferencias respecto de sus registros. Su retroalimentación permitirá ajustar este ejercicio antes de considerar un uso operativo.</p><p>Muchas gracias por su colaboración.<br>Seguimiento de abasto · Prueba piloto</p></div>`
      },
      advertencias
    };
    return { out, evidencia, reporte };
  }

  async obtenerReporte(months: number) {
    return this.exclusivo(async () => (await this.preparar(months)).reporte);
  }

  async generarExcel(months: number, versionDatos?: string) {
    return this.exclusivo(async () => {
      const { out, evidencia, generadoEn, fechaGeneracion, nombreArchivo } = await this.consultar(months);
      // La descarga directa no prepara JSON, HTML ni hash. Se conserva la validación
      // únicamente para clientes anteriores que envíen versionDatos explícitamente.
      const versionActual = versionDatos ? await versionReporte({ months, out, evidencia }) : undefined;
      if (versionDatos && versionDatos !== versionActual) {
        throw new ReporteRadarError(409, 'reporte_radar_actualizado', 'Los datos cambiaron desde la consulta JSON. Vuelva a ejecutar el flujo completo antes de enviar el correo.');
      }
      const archivo = await new ReporteRadarSemanalExcel(months, generadoEn).generar(out, evidencia);
      return { ...archivo, reporte: { nombreArchivo, generadoEn, fechaGeneracion, versionDatos: versionActual } };
    });
  }
}
