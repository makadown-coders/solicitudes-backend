// Presentación del libro equivalente a radar-global-v2 (sin filtros).
import * as XLSX from 'xlsx';
import { escribirArchivoReporte, mapearFilas, ArchivoReporte } from './reporteXlsxStream';
import { RadarGlobalV2Row } from '../models/radar-abasto/RadarGlobalV2Row';
import { RadarGlobalV2OrdenRow } from '../models/radar-abasto/RadarGlobalV2OrdenRow';
import { RadarGlobalV2Segmento, RadarGlobalV2EstadoOperativo } from '../models/radar-abasto/RadarGlobalV2Input';
import RadarAbastoService from './radar-abasto.service';

type Radar = Awaited<ReturnType<RadarAbastoService['listarGlobalV2']>>;
type Evidencia = Awaited<ReturnType<RadarAbastoService['exportarGlobalV2Detalles']>>;

export type ResumenRadarPaginado = {
  total: number;
  segmentos: Radar['summary'];
  estados: Record<RadarGlobalV2EstadoOperativo, number>;
  fueraUmbralSinSalida: number;
  conOrdenesVencidas: number;
  conSalidaPosterior: number;
  unidades: Array<{ unidad: string; clavesSolicitadas: number; sinExistencia: number }>;
};

export type FuentesRadarPaginadas = {
  radar: AsyncIterable<RadarGlobalV2Row>;
  salidas: AsyncIterable<any>;
  ordenes: AsyncIterable<any>;
};

export default class ReporteRadarSemanalExcel {
  constructor(private readonly months: number, private readonly generadoEn: string) {}
  readonly segmentos: Array<{ value: RadarGlobalV2Segmento | ''; label: string }> = [
    { value: '', label: 'Todos los segmentos' },
    { value: 'CRITICA_CPM', label: 'Críticas con CPM' },
    { value: 'ATENCION_CPM', label: 'Atención con CPM' },
    { value: 'DEMANDA_SIN_CPM', label: 'Demanda sin CPM' },
    { value: 'CPM_SIN_SOLICITUD', label: 'CPM sin solicitud observada' },
    { value: 'CUBIERTA', label: 'Cubiertas' },
    { value: 'OBSERVAR', label: 'Por observar' }
  ];
  readonly estadosOperativos: Array<{ value: RadarGlobalV2EstadoOperativo | ''; label: string }> = [
    { value: '', label: 'Cualquier estado operativo' },
    { value: 'VIGENTE_EN_PROCESO', label: 'Vigente · en proceso' },
    { value: 'VIGENTE_CON_SALIDA', label: 'Vigente · con salida' },
    { value: 'FUERA_UMBRAL_SIN_SALIDA', label: 'Fuera del umbral · sin salida' },
    { value: 'HISTORICA_CON_SALIDA', label: 'Histórica · con salida' },
    { value: 'SIN_SOLICITUD_OBSERVADA', label: 'Sin solicitud observada' }
  ];
  readonly definicionesEstado: Record<RadarGlobalV2EstadoOperativo, { descripcion: string; alcance: string; accion: string }> = {
    VIGENTE_EN_PROCESO: {
      descripcion: 'La última solicitud fue registrada dentro de los últimos 14 días y aún no se observa una salida posterior hacia la unidad.',
      alcance: 'El almacén continúa dentro de la ventana operativa habitual. No significa que la solicitud esté desatendida.',
      accion: 'Dar seguimiento sin escalar automáticamente y revisar nuevamente al acercarse el fin del umbral.'
    },
    VIGENTE_CON_SALIDA: {
      descripcion: 'La solicitud continúa dentro del umbral de 14 días y existe al menos una salida posterior registrada hacia la unidad.',
      alcance: 'Una salida registrada no confirma por sí sola la recepción, disponibilidad física ni cobertura total de la solicitud.',
      accion: 'Confirmar recepción y cantidad entregada antes de considerar atendida la necesidad.'
    },
    FUERA_UMBRAL_SIN_SALIDA: {
      descripcion: 'Han transcurrido más de 14 días desde la última solicitud y no se observa una salida posterior hacia la unidad.',
      alcance: 'Es una señal para seguimiento; no demuestra por sí sola incumplimiento, pues pueden existir movimientos aún no cargados.',
      accion: 'Validar con almacén y unidad, revisar fuentes oficiales y documentar el seguimiento.'
    },
    HISTORICA_CON_SALIDA: {
      descripcion: 'La última solicitud ya está fuera del umbral vigente, pero se encontró una salida posterior hacia la unidad.',
      alcance: 'La salida aporta evidencia de atención, aunque no confirma recepción ni que la cantidad haya sido suficiente.',
      accion: 'Verificar recepción, cobertura resultante y si persiste la necesidad.'
    },
    SIN_SOLICITUD_OBSERVADA: {
      descripcion: 'La clave no apareció en las solicitudes registradas durante el periodo histórico seleccionado.',
      alcance: 'No significa que la unidad no la necesite ni que su CPM sea incorrecto.',
      accion: 'Revisar ciclos de solicitud, vigencia del CPM, existencias y posibles alternativas.'
    }
  };

