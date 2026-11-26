import ExcelJS from 'exceljs';
import RhAsistenciaService, {
  type RhAsistenciaResumenMensual,
  type RhAsistenciaSeguimientoItem,
  type RhAsistenciaSituacionFiltro,
} from './rh-asistencia.service';
import { RhHttpError } from './rh.service';

const MESES_NOMBRES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function formatCellEstado(item: RhAsistenciaSeguimientoItem | undefined): string {
  if (!item) return 'SIN_REGISTRO';
  if (item.estado_control === 'RECIBIDA') {
    return item.origen_registro === 'MIGRACION_HISTORICA_EXCEL'
      ? 'RECIBIDA (Histórica)'
      : 'RECIBIDA';
  }
  if (item.estado_control) {
    return item.estado_control;
  }
  return item.situacion_seguimiento === 'ELEGIBILIDAD_INCIERTA'
    ? 'ELEGIBILIDAD_INCIERTA'
    : 'SIN_REGISTRO';
}

function formatSituacionActual(activo: boolean, fechaBaja: string | null): string {
  if (activo && !fechaBaja) return 'Activo';
  if (!activo || fechaBaja) return 'Baja';
  return 'No determinada';
}

export default class RhAsistenciaReporteService {
  private readonly asistenciaService = new RhAsistenciaService();

