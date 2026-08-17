import { PoolClient } from 'pg';
import * as XLSX from 'xlsx';
import { pool } from '../db/pool';
import RadarAbastoService from './radar-abasto.service';
import { RadarGlobalV2Row } from '../models/radar-abasto/RadarGlobalV2Row';
import {
  ReporteCpmBatchResult,
  ReporteCpmInitResult,
  ReporteCpmSemanalRow,
} from '../models/reporteCpmSemanal.model';

export class ReporteCpmValidationError extends Error {
  constructor(public readonly details: string[]) {
    super('Los datos del reporte CPM no son válidos.');
    this.name = 'ReporteCpmValidationError';
  }
}

export class ReporteCpmNotFoundError extends Error {}

type FuenteRow = {
  fecha_corte: string; entidad: string; nombre_comercial: string; clues_imb: string;
  total_claves_en_cpm: number; total_claves_en_cpm_reportando: number;
  total_claves_reportando: number; claves_medicamentos_010_040_ultimo: number;
  claves_material_curacion_060_ultimo: number; otros_03_070_080: number;
  archivo_origen: string; cargado_en: string;
};

export type HospitalReporteCpm = {
  hospital: string; clues: string; totalClavesEnCpm: number;
  totalClavesEnCpmReportando: number; cobertura: number | null;
  totalClavesReportando: number; medicamentos: number; materialCuracion: number; otros: number;
  totalClavesEnCpmAnterior: number | null; totalClavesEnCpmReportandoAnterior: number | null;
  coberturaAnterior: number | null; variacionPuntos: number | null; cambioUniversoCpm: number | null;
};

export type TendenciaCpm = {
  fecha: string; hospitalesIncluidos: number; totalClavesEnCpm: number;
  totalClavesEnCpmReportando: number; coberturaEstatalPonderada: number | null;
  promedioSimpleCobertura: number | null; totalClavesReportando: number;
  medicamentos: number; materialCuracion: number; otros: number;
};

export type ReporteCpmCompleto = {
  ok: true; fechaCorte: string; fechaCorteAnterior: string | null; generadoEn: string;
  nombreArchivo: string; asuntoCorreo: string;
  resumen: { hospitales: number; totalClavesEnCpm: number; totalClavesEnCpmReportando: number;
    coberturaEstatalPonderada: number | null; coberturaEstatalAnterior: number | null;
    variacionEstatalPuntos: number | null; totalClavesReportando: number; medicamentos: number;
    materialCuracion: number; otros: number; hospitalesConCambioUniversoCpm: number; };
  hospitales: HospitalReporteCpm[]; tablaCorreo: Record<string, string | number>[];
  correo: { encabezadoHtml: string; notaMetodologicaHtml: string }; advertencias: string[];
};

type ResumenHospitalSinExistencia = {
  hospital: string; clues: string; totalClavesEnCpm: number; clavesCpmIdentificadas: number;
  clavesSinExistencia: number; solicitadasTresMeses: number; solicitudesVigentes: number;
  conOrdenPendiente: number; conOrdenVencida: number; conSalidaPosterior: number;
  sinSolicitudObservada: number; diferenciaUniverso: number;
};

export type ReporteCpmCompletoV2 = ReporteCpmCompleto & {
  ventanaOperativaMeses: 3;
  lecturaOperativa: { titulo: string; explicacion: string; alcance: string; aclaraciones: string[]; };
  resumenSinExistencia: { claves: number; solicitadasTresMeses: number; solicitudesVigentes: number;
    conOrdenPendiente: number; conOrdenVencida: number; conSalidaPosterior: number; sinSolicitudObservada: number; };
  hospitalesSinExistencia: ResumenHospitalSinExistencia[];
  tablaCorreoSinExistencia: Record<string, string | number>[];
  clavesSinExistencia: RadarGlobalV2Row[];
  ordenesRelacionadas: Record<string, unknown>[];
  salidasRelacionadas: Record<string, unknown>[];
};

export default class ReporteCpmSemanalService {
  private readonly tableName = 'public.reporte_cpm_semanal';
  private readonly radar = new RadarAbastoService();
  private readonly ventanaOperativaMeses = 3 as const;

  async init(truncate = false): Promise<ReporteCpmInitResult> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await this.ensureTable(client);

      if (truncate) {
        await client.query(`TRUNCATE TABLE ${this.tableName} RESTART IDENTITY;`);
      }

      await client.query('COMMIT');