  readonly definicionesSegmento: Record<RadarGlobalV2Segmento, { descripcion: string; criterio: string }> = {
    CRITICA_CPM: {
      descripcion: 'Demanda observada con existencia menor a un CPM y señales de atención inmediata.',
      criterio: 'Sin existencia o solicitada en al menos la mitad de los ciclos; una orden pendiente no se considera existencia disponible.'
    },
    ATENCION_CPM: {
      descripcion: 'Demanda observada con existencia menor a un CPM, pero sin alcanzar el criterio de criticidad.',
      criterio: 'Requiere seguimiento de cobertura, alternativas y órdenes antes de escalarla.'
    },
    DEMANDA_SIN_CPM: {
      descripcion: 'La unidad ha solicitado la clave, no tiene CPM registrado y el snapshot no muestra existencia.',
      criterio: 'Señala una posible necesidad no representada en el universo CPM; debe validarse con la unidad.'
    },
    CPM_SIN_SOLICITUD: {
      descripcion: 'La clave pertenece al universo CPM de la unidad, pero no apareció en las solicitudes del periodo.',
      criterio: 'No significa que la unidad no la necesite; es una señal para revisar ciclos, inventario, alternativas y vigencia del CPM.'
    },
    CUBIERTA: {
      descripcion: 'La existencia actual alcanza al menos un CPM o la brecha puede cubrirse con alternativas locales observadas.',
      criterio: 'La cobertura por alternativas es analítica y debe validarse antes de sustituir una clave.'
    },
    OBSERVAR: {
      descripcion: 'La combinación unidad-clave no coincide con los criterios prioritarios actuales.',
      criterio: 'Permanece visible para análisis; no equivale automáticamente a una condición favorable o desfavorable.'
    }
  };