  async generarReporteAnualXlsx(params: {
    anio: number;
    unidadId?: number | null;
    situacion?: RhAsistenciaSituacionFiltro | null;
  }): Promise<{ buffer: Buffer; fileName: string }> {
    if (!Number.isInteger(params.anio) || params.anio < 2020 || params.anio > 2100) {
      throw new RhHttpError(400, 'El parámetro "anio" debe ser un entero entre 2020 y 2100');
    }

    const situacion: RhAsistenciaSituacionFiltro = params.situacion ?? 'TODOS';
    const unidadId = params.unidadId ?? null;

    // Consultar los 12 meses completos (todas las páginas, sin limitar a página 1)
    const personasMap = new Map<
      number,
      {
        persona_id: number;
        nombre_completo: string;
        puesto_referencia: string | null;
        unidad_medica_nombre: string | null;
        activo_actual: boolean;
        fecha_baja: string | null;
        meses: Map<number, RhAsistenciaSeguimientoItem>;
      }
    >();

    const resumenesMensuales: Array<{ mes: number; resumen: RhAsistenciaResumenMensual }> = [];

    for (let mes = 1; mes <= 12; mes++) {
      let page = 1;
      const pageSize = 100;
      let fetched = 0;
      let total = 0;
      let mesResumen: RhAsistenciaResumenMensual | null = null;

      do {
        const resp = await this.asistenciaService.getSeguimientoMensual({
          anio: params.anio,
          mes,
          unidadId,
          situacion,
          page,
          pageSize,
        });
        if (!mesResumen) mesResumen = resp.resumen;
        const items = resp.items ?? [];
        for (const item of items) {
          let entry = personasMap.get(item.persona_id);
          if (!entry) {
            entry = {
              persona_id: item.persona_id,
              nombre_completo: item.nombre_completo,
              puesto_referencia: item.puesto_referencia,
              unidad_medica_nombre: item.unidad_medica_nombre,
              activo_actual: item.activo_actual,
              fecha_baja: item.fecha_baja,
              meses: new Map(),
            };
            personasMap.set(item.persona_id, entry);
          }
          entry.meses.set(mes, item);
        }
        fetched += items.length;
        total = resp.total;
        if (items.length === 0) break;
        page++;
      } while (fetched < total);

      if (mesResumen) {
        resumenesMensuales.push({ mes, resumen: mesResumen });
      }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IMSS-Bienestar RH';
    workbook.created = new Date();

    const fechaGeneracion = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Tijuana',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());

    // =========================================================================
    // HOJA 1: Control anual
    // =========================================================================
    const wsAnual = workbook.addWorksheet('Control anual');
    wsAnual.addRow([`Control anual de listas de asistencia — Año ${params.anio}`]);
    wsAnual.addRow([
      `Unidad / Ámbito: ${unidadId ? `Unidad #${unidadId}` : 'Todas las unidades'}`,
      `Situación: ${situacion}`,
      `Generado (BC): ${fechaGeneracion}`,
    ]);
    wsAnual.addRow([
      'Leyenda: RECIBIDA = Confirmada en sistema | RECIBIDA (Histórica) = Migración Excel 2026 (fecha original no disponible) | PENDIENTE = Pendiente explícito | ENTREGADA_DECLARADA = Sin confirmar RH | OBSERVADA = Con observaciones | NO_APLICA = Excepción documentada | SIN_REGISTRO = Sin fila de control (no equivale a incumplimiento) | ELEGIBILIDAD_INCIERTA = Requiere verificación.',
    ]);
    wsAnual.addRow([]);

    const headerRow = wsAnual.addRow([
      'ID',
      'Nombre completo',
      'Puesto de referencia',
      'Unidad de referencia',
      'Situación actual',
      ...MESES_NOMBRES,
    ]);
    headerRow.font = { bold: true };

    const sortedPersonas = Array.from(personasMap.values()).sort((a, b) =>
      a.nombre_completo.localeCompare(b.nombre_completo, 'es')
    );

    for (const p of sortedPersonas) {
      const monthCells = Array.from({ length: 12 }, (_, idx) =>
        formatCellEstado(p.meses.get(idx + 1))
      );
      wsAnual.addRow([
        p.persona_id,
        p.nombre_completo,
        p.puesto_referencia ?? '',
        p.unidad_medica_nombre ?? 'Sin unidad',
        formatSituacionActual(p.activo_actual, p.fecha_baja),
        ...monthCells,
      ]);
    }

    wsAnual.columns.forEach((col, i) => {
      col.width = i === 1 ? 34 : i === 2 || i === 3 ? 28 : i >= 5 ? 20 : 14;
    });

    // =========================================================================
    // HOJA 2: Resumen mensual
    // =========================================================================
    const wsResumen = workbook.addWorksheet('Resumen mensual');
    wsResumen.addRow([`Resumen mensual de asistencia — Año ${params.anio}`]);
    wsResumen.addRow([
      `Unidad / Ámbito: ${unidadId ? `Unidad #${unidadId}` : 'Todas las unidades'}`,
      `Situación: ${situacion}`,
      `Generado (BC): ${fechaGeneracion}`,
    ]);
    wsResumen.addRow([]);

    const resHeader = wsResumen.addRow([
      'Mes',
      'Personas consideradas',
      'Recepciones confirmadas',
      'Pendientes explícitos',
      'Declaradas sin confirmar',
      'Observadas',
      'No aplicables',
      'Sin registro',
      'Elegibilidad incierta',
      'Universo evaluable',
      '% Recepción sobre evaluable',
      'Alcance / Nota',
    ]);
    resHeader.font = { bold: true };

    for (const { mes, resumen } of resumenesMensuales) {
      wsResumen.addRow([
        MESES_NOMBRES[mes - 1],
        resumen.total_personas_evaluadas,
        resumen.recepciones_confirmadas,
        resumen.pendientes_explicitas,
        resumen.declaradas_no_confirmadas,
        resumen.observadas,
        resumen.no_aplicables_documentadas,
        resumen.sin_registro_control,
        resumen.elegibilidad_incierta,
        resumen.universo_evaluable_referencia,
        resumen.porcentaje_recepcion_sobre_evaluable !== null
          ? `${resumen.porcentaje_recepcion_sobre_evaluable}%`
          : 'N/A',
        resumen.denominador_nota,
      ]);
    }

    wsResumen.columns.forEach((col, i) => {
      col.width = i === 11 ? 56 : 20;
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `control-asistencias-${params.anio}-${situacion.toLowerCase()}.xlsx`;
    return { buffer, fileName };
  }
}