      return {
        ok: true,
        table: this.tableName,
        truncated: truncate,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async batch(inputRows: unknown): Promise<ReporteCpmBatchResult> {
    if (!Array.isArray(inputRows)) {
      throw new ReporteCpmValidationError(['El cuerpo debe contener un arreglo en la propiedad rows.']);
    }

    if (inputRows.length === 0) {
      return { processed: 0 };
    }

    if (inputRows.length > 5000) {
      throw new ReporteCpmValidationError(['Un batch no puede contener más de 5000 filas.']);
    }

    const rows = this.normalizeAndValidateRows(inputRows);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await this.ensureTable(client);

      const sql = `
        INSERT INTO ${this.tableName} (
          fecha_corte,
          entidad,
          nombre_comercial,
          clues_imb,
          total_claves_en_cpm,
          total_claves_en_cpm_reportando,
          total_claves_reportando,
          claves_medicamentos_010_040_ultimo,
          claves_material_curacion_060_ultimo,
          otros_03_070_080,
          archivo_origen
        )
        SELECT
          x.fecha_corte,
          x.entidad,
          x.nombre_comercial,
          x.clues_imb,
          x.total_claves_en_cpm,
          x.total_claves_en_cpm_reportando,
          x.total_claves_reportando,
          x.claves_medicamentos_010_040_ultimo,
          x.claves_material_curacion_060_ultimo,
          x.otros_03_070_080,
          x.archivo_origen
        FROM jsonb_to_recordset($1::jsonb) AS x (
          fecha_corte date,
          entidad text,
          nombre_comercial text,
          clues_imb text,
          total_claves_en_cpm integer,
          total_claves_en_cpm_reportando integer,
          total_claves_reportando integer,
          claves_medicamentos_010_040_ultimo integer,
          claves_material_curacion_060_ultimo integer,
          otros_03_070_080 integer,
          archivo_origen text
        )
        ON CONFLICT (fecha_corte, clues_imb)
        DO UPDATE SET
          entidad = EXCLUDED.entidad,
          nombre_comercial = EXCLUDED.nombre_comercial,
          total_claves_en_cpm = EXCLUDED.total_claves_en_cpm,
          total_claves_en_cpm_reportando = EXCLUDED.total_claves_en_cpm_reportando,
          total_claves_reportando = EXCLUDED.total_claves_reportando,
          claves_medicamentos_010_040_ultimo = EXCLUDED.claves_medicamentos_010_040_ultimo,
          claves_material_curacion_060_ultimo = EXCLUDED.claves_material_curacion_060_ultimo,
          otros_03_070_080 = EXCLUDED.otros_03_070_080,
          archivo_origen = EXCLUDED.archivo_origen,
          actualizado_en = now();
      `;

      const result = await client.query(sql, [JSON.stringify(rows)]);
      await client.query('COMMIT');

      return { processed: result.rowCount ?? rows.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async resolverFechaCorte(fechaSolicitada?: string): Promise<string> {
    const { rows } = await pool.query<{ fecha: string | null }>(
      fechaSolicitada
        ? `SELECT to_char(MAX(fecha_corte), 'YYYY-MM-DD') fecha FROM ${this.tableName} WHERE fecha_corte = $1::date`
        : `SELECT to_char(MAX(fecha_corte), 'YYYY-MM-DD') fecha FROM ${this.tableName}`,
      fechaSolicitada ? [fechaSolicitada] : [],
    );
    if (!rows[0]?.fecha) throw new ReporteCpmNotFoundError(fechaSolicitada ?? 'sin registros');
    return rows[0].fecha;
  }

  async obtenerFechaAnterior(fechaCorte: string): Promise<string | null> {
    const { rows } = await pool.query<{ fecha: string | null }>(
      `SELECT to_char(MAX(fecha_corte), 'YYYY-MM-DD') fecha FROM ${this.tableName} WHERE fecha_corte < $1::date`,
      [fechaCorte],
    );
    return rows[0]?.fecha ?? null;
  }

  private number(value: unknown): number { return Number(value ?? 0); }
  private pct(num: number, den: number): number | null {
    return den === 0 ? null : Number((num * 100 / den).toFixed(2));
  }
  private formatPct(value: number | null): string { return value === null ? 'N/D' : `${value.toFixed(2)} %`; }
  private formatVariation(value: number | null): string {
    return value === null ? 'Sin comparativo' : `${value >= 0 ? '+' : ''}${value.toFixed(2)} pp`;
  }
  private formatDelta(value: number | null): string {
    return value === null ? 'Sin comparativo' : `${value > 0 ? '+' : ''}${value}`;
  }
  private fechaLarga(fecha: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${fecha}T00:00:00Z`));
  }

  private async obtenerFuente(fecha: string): Promise<FuenteRow[]> {
    const { rows } = await pool.query(`SELECT to_char(fecha_corte,'YYYY-MM-DD') fecha_corte, entidad,
      nombre_comercial, clues_imb, total_claves_en_cpm, total_claves_en_cpm_reportando,
      total_claves_reportando, claves_medicamentos_010_040_ultimo,
      claves_material_curacion_060_ultimo, otros_03_070_080, archivo_origen,
      creado_en::text cargado_en FROM ${this.tableName} WHERE fecha_corte=$1::date ORDER BY nombre_comercial`, [fecha]);
    return rows.map((r: any) => ({ ...r,
      total_claves_en_cpm: this.number(r.total_claves_en_cpm), total_claves_en_cpm_reportando: this.number(r.total_claves_en_cpm_reportando),
      total_claves_reportando: this.number(r.total_claves_reportando), claves_medicamentos_010_040_ultimo: this.number(r.claves_medicamentos_010_040_ultimo),
      claves_material_curacion_060_ultimo: this.number(r.claves_material_curacion_060_ultimo), otros_03_070_080: this.number(r.otros_03_070_080),
    }));
  }

  async obtenerReporteSemanal(fechaSolicitada?: string): Promise<ReporteCpmCompleto> {
    const fechaCorte = await this.resolverFechaCorte(fechaSolicitada);
    const fechaCorteAnterior = await this.obtenerFechaAnterior(fechaCorte);
    const [actual, anterior] = await Promise.all([this.obtenerFuente(fechaCorte), fechaCorteAnterior ? this.obtenerFuente(fechaCorteAnterior) : Promise.resolve([])]);
    const anteriores = new Map(anterior.map(r => [r.clues_imb, r]));
    const hospitales = actual.map((r): HospitalReporteCpm => {
      const prev = anteriores.get(r.clues_imb); const cobertura = this.pct(r.total_claves_en_cpm_reportando, r.total_claves_en_cpm);
      const coberturaAnterior = prev ? this.pct(prev.total_claves_en_cpm_reportando, prev.total_claves_en_cpm) : null;
      return { hospital: r.nombre_comercial, clues: r.clues_imb, totalClavesEnCpm: r.total_claves_en_cpm,
        totalClavesEnCpmReportando: r.total_claves_en_cpm_reportando, cobertura, totalClavesReportando: r.total_claves_reportando,
        medicamentos: r.claves_medicamentos_010_040_ultimo, materialCuracion: r.claves_material_curacion_060_ultimo, otros: r.otros_03_070_080,
        totalClavesEnCpmAnterior: prev?.total_claves_en_cpm ?? null, totalClavesEnCpmReportandoAnterior: prev?.total_claves_en_cpm_reportando ?? null,
        coberturaAnterior, variacionPuntos: cobertura !== null && coberturaAnterior !== null ? Number((cobertura-coberturaAnterior).toFixed(2)) : null,
        cambioUniversoCpm: prev ? r.total_claves_en_cpm-prev.total_claves_en_cpm : null };
    });
    const sum = (key: keyof FuenteRow) => actual.reduce((n,r) => n + this.number(r[key]), 0);
    const total = sum('total_claves_en_cpm'), reportando = sum('total_claves_en_cpm_reportando');
    const prevTotal = anterior.reduce((n,r)=>n+r.total_claves_en_cpm,0), prevReportando=anterior.reduce((n,r)=>n+r.total_claves_en_cpm_reportando,0);
    const cobertura = this.pct(reportando,total), coberturaAnterior = anterior.length ? this.pct(prevReportando,prevTotal) : null;
    const variacion = cobertura !== null && coberturaAnterior !== null ? Number((cobertura-coberturaAnterior).toFixed(2)) : null;
    const cambios = hospitales.filter(h => h.cambioUniversoCpm !== null && h.cambioUniversoCpm !== 0).length;
    const advertencias: string[] = [];
    if (actual.length !== 9) advertencias.push(`El corte contiene ${actual.length} hospitales; se esperaban 9.`);
    if (cambios) advertencias.push(`Cambió el universo CPM de ${cambios} hospital(es).`);
    if (!fechaCorteAnterior || hospitales.some(h=>h.totalClavesEnCpmAnterior===null)) advertencias.push('Falta información de comparación para uno o más hospitales.');
    if (hospitales.some(h=>h.totalClavesEnCpm===0)) advertencias.push('Uno o más hospitales tienen total CPM igual a cero; su cobertura se muestra como N/D.');
    if (actual.some(r=>r.entidad.trim().toUpperCase()!=='BAJA CALIFORNIA')) advertencias.push('Uno o más registros no corresponden a Baja California.');
    if (actual.some(r=>r.claves_medicamentos_010_040_ultimo+r.claves_material_curacion_060_ultimo+r.otros_03_070_080!==r.total_claves_reportando)) advertencias.push('Los componentes no coinciden con el total de claves reportando en uno o más hospitales.');
    const resumen = { hospitales: actual.length, totalClavesEnCpm: total, totalClavesEnCpmReportando: reportando,
      coberturaEstatalPonderada: cobertura, coberturaEstatalAnterior: coberturaAnterior, variacionEstatalPuntos: variacion,
      totalClavesReportando: sum('total_claves_reportando'), medicamentos: sum('claves_medicamentos_010_040_ultimo'),
      materialCuracion: sum('claves_material_curacion_060_ultimo'), otros: sum('otros_03_070_080'), hospitalesConCambioUniversoCpm: cambios };
    const tablaCorreo = hospitales.map(h=>({ Hospital:h.hospital, CLUES:h.clues, 'Total CPM':h.totalClavesEnCpm,
      'CPM reportando':h.totalClavesEnCpmReportando, Cobertura:this.formatPct(h.cobertura), 'Total reportando':h.totalClavesReportando,
      'Cobertura anterior': h.totalClavesEnCpmAnterior===null ? 'Sin comparativo' : this.formatPct(h.coberturaAnterior),
      'Variación':this.formatVariation(h.variacionPuntos), 'Cambio universo CPM':this.formatDelta(h.cambioUniversoCpm) }));
    const alerta = cambios ? `<p><strong>Advertencia:</strong> cambió el universo CPM de ${cambios} hospital(es).</p>` : '';
    return { ok:true, fechaCorte, fechaCorteAnterior, generadoEn:new Date().toISOString(), nombreArchivo:`reporte-semanal-cpm-${fechaCorte}.xlsx`,
      asuntoCorreo:`Reporte semanal CPM | Corte ${this.fechaLarga(fechaCorte)}`, resumen, hospitales, tablaCorreo,
      correo:{ encabezadoHtml:`<h2>Reporte semanal CPM</h2><p>Corte: ${this.fechaLarga(fechaCorte)}<br>Cobertura estatal ponderada: ${this.formatPct(cobertura)}<br>Variación contra el corte anterior: ${this.formatVariation(variacion)}<br>Total CPM: ${total.toLocaleString('es-MX')}<br>CPM reportando: ${reportando.toLocaleString('es-MX')}<br>Total general reportando: ${resumen.totalClavesReportando.toLocaleString('es-MX')}<br>Hospitales incluidos: ${actual.length}</p>${alerta}`,
        notaMetodologicaHtml:'<p><small>Metodología: la cobertura es CPM reportando / total CPM. El total general reportando se muestra solo como cantidad e incluye claves con y sin CPM. El universo CPM puede cambiar entre semanas. Los archivos no contienen detalle para identificar claves únicas entre semanas.</small></p>' }, advertencias };
  }

  async obtenerTendencia(fechaCorte: string, numeroSemanas = 12): Promise<TendenciaCpm[]> {
    const { rows } = await pool.query<any>(`WITH fechas AS (SELECT DISTINCT fecha_corte FROM ${this.tableName} WHERE fecha_corte <= $1::date ORDER BY fecha_corte DESC LIMIT $2)
      SELECT to_char(r.fecha_corte,'YYYY-MM-DD') fecha, COUNT(*) hospitales, SUM(total_claves_en_cpm) total_cpm,
      SUM(total_claves_en_cpm_reportando) cpm_reportando, AVG(CASE WHEN total_claves_en_cpm>0 THEN 100.0*total_claves_en_cpm_reportando/total_claves_en_cpm END) promedio,
      SUM(total_claves_reportando) total_reportando, SUM(claves_medicamentos_010_040_ultimo) medicamentos,
      SUM(claves_material_curacion_060_ultimo) material, SUM(otros_03_070_080) otros FROM ${this.tableName} r JOIN fechas f USING(fecha_corte) GROUP BY r.fecha_corte ORDER BY r.fecha_corte`, [fechaCorte, numeroSemanas]);
    return rows.map((r:any)=>({ fecha:r.fecha, hospitalesIncluidos:this.number(r.hospitales), totalClavesEnCpm:this.number(r.total_cpm),
      totalClavesEnCpmReportando:this.number(r.cpm_reportando), coberturaEstatalPonderada:this.pct(this.number(r.cpm_reportando),this.number(r.total_cpm)),
      promedioSimpleCobertura:r.promedio===null?null:Number(Number(r.promedio).toFixed(2)), totalClavesReportando:this.number(r.total_reportando),
      medicamentos:this.number(r.medicamentos), materialCuracion:this.number(r.material), otros:this.number(r.otros) }));
  }

  async obtenerReporteSemanalV2(fechaSolicitada?: string): Promise<ReporteCpmCompletoV2> {
    const reporte = await this.obtenerReporteSemanal(fechaSolicitada);
    const radar = await this.radar.listarGlobalV2({ months: this.ventanaOperativaMeses, page: 1, pageSize: 50000, export: true });
    const hospitalesPorClues = new Map(reporte.hospitales.map(h => [h.clues.trim().toUpperCase(), h]));
    const universoReporte = radar.data.filter(r => hospitalesPorClues.has(r.cluesimb) && r.en_cpm);
    const clavesSinExistencia = universoReporte.filter(r => r.existencia_actual <= 0);
    const detalles = await this.radar.exportarGlobalV2Detalles(
      clavesSinExistencia.map(r => ({ cluesimb: r.cluesimb, clave: r.clave })), this.ventanaOperativaMeses,
    );
    const contar = (items: RadarGlobalV2Row[], predicate: (row: RadarGlobalV2Row) => boolean) => items.filter(predicate).length;
    const hospitalesSinExistencia = reporte.hospitales.map((hospital): ResumenHospitalSinExistencia => {
      const clues = hospital.clues.trim().toUpperCase();
      const identificadas = universoReporte.filter(r => r.cluesimb === clues);
      const sinExistencia = clavesSinExistencia.filter(r => r.cluesimb === clues);
      return {
        hospital: hospital.hospital, clues: hospital.clues, totalClavesEnCpm: hospital.totalClavesEnCpm,
        clavesCpmIdentificadas: identificadas.length, clavesSinExistencia: sinExistencia.length,
        solicitadasTresMeses: contar(sinExistencia, r => r.solicitado_periodo > 0),
        solicitudesVigentes: contar(sinExistencia, r => r.solicitud_vigente),
        conOrdenPendiente: contar(sinExistencia, r => r.ordenes_pendientes > 0),
        conOrdenVencida: contar(sinExistencia, r => r.ordenes_vencidas > 0),
        conSalidaPosterior: contar(sinExistencia, r => r.salida_posterior),
        sinSolicitudObservada: contar(sinExistencia, r => r.solicitado_periodo <= 0),
        diferenciaUniverso: identificadas.length - hospital.totalClavesEnCpm,
      };
    });
    const resumenSinExistencia = {
      claves: clavesSinExistencia.length,
      solicitadasTresMeses: contar(clavesSinExistencia, r => r.solicitado_periodo > 0),
      solicitudesVigentes: contar(clavesSinExistencia, r => r.solicitud_vigente),
      conOrdenPendiente: contar(clavesSinExistencia, r => r.ordenes_pendientes > 0),
      conOrdenVencida: contar(clavesSinExistencia, r => r.ordenes_vencidas > 0),
      conSalidaPosterior: contar(clavesSinExistencia, r => r.salida_posterior),
      sinSolicitudObservada: contar(clavesSinExistencia, r => r.solicitado_periodo <= 0),
    };
    const tablaCorreoSinExistencia = hospitalesSinExistencia.map(h => ({
      Hospital: h.hospital, CLUES: h.clues, 'Total CPM reportado': h.totalClavesEnCpm,
      'Registros CPM identificados': h.clavesCpmIdentificadas, 'Registros sin existencia': h.clavesSinExistencia,
      'Solicitados en 3 meses': h.solicitadasTresMeses, 'Solicitud vigente (14 días)': h.solicitudesVigentes,
      'Con orden pendiente': h.conOrdenPendiente, 'Con salida posterior': h.conSalidaPosterior,
      'Sin solicitud observada': h.sinSolicitudObservada,
    }));
    const advertencias = [...reporte.advertencias];
    if (radar.truncated) advertencias.push('El seguimiento operativo fue truncado; algunos registros de unidad y clave podrían no estar incluidos.');
    const diferencias = hospitalesSinExistencia.filter(h => h.diferenciaUniverso !== 0);
    if (diferencias.length) advertencias.push(`Los registros CPM vigentes no coinciden con el total reportado en ${diferencias.length} hospital(es); ambas cifras se muestran sin recortar información.`);
    const avisoReferencia = 'Información de referencia basada en snapshots: no corresponde a datos en tiempo real. Los CPM y las existencias pueden diferir de las cifras vigentes en las fuentes oficiales. Este reporte es únicamente informativo y no debe utilizarse para iniciar gestiones, solicitar aclaraciones o tomar decisiones operativas sin validar previamente la información.';
    const explicacion = `Se identificaron ${resumenSinExistencia.claves} registros de claves CPM por unidad sin existencia actual. Cada registro corresponde a una clave en una unidad médica. De ellos, ${resumenSinExistencia.solicitadasTresMeses} tuvieron solicitudes observadas en los últimos tres meses y ${resumenSinExistencia.conOrdenPendiente} cuentan con alguna orden pendiente.`;
    return {
      ...reporte,
      nombreArchivo: `reporte-semanal-cpm-v2-${reporte.fechaCorte}.xlsx`,
      asuntoCorreo: `Reporte semanal CPM y seguimiento operativo | Corte ${this.fechaLarga(reporte.fechaCorte)}`,
      advertencias, ventanaOperativaMeses: this.ventanaOperativaMeses,
      lecturaOperativa: {
        titulo: 'Seguimiento de registros CPM por unidad sin existencia actual', explicacion,
        alcance: avisoReferencia,
        aclaraciones: [
          'Cada registro representa una combinación de unidad médica y clave.',
          'Solicitud observada significa que la clave fue registrada en solicitud_bitacora; no confirma envío ni autorización.',
          'Solicitud vigente significa que la última solicitud está dentro del umbral operativo de 14 días.',
          'Una orden pendiente representa cobertura proyectada y no existencia disponible. Las órdenes vencidas se señalan por separado.',
          'Una salida posterior es evidencia de movimiento hacia la unidad después de su última solicitud; no confirma por sí sola la existencia actual.',
          'Sin solicitud observada en tres meses no significa que la clave carezca de necesidad clínica.',
        ],
      },
      resumenSinExistencia, hospitalesSinExistencia, tablaCorreoSinExistencia, clavesSinExistencia,
      ordenesRelacionadas: detalles.ordenes, salidasRelacionadas: detalles.salidas,
      correo: {
        ...reporte.correo,
        encabezadoHtml: `${reporte.correo.encabezadoHtml}<p><strong>Aviso importante:</strong> ${avisoReferencia}</p><h3>Seguimiento de registros CPM por unidad sin existencia actual</h3><p>${explicacion}</p>`,
        notaMetodologicaHtml: `${reporte.correo.notaMetodologicaHtml}<p><small>Cada registro corresponde a una combinación de unidad médica y clave. Solicitud observada no confirma envío ni autorización; una orden es cobertura proyectada, no existencia; y una salida posterior no confirma existencia actual. La ventana de solicitudes es de tres meses y la vigencia operativa es de 14 días.</small></p>`,
      },
    };
  }

  async generarReporteExcelV2(fechaSolicitada?: string): Promise<{ buffer: Buffer; reporte: ReporteCpmCompletoV2 }> {
    const [{ buffer }, reporte] = await Promise.all([this.generarReporteExcel(fechaSolicitada), this.obtenerReporteSemanalV2(fechaSolicitada)]);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const detalle = reporte.clavesSinExistencia.map(r => ({
      Hospital: r.nombre_de_unidad, CLUES: r.cluesimb, Clave: r.clave, Descripción: r.descripcion,
      CPM: r.cpm, 'Existencia actual': r.existencia_actual, 'Fecha snapshot': r.snapshot_existencias,
      'Solicitado en 3 meses': r.solicitado_periodo, 'Ciclos con clave': r.ciclos_con_clave,
      'Ciclos de la unidad': r.ciclos_unidad, 'Frecuencia de solicitud': r.frecuencia_solicitud,
      'Primera solicitud': r.primera_solicitud, 'Última solicitud': r.ultima_solicitud,
      'Solicitud vigente': r.solicitud_vigente ? 'Sí' : 'No', 'Estado operativo': r.estado_operativo,
      'Órdenes pendientes': r.ordenes_pendientes, 'Piezas pendientes': r.piezas_pendientes,
      'Órdenes vencidas': r.ordenes_vencidas, 'Próxima entrega': r.proxima_entrega,
      'Salida posterior': r.salida_posterior ? 'Sí' : 'No', 'Piezas en salida posterior': r.piezas_salida_posterior,
      'Última salida posterior': r.ultima_salida_posterior, 'Homólogos disponibles': r.homologos_disponibles,
      'Existencia equivalente en homólogos': r.existencia_homologos_equivalente, 'Mejor homólogo': r.mejor_homologo,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reporte.tablaCorreoSinExistencia), 'Resumen por unidad');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Registros sin existencia');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reporte.ordenesRelacionadas), 'Ordenes relacionadas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reporte.salidasRelacionadas), 'Salidas relacionadas');
    const guia = [['GUÍA DE LECTURA'], [], [reporte.lecturaOperativa.explicacion], [reporte.lecturaOperativa.alcance], [],
      ...reporte.lecturaOperativa.aclaraciones.map(texto => [texto]), [], ['ADVERTENCIAS'], ...reporte.advertencias.map(texto => [texto])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guia), 'Guia de lectura');
    return { buffer: XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true }) as Buffer, reporte };
  }

  async generarReporteExcel(fechaSolicitada?: string): Promise<{ buffer: Buffer; reporte: ReporteCpmCompleto }> {
    const reporte = await this.obtenerReporteSemanal(fechaSolicitada);
    const [tendencia, fuente] = await Promise.all([this.obtenerTendencia(reporte.fechaCorte,12),this.obtenerFuente(reporte.fechaCorte)]);
    const wb=XLSX.utils.book_new();
    const pct=(v:number|null)=>v===null?null:v/100;
    const resumenRows: unknown[][]=[['REPORTE SEMANAL DE CLAVES CPM REPORTANDO'],['Baja California'],[`Fecha de corte: ${reporte.fechaCorte}`],[],
      ['Indicador','Valor'],['Cobertura estatal ponderada',pct(reporte.resumen.coberturaEstatalPonderada)],['Variación contra corte anterior (pp)',reporte.resumen.variacionEstatalPuntos],['Total de claves en CPM',reporte.resumen.totalClavesEnCpm],['Total de claves CPM reportando',reporte.resumen.totalClavesEnCpmReportando],['Total general de claves reportando',reporte.resumen.totalClavesReportando],['Medicamentos',reporte.resumen.medicamentos],['Material de curación',reporte.resumen.materialCuracion],['Otros',reporte.resumen.otros],['Hospitales incluidos',reporte.resumen.hospitales],['Hospitales con cambio en universo CPM',reporte.resumen.hospitalesConCambioUniversoCpm],[],
      ['Hospital','CLUES','Total CPM','CPM reportando','Cobertura actual','Total reportando','Medicamentos','Material de curación','Otros','Total CPM anterior','Cobertura anterior','Variación pp','Cambio universo CPM'],
      ...reporte.hospitales.map(h=>[h.hospital,h.clues,h.totalClavesEnCpm,h.totalClavesEnCpmReportando,pct(h.cobertura),h.totalClavesReportando,h.medicamentos,h.materialCuracion,h.otros,h.totalClavesEnCpmAnterior,pct(h.coberturaAnterior),h.variacionPuntos,h.cambioUniversoCpm])];
    const ws=XLSX.utils.aoa_to_sheet(resumenRows); ws['!autofilter']={ref:`A17:M${resumenRows.length}`}; ws['!freeze']={xSplit:0,ySplit:17}; ws['!cols']=[{wch:42},{wch:18},...Array(11).fill({wch:18})];
    for(let r=18;r<=resumenRows.length;r++){ for(const c of ['E','K']) if(ws[`${c}${r}`]) ws[`${c}${r}`].z='0.00%'; }
    if(ws.B6) ws.B6.z='0.00%'; XLSX.utils.book_append_sheet(wb,ws,'Resumen semanal');
    const comp=XLSX.utils.json_to_sheet(reporte.hospitales.map(h=>({Hospital:h.hospital,CLUES:h.clues,'Total CPM anterior':h.totalClavesEnCpmAnterior,'Total CPM actual':h.totalClavesEnCpm,'Cambio en total CPM':h.cambioUniversoCpm,'CPM reportando anterior':h.totalClavesEnCpmReportandoAnterior,'CPM reportando actual':h.totalClavesEnCpmReportando,'Cobertura anterior':pct(h.coberturaAnterior),'Cobertura actual':pct(h.cobertura),'Variación pp':h.variacionPuntos}))); comp['!autofilter']={ref:`A1:J${reporte.hospitales.length+1}`}; XLSX.utils.book_append_sheet(wb,comp,'Comparativo');
    const trend=XLSX.utils.json_to_sheet(tendencia.map(t=>({Fecha:t.fecha,'Hospitales incluidos':t.hospitalesIncluidos,'Total CPM':t.totalClavesEnCpm,'CPM reportando':t.totalClavesEnCpmReportando,'Cobertura estatal ponderada':pct(t.coberturaEstatalPonderada),'Promedio simple cobertura':pct(t.promedioSimpleCobertura),'Total general reportando':t.totalClavesReportando,Medicamentos:t.medicamentos,'Material de curación':t.materialCuracion,Otros:t.otros}))); XLSX.utils.book_append_sheet(wb,trend,'Tendencia');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(fuente),'Datos fuente');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['METODOLOGÍA'],[],['La cobertura semanal CPM es CPM reportando / total CPM.'],['La cobertura estatal ponderada es la suma de CPM reportando / suma del total CPM.'],['Las variaciones se expresan en puntos porcentuales.'],['total_claves_reportando incluye claves con y sin CPM y no se usa como numerador contra total CPM.'],['El universo CPM puede variar entre cortes.'],['No existe detalle suficiente para identificar claves únicas mensuales o trimestrales.'],['Los valores reflejan los archivos fuente recibidos.'],[],['Limitación: la biblioteca xlsx utilizada no crea gráficas de forma confiable; se omite la gráfica de tendencia.']]),'Metodologia');
    return { buffer:XLSX.write(wb,{bookType:'xlsx',type:'buffer',cellStyles:true}) as Buffer, reporte };
  }

  private async ensureTable(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id bigint GENERATED BY DEFAULT AS IDENTITY,
        fecha_corte date NOT NULL,
        entidad varchar(100) NOT NULL,
        nombre_comercial varchar(255) NOT NULL,
        clues_imb varchar(20) NOT NULL,
        total_claves_en_cpm integer NOT NULL,
        total_claves_en_cpm_reportando integer NOT NULL,
        total_claves_reportando integer NOT NULL,
        claves_medicamentos_010_040_ultimo integer NOT NULL,
        claves_material_curacion_060_ultimo integer NOT NULL,
        otros_03_070_080 integer NOT NULL,
        archivo_origen varchar(255) NOT NULL,
        creado_en timestamptz NOT NULL DEFAULT now(),
        actualizado_en timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_reporte_cpm_semanal PRIMARY KEY (id),
        CONSTRAINT uq_reporte_cpm_semanal_fecha_clues UNIQUE (fecha_corte, clues_imb),
        CONSTRAINT ck_reporte_cpm_semanal_no_negativos CHECK (
          total_claves_en_cpm >= 0
          AND total_claves_en_cpm_reportando >= 0
          AND total_claves_reportando >= 0
          AND claves_medicamentos_010_040_ultimo >= 0
          AND claves_material_curacion_060_ultimo >= 0
          AND otros_03_070_080 >= 0
        ),
        CONSTRAINT ck_reporte_cpm_semanal_cpm_reportando CHECK (
          total_claves_en_cpm_reportando <= total_claves_en_cpm
        ),
        CONSTRAINT ck_reporte_cpm_semanal_reportando_total CHECK (
          total_claves_en_cpm_reportando <= total_claves_reportando
        ),
        CONSTRAINT ck_reporte_cpm_semanal_suma_categorias CHECK (
          total_claves_reportando =
            claves_medicamentos_010_040_ultimo
            + claves_material_curacion_060_ultimo
            + otros_03_070_080
        )
      );

      CREATE INDEX IF NOT EXISTS ix_reporte_cpm_semanal_fecha_corte
        ON ${this.tableName} (fecha_corte);

      CREATE INDEX IF NOT EXISTS ix_reporte_cpm_semanal_clues_imb
        ON ${this.tableName} (clues_imb);
    `);
  }

  private normalizeAndValidateRows(inputRows: unknown[]): ReporteCpmSemanalRow[] {
    const errors: string[] = [];
    const normalizedRows: ReporteCpmSemanalRow[] = [];
    const batchKeys = new Set<string>();

    inputRows.forEach((raw, index) => {
      const rowNumber = index + 1;

      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push(`Fila ${rowNumber}: el valor no es un objeto válido.`);
        return;
      }

      const source = raw as Record<string, unknown>;
      const fechaCorte = this.toDate(source.fecha_corte, 'fecha_corte', rowNumber, errors);
      const entidad = this.toRequiredText(source.entidad, 'entidad', rowNumber, errors).toUpperCase();
      const nombreComercial = this.toRequiredText(
        source.nombre_comercial,
        'nombre_comercial',
        rowNumber,
        errors,
      );
      const cluesImb = this.toRequiredText(source.clues_imb, 'clues_imb', rowNumber, errors).toUpperCase();
      const archivoOrigen = this.toRequiredText(
        source.archivo_origen,
        'archivo_origen',
        rowNumber,
        errors,
      );

      const totalCpm = this.toNonNegativeInteger(
        source.total_claves_en_cpm,
        'total_claves_en_cpm',
        rowNumber,
        errors,
      );
      const totalCpmReportando = this.toNonNegativeInteger(
        source.total_claves_en_cpm_reportando,
        'total_claves_en_cpm_reportando',
        rowNumber,
        errors,
      );
      const totalReportando = this.toNonNegativeInteger(
        source.total_claves_reportando,
        'total_claves_reportando',
        rowNumber,
        errors,
      );
      const medicamentos = this.toNonNegativeInteger(
        source.claves_medicamentos_010_040_ultimo,
        'claves_medicamentos_010_040_ultimo',
        rowNumber,
        errors,
      );
      const materialCuracion = this.toNonNegativeInteger(
        source.claves_material_curacion_060_ultimo,
        'claves_material_curacion_060_ultimo',
        rowNumber,
        errors,
      );
      const otros = this.toNonNegativeInteger(
        source.otros_03_070_080,
        'otros_03_070_080',
        rowNumber,
        errors,
      );

      if (entidad && entidad !== 'BAJA CALIFORNIA') {
        errors.push(`Fila ${rowNumber}: la entidad debe ser BAJA CALIFORNIA.`);
      }

      if (totalCpmReportando > totalCpm) {
        errors.push(
          `Fila ${rowNumber}: total_claves_en_cpm_reportando no puede superar total_claves_en_cpm.`,
        );
      }

      if (totalCpmReportando > totalReportando) {
        errors.push(
          `Fila ${rowNumber}: total_claves_en_cpm_reportando no puede superar total_claves_reportando.`,
        );
      }

      if (totalReportando !== medicamentos + materialCuracion + otros) {
        errors.push(
          `Fila ${rowNumber}: total_claves_reportando debe ser igual a medicamentos + material de curación + otros.`,
        );
      }

      const key = `${fechaCorte}||${cluesImb}`;
      if (fechaCorte && cluesImb) {
        if (batchKeys.has(key)) {
          errors.push(`Fila ${rowNumber}: la fecha ${fechaCorte} y CLUES ${cluesImb} están repetidas en el batch.`);
        }
        batchKeys.add(key);
      }

      normalizedRows.push({
        fecha_corte: fechaCorte,
        entidad,
        nombre_comercial: nombreComercial,
        clues_imb: cluesImb,
        total_claves_en_cpm: totalCpm,
        total_claves_en_cpm_reportando: totalCpmReportando,
        total_claves_reportando: totalReportando,
        claves_medicamentos_010_040_ultimo: medicamentos,
        claves_material_curacion_060_ultimo: materialCuracion,
        otros_03_070_080: otros,
        archivo_origen: archivoOrigen,
      });
    });

    if (errors.length > 0) {
      throw new ReporteCpmValidationError(errors);
    }

    return normalizedRows;
  }

  private toRequiredText(
    value: unknown,
    field: string,
    rowNumber: number,
    errors: string[],
  ): string {
    const text = String(value ?? '').trim();
    if (!text) {
      errors.push(`Fila ${rowNumber}: falta ${field}.`);
    }
    return text;
  }

  private toNonNegativeInteger(
    value: unknown,
    field: string,
    rowNumber: number,
    errors: string[],
  ): number {
    const parsed = typeof value === 'number'
      ? value
      : Number(String(value ?? '').replace(/,/g, '').trim());

    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.push(`Fila ${rowNumber}: ${field} debe ser un entero mayor o igual a cero.`);
      return 0;
    }

    return parsed;
  }

  private toDate(
    value: unknown,
    field: string,
    rowNumber: number,
    errors: string[],
  ): string {
    const dateText = String(value ?? '').trim();
    const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      errors.push(`Fila ${rowNumber}: ${field} debe tener formato YYYY-MM-DD.`);
      return dateText;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
    ) {
      errors.push(`Fila ${rowNumber}: ${field} no es una fecha válida.`);
    }

    return dateText;
  }
}