  private etiqueta(segmento: RadarGlobalV2Segmento): string {
    return this.segmentos.find(x => x.value === segmento)?.label ?? segmento;
  }
  private etiquetaEstado(estado: RadarGlobalV2EstadoOperativo): string {
    return this.estadosOperativos.find(x => x.value === estado)?.label ?? estado;
  }
  async generar(out: Radar, evidencia: Evidencia): Promise<ArchivoReporte> {
    console.info('Generando archivo excel para radar global usando power automate');
    return escribirArchivoReporte(async libro => {
    const rows = out.data;
      const indice = new Map(rows.map(row => [`${row.cluesimb}|${row.clave}`, row]));
      const radar = mapearFilas(rows, row => ({
        'Requiere seguimiento': this.requiereSeguimiento(row) ? 'Sí' : 'No',
        'Motivos de seguimiento': this.motivosSeguimiento(row),
        'Estado operativo': this.etiquetaEstado(row.estado_operativo), Segmento: this.etiqueta(row.segmento),
        Prioridad: row.prioridad, CLUES: row.cluesimb, Unidad: row.nombre_de_unidad ?? '', Clave: row.clave,
        Descripción: row.descripcion ?? '', CPM: row.cpm, 'En universo CPM': row.en_cpm ? 'Sí' : 'No',
        'Existencia disponible': row.existencia_actual, 'Fecha del snapshot': this.fechaCorta(row.snapshot_existencias),
        'Cobertura en CPM': row.cobertura_cpm ?? '', 'Cobertura estimada en días': row.cobertura_dias ?? '',
        'Solicitado en periodo': row.solicitado_periodo, 'Ciclos con clave': row.ciclos_con_clave,
        'Ciclos de la unidad': row.ciclos_unidad, 'Frecuencia de solicitud': row.frecuencia_solicitud,
        'Primera solicitud': this.fechaCorta(row.primera_solicitud), 'Última solicitud': this.fechaCorta(row.ultima_solicitud),
        'Solicitud vigente (14 días)': row.solicitud_vigente ? 'Sí' : 'No', 'Solicitado vigente': row.solicitado_vigente,
        'Ciclos vigentes': row.ciclos_vigentes, 'Días desde última solicitud': row.dias_desde_ultima_solicitud ?? '',
        'Fin del umbral': this.fechaCorta(row.fecha_fin_umbral), 'Días restantes del umbral': row.dias_restantes_umbral ?? '',
        'Salida posterior observada': row.salida_posterior ? 'Sí' : 'No', 'Piezas en salidas posteriores': row.piezas_salida_posterior,
        'Última salida posterior': this.fechaCorta(row.ultima_salida_posterior),
        'Alternativas con existencia': row.homologos_disponibles,
        'Existencia alternativa equivalente': row.existencia_homologos_equivalente,
        'Mejor alternativa': row.mejor_homologo ?? '', 'Órdenes pendientes (contexto)': row.ordenes_pendientes,
        'Piezas pendientes (contexto)': row.piezas_pendientes, 'Órdenes por vencer': row.ordenes_por_vencer,
        'Órdenes vencidas': row.ordenes_vencidas, 'Recepciones últimos 30 días': row.recepciones_recientes,
        'Piezas recibidas últimos 30 días': row.piezas_recibidas_recientes,
        'Próxima entrega': this.fechaCorta(row.proxima_entrega), 'Cobertura proyectada en piezas': row.cobertura_proyectada,
        'Cobertura proyectada en CPM': row.cobertura_proyectada_cpm ?? '', Razones: row.razones.join(' | ')
      }));
      const salidas = mapearFilas(evidencia.salidas, salida => {
        const row = indice.get(`${salida.cluesimb}|${salida.clave}`);
        return { CLUES: salida.cluesimb, Unidad: row?.nombre_de_unidad ?? salida.unidad_destino ?? '',
          Clave: salida.clave, Descripción: row?.descripcion ?? '',
          'Última solicitud': this.fechaCorta(salida.ultima_solicitud), 'Fecha de salida': this.fechaCorta(salida.fecha_entregado),
          Cantidad: Number(salida.cantidad), Folio: salida.folio ?? '', 'Folio extra': salida.folio_extra ?? '',
          Origen: salida.unidad_origen ?? '', Destino: salida.unidad_destino ?? '', Tipo: salida.tipo ?? '', Programa: salida.programa ?? '' };
      });
      const ordenes = mapearFilas(evidencia.ordenes, orden => {
        const row = indice.get(`${orden.cluesimb}|${orden.clave}`);
        return { CLUES: orden.cluesimb, Unidad: row?.nombre_de_unidad ?? '', Clave: orden.clave,
          Descripción: row?.descripcion ?? '', 'Orden de suministro': orden.orden_de_suministro ?? '',
          Estado: this.etiquetaOrden(orden.estado_radar), Proveedor: orden.proveedor ?? '',
          'Fecha de emisión': this.fechaCorta(orden.fecha_emision), 'Fecha límite': this.fechaCorta(orden.fecha_limite_de_entrega),
          'Fecha de recepción': this.fechaCorta(orden.fecha_recepcion), 'Piezas emitidas': Number(orden.piezas_emitidas),
          'Piezas recibidas': Number(orden.piezas_recibidas), 'Piezas pendientes': Number(orden.piezas_pendientes) };
      });

      const guia = XLSX.utils.aoa_to_sheet([
        ['Radar de demanda y cobertura — guía y alcance'], ['Fecha de exportación', this.generadoEn],
        ['Periodo analizado', `${this.months} meses`], ['Búsqueda', 'Sin filtro'],
        ['CLUES', 'Todas'], ['Segmento', 'Todos'],
        ['Estado operativo', 'Todos'],
        ['Origen de solicitudes', 'Registros asociados a LOS EXCELES GENERADOS CON LA HERRAMIENTA DE SOLICITUDES. Piloto de información de prueba; no acredita recepción, procesamiento ni surtimiento por Abasto y/o Almacenes.'],
        ['Resultados encontrados', out.total], ['Resultados exportados', rows.length], [],
        ['Regla operativa', 'Una solicitud se considera vigente durante 14 días naturales a partir de su última fecha registrada.'],
        ['Evidencia principal', 'Las salidas se vinculan por unidad destino. Una salida no confirma por sí sola la recepción ni la cobertura total.'],
        ['Órdenes', 'Se muestran únicamente como contexto. Las piezas pendientes no equivalen a existencia disponible.'],
        ['Alcance', 'Información analítica de apoyo; debe validarse contra sistemas institucionales, documentos oficiales y registros de las áreas responsables.'],
        ['Precaución', 'Sin solicitud observada no significa que la unidad no necesite la clave.'], [],
        ['Segmento', 'Significado'],
        ...this.segmentos.filter(x => x.value).map(x => [x.label, this.definicionesSegmento[x.value as RadarGlobalV2Segmento].descripcion]), [],
        ['Estado operativo', 'Significado'],
        ...this.estadosOperativos.filter(x => x.value).map(x => [x.label, this.definicionesEstado[x.value as RadarGlobalV2EstadoOperativo].descripcion])
      ]);
      guia['!cols'] = [{ wch: 28 }, { wch: 100 }];
      const resumen = this.crearResumenExcel(out, rows);
      const resumenUnidades = this.crearResumenUnidadesExcel(rows);
      libro.hojaPequena('Guía y alcance', guia);
      libro.hojaPequena('Resumen', resumen);
      libro.hojaPequena('Resumen por unidad', resumenUnidades);
      await libro.tabla('Radar', radar, 'Sin resultados para los filtros seleccionados', ['Frecuencia de solicitud']);
      await libro.tabla('Detalle salidas', salidas, 'Sin salidas posteriores observadas');
      await libro.tabla('Órdenes contexto', ordenes, 'Sin órdenes relacionadas');
    });
  }

  async generarPaginado(resumenDatos: ResumenRadarPaginado, fuentes: FuentesRadarPaginadas): Promise<ArchivoReporte> {
    const radar = this.mapearAsync(fuentes.radar, row => this.filaRadar(row));
    const salidas = this.mapearAsync(fuentes.salidas, salida => ({
      CLUES: salida.cluesimb, Unidad: salida.nombre_de_unidad ?? salida.unidad_destino ?? '',
      Clave: salida.clave, Descripción: salida.descripcion ?? '',
      'Última solicitud': this.fechaCorta(salida.ultima_solicitud),
      'Fecha de salida': this.fechaCorta(salida.fecha_entregado), Cantidad: Number(salida.cantidad),
      Folio: salida.folio ?? '', 'Folio extra': salida.folio_extra ?? '', Origen: salida.unidad_origen ?? '',
      Destino: salida.unidad_destino ?? '', Tipo: salida.tipo ?? '', Programa: salida.programa ?? ''
    }));
    const ordenes = this.mapearAsync(fuentes.ordenes, orden => ({
      CLUES: orden.cluesimb, Unidad: orden.nombre_de_unidad ?? '', Clave: orden.clave,
      Descripción: orden.descripcion ?? '', 'Orden de suministro': orden.orden_de_suministro ?? '',
      Estado: this.etiquetaOrden(orden.estado_radar), Proveedor: orden.proveedor ?? '',
      'Fecha de emisión': this.fechaCorta(orden.fecha_emision),
      'Fecha límite': this.fechaCorta(orden.fecha_limite_de_entrega),
      'Fecha de recepción': this.fechaCorta(orden.fecha_recepcion),
      'Piezas emitidas': Number(orden.piezas_emitidas), 'Piezas recibidas': Number(orden.piezas_recibidas),
      'Piezas pendientes': Number(orden.piezas_pendientes)
    }));
    return escribirArchivoReporte(async libro => {
      const guia = XLSX.utils.aoa_to_sheet([
        ['Radar de demanda y cobertura — guía y alcance'], ['Fecha de exportación', this.generadoEn],
        ['Periodo analizado', `${this.months} meses`], ['Búsqueda', 'Sin filtro'], ['CLUES', 'Todas'],
        ['Segmento', 'Todos'], ['Estado operativo', 'Todos'],
        ['Origen de solicitudes', 'Registros asociados a LOS EXCELES GENERADOS CON LA HERRAMIENTA DE SOLICITUDES. Piloto de información de prueba; no acredita recepción, procesamiento ni surtimiento por Abasto y/o Almacenes.'],
        ['Resultados encontrados', resumenDatos.total], ['Resultados exportados', resumenDatos.total], [],
        ['Regla operativa', 'Una solicitud se considera vigente durante 14 días naturales a partir de su última fecha registrada.'],
        ['Evidencia principal', 'Las salidas se vinculan por unidad destino. Una salida no confirma por sí sola la recepción ni la cobertura total.'],
        ['Órdenes', 'Se muestran únicamente como contexto. Las piezas pendientes no equivalen a existencia disponible.'],
        ['Alcance', 'Información analítica de apoyo; debe validarse contra sistemas institucionales, documentos oficiales y registros de las áreas responsables.'],
        ['Precaución', 'Sin solicitud observada no significa que la unidad no necesite la clave.'], [],
        ['Segmento', 'Significado'],
        ...this.segmentos.filter(x => x.value).map(x => [x.label, this.definicionesSegmento[x.value as RadarGlobalV2Segmento].descripcion]), [],
        ['Estado operativo', 'Significado'],
        ...this.estadosOperativos.filter(x => x.value).map(x => [x.label, this.definicionesEstado[x.value as RadarGlobalV2EstadoOperativo].descripcion])
      ]);
      guia['!cols'] = [{ wch: 28 }, { wch: 100 }];
      const porEstado = this.estadosOperativos.filter(x => x.value)
        .map(x => [x.label, resumenDatos.estados[x.value as RadarGlobalV2EstadoOperativo] ?? 0]);
      const resumen = XLSX.utils.aoa_to_sheet([
        ['Resumen del universo exportado'], [], ['Segmentos', 'Total'],
        ['Críticas con CPM', resumenDatos.segmentos.criticas_cpm],
        ['Atención con CPM', resumenDatos.segmentos.atencion_cpm],
        ['Demanda sin CPM', resumenDatos.segmentos.demanda_sin_cpm],
        ['CPM sin solicitud observada', resumenDatos.segmentos.cpm_sin_solicitud],
        ['Cubiertas', resumenDatos.segmentos.cubiertas], [], ['Estados operativos', 'Total'], ...porEstado, [],
        ['Indicadores para seguimiento', 'Total'],
        ['Fuera del umbral sin salida', resumenDatos.fueraUmbralSinSalida],
        ['Con órdenes vencidas', resumenDatos.conOrdenesVencidas],
        ['Críticas con CPM', resumenDatos.segmentos.criticas_cpm],
        ['Con salida posterior observada', resumenDatos.conSalidaPosterior]
      ]);
      const unidades = resumenDatos.unidades.map(item => [item.unidad, item.clavesSolicitadas,
        item.sinExistencia, item.clavesSolicitadas ? item.sinExistencia / item.clavesSolicitadas : 0]);
      const resumenUnidades = XLSX.utils.aoa_to_sheet([
        ['Resumen actual por unidad'], ['Periodo de solicitudes', `Últimos ${this.months} meses`],
        ['Alcance', 'Las cifras consideran el universo exportado y respetan los filtros aplicados.'],
        ['Existencias', 'Snapshot disponible al generar el archivo; no representa existencias históricas ni información en tiempo real.'],
        ['Definición', 'Claves distintas solicitadas cuenta claves CNIS únicas por unidad. Sin existencia actual es el subconjunto con existencia igual a cero.'],
        [], ['Unidad', 'Claves distintas solicitadas', 'Sin existencia actual', '% sin existencia'],
        ...(unidades.length ? unidades : [['Sin unidades con solicitudes en el universo exportado', 0, 0, 0]])
      ]);
      resumenUnidades['!cols'] = [{ wch: 62 }, { wch: 28 }, { wch: 24 }, { wch: 18 }];
      resumenUnidades['!autofilter'] = { ref: `A7:D${Math.max(8, unidades.length + 7)}` };
      (resumenUnidades as any)['!freeze'] = { xSplit: 0, ySplit: 7, topLeftCell: 'A8', activePane: 'bottomLeft', state: 'frozen' };
      for (let row = 7; row < Math.max(1, unidades.length) + 7; row++) {
        const cell = resumenUnidades[XLSX.utils.encode_cell({ r: row, c: 3 })];
        if (cell) cell.z = '0.00%';
      }
      libro.hojaPequena('Guía y alcance', guia);
      libro.hojaPequena('Resumen', resumen);
      libro.hojaPequena('Resumen por unidad', resumenUnidades);
      await libro.tablaAsync('Radar', radar, 'Sin resultados para los filtros seleccionados', ['Frecuencia de solicitud']);
      await libro.tablaAsync('Detalle salidas', salidas, 'Sin salidas posteriores observadas');
      await libro.tablaAsync('Órdenes contexto', ordenes, 'Sin órdenes relacionadas');
    });
  }

  private async *mapearAsync<T>(data: AsyncIterable<T>, convertir: (row: T) => Record<string, unknown>) {
    for await (const row of data) yield convertir(row);
  }

  private filaRadar(row: RadarGlobalV2Row): Record<string, unknown> {
    return {
      'Requiere seguimiento': this.requiereSeguimiento(row) ? 'Sí' : 'No',
      'Motivos de seguimiento': this.motivosSeguimiento(row),
      'Estado operativo': this.etiquetaEstado(row.estado_operativo), Segmento: this.etiqueta(row.segmento),
      Prioridad: row.prioridad, CLUES: row.cluesimb, Unidad: row.nombre_de_unidad ?? '', Clave: row.clave,
      Descripción: row.descripcion ?? '', CPM: row.cpm, 'En universo CPM': row.en_cpm ? 'Sí' : 'No',
      'Existencia disponible': row.existencia_actual, 'Fecha del snapshot': this.fechaCorta(row.snapshot_existencias),
      'Cobertura en CPM': row.cobertura_cpm ?? '', 'Cobertura estimada en días': row.cobertura_dias ?? '',
      'Solicitado en periodo': row.solicitado_periodo, 'Ciclos con clave': row.ciclos_con_clave,
      'Ciclos de la unidad': row.ciclos_unidad, 'Frecuencia de solicitud': row.frecuencia_solicitud,
      'Primera solicitud': this.fechaCorta(row.primera_solicitud), 'Última solicitud': this.fechaCorta(row.ultima_solicitud),
      'Solicitud vigente (14 días)': row.solicitud_vigente ? 'Sí' : 'No', 'Solicitado vigente': row.solicitado_vigente,
      'Ciclos vigentes': row.ciclos_vigentes, 'Días desde última solicitud': row.dias_desde_ultima_solicitud ?? '',
      'Fin del umbral': this.fechaCorta(row.fecha_fin_umbral), 'Días restantes del umbral': row.dias_restantes_umbral ?? '',
      'Salida posterior observada': row.salida_posterior ? 'Sí' : 'No',
      'Piezas en salidas posteriores': row.piezas_salida_posterior,
      'Última salida posterior': this.fechaCorta(row.ultima_salida_posterior),
      'Alternativas con existencia': row.homologos_disponibles,
      'Existencia alternativa equivalente': row.existencia_homologos_equivalente,
      'Mejor alternativa': row.mejor_homologo ?? '', 'Órdenes pendientes (contexto)': row.ordenes_pendientes,
      'Piezas pendientes (contexto)': row.piezas_pendientes, 'Órdenes por vencer': row.ordenes_por_vencer,
      'Órdenes vencidas': row.ordenes_vencidas, 'Recepciones últimos 30 días': row.recepciones_recientes,
      'Piezas recibidas últimos 30 días': row.piezas_recibidas_recientes,
      'Próxima entrega': this.fechaCorta(row.proxima_entrega), 'Cobertura proyectada en piezas': row.cobertura_proyectada,
      'Cobertura proyectada en CPM': row.cobertura_proyectada_cpm ?? '', Razones: row.razones.join(' | ')
    };
  }

  private crearResumenExcel(out: Radar, rows: RadarGlobalV2Row[]): XLSX.WorkSheet {
    const porEstado = this.estadosOperativos.filter(x => x.value).map(x => [x.label,
      rows.filter(row => row.estado_operativo === x.value).length]);
    return XLSX.utils.aoa_to_sheet([
      ['Resumen del universo exportado'], [], ['Segmentos', 'Total'],
      ['Críticas con CPM', out.summary.criticas_cpm], ['Atención con CPM', out.summary.atencion_cpm],
      ['Demanda sin CPM', out.summary.demanda_sin_cpm], ['CPM sin solicitud observada', out.summary.cpm_sin_solicitud],
      ['Cubiertas', out.summary.cubiertas], [], ['Estados operativos', 'Total'], ...porEstado, [],
      ['Indicadores para seguimiento', 'Total'],
      ['Fuera del umbral sin salida', rows.filter(x => x.estado_operativo === 'FUERA_UMBRAL_SIN_SALIDA').length],
      ['Con órdenes vencidas', rows.filter(x => x.ordenes_vencidas > 0).length],
      ['Críticas con CPM', rows.filter(x => x.segmento === 'CRITICA_CPM').length],
      ['Con salida posterior observada', rows.filter(x => x.salida_posterior).length]
    ]);
  }

  private crearResumenUnidadesExcel(rows: RadarGlobalV2Row[]): XLSX.WorkSheet {
    const porUnidad = new Map<string, {
      unidad: string;
      clavesSolicitadas: Set<string>;
      clavesSinExistencia: Set<string>;
    }>();
    for (const row of rows) {
      if (row.solicitado_periodo <= 0) continue;
      const unidad = `${row.nombre_de_unidad?.trim() || 'UNIDAD SIN NOMBRE'} · ${row.cluesimb}`;
      const resumen = porUnidad.get(row.cluesimb) ?? {
        unidad,
        clavesSolicitadas: new Set<string>(),
        clavesSinExistencia: new Set<string>()
      };
      resumen.clavesSolicitadas.add(row.clave);
      if (row.existencia_actual <= 0) resumen.clavesSinExistencia.add(row.clave);
      porUnidad.set(row.cluesimb, resumen);
    }
    const unidades = Array.from(porUnidad.values())
      .sort((a, b) => a.unidad.localeCompare(b.unidad, 'es'))
      .map(item => {
        const solicitadas = item.clavesSolicitadas.size;
        const sinExistencia = item.clavesSinExistencia.size;
        return [item.unidad, solicitadas, sinExistencia, solicitadas ? sinExistencia / solicitadas : 0];
      });
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Resumen actual por unidad'],
      ['Periodo de solicitudes', `Últimos ${this.months} meses`],
      ['Alcance', 'Las cifras consideran el universo exportado y respetan los filtros aplicados.'],
      ['Existencias', 'Snapshot disponible al generar el archivo; no representa existencias históricas ni información en tiempo real.'],
      ['Definición', 'Claves distintas solicitadas cuenta claves CNIS únicas por unidad. Sin existencia actual es el subconjunto con existencia igual a cero.'],
      [],
      ['Unidad', 'Claves distintas solicitadas', 'Sin existencia actual', '% sin existencia'],
      ...(unidades.length ? unidades : [['Sin unidades con solicitudes en el universo exportado', 0, 0, 0]])
    ]);
    sheet['!cols'] = [{ wch: 62 }, { wch: 28 }, { wch: 24 }, { wch: 18 }];
    sheet['!autofilter'] = { ref: `A7:D${Math.max(8, unidades.length + 7)}` };
    (sheet as any)['!freeze'] = { xSplit: 0, ySplit: 7, topLeftCell: 'A8', activePane: 'bottomLeft', state: 'frozen' };
    const filasDatos = Math.max(1, unidades.length);
    for (let row = 7; row < filasDatos + 7; row++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: 3 })];
      if (cell) cell.z = '0.00%';
    }
    return sheet;
  }

  private requiereSeguimiento(row: RadarGlobalV2Row): boolean {
    return row.segmento === 'CRITICA_CPM' || row.estado_operativo === 'FUERA_UMBRAL_SIN_SALIDA' || row.ordenes_vencidas > 0;
  }

  private motivosSeguimiento(row: RadarGlobalV2Row): string {
    return [row.segmento === 'CRITICA_CPM' ? 'Crítica con CPM' : '',
      row.estado_operativo === 'FUERA_UMBRAL_SIN_SALIDA' ? 'Fuera del umbral sin salida' : '',
      row.ordenes_vencidas > 0 ? 'Orden con saldo vencido' : ''].filter(Boolean).join(' | ');
  }

  private fechaCorta(value: string | null | undefined): string {
    if (!value) return '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
  }

  private etiquetaOrden(estado: RadarGlobalV2OrdenRow['estado_radar']): string {
    return ({ PENDIENTE: 'Pendiente', POR_VENCER: 'Por vencer', VENCIDA: 'Vencida',
      CUMPLIDA_RECIENTE: 'Cumplida recientemente' } as const)[estado] ?? estado;
  }
}
