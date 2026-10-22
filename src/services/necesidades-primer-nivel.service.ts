import ExcelJS from 'exceljs';
import { pool } from '../db/pool';
import {
  EnviarNecesidadesPrimerNivelInput,
  EnviarNecesidadesPrimerNivelResult,
} from '../models/solicitudes/EnviarNecesidadesPrimerNivel';
import {
  ContextoCapturaPrimerNivel,
  OrigenCapturaPrimerNivel,
} from '../models/solicitudes/primer-nivel/ContextoCapturaPrimerNivel';
import HistorialesService from './historiales.service';
import SolicitudesPrimerNivelBitacoraService from './solicitudes-primer-nivel-bitacora.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type ArticuloCatalogo = { clave: string; descripcion: string | null; presentacion: string | null };
type UnidadPrimerNivel = {
  cluesimb: string;
  nombre_de_unidad: string;
  jurisdiccion: string | null;
  es_segundo_nivel: boolean;
};
type AnalisisOperativo = {
  clave: string;
  cpm: number;
  existenciaAzm: number;
  existenciaAzt: number;
  existenciaAze: number;
  fechaSnapshot: string | null;
};

export type VistaPreviaNecesidadesPrimerNivel = EnviarNecesidadesPrimerNivelResult & {
  nombreArchivo: string;
  buffer: Buffer;
};

function obtenerPeriodoActual(fecha = new Date()): string {
  const partes = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Tijuana',
  }).formatToParts(fecha);
  const mes = partes.find(parte => parte.type === 'month')?.value ?? '';
  const anio = partes.find(parte => parte.type === 'year')?.value ?? '';
  const mesCapitalizado = mes ? `${mes.charAt(0).toUpperCase()}${mes.slice(1)}` : '';
  return `${mesCapitalizado} ${anio}`.trim();
}

function formatearFechaPacifico(valor: string | Date | null): string | null {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Tijuana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find(item => item.type === tipo)?.value ?? '';
  return `${parte('day')}/${parte('month')}/${parte('year')} ${parte('hour')}:${parte('minute')}:${parte('second')} (hora del Pacífico)`;
}

export default class NecesidadesPrimerNivelService {
  constructor(
    private readonly bitacoraPrimerNivel = new SolicitudesPrimerNivelBitacoraService(),
    private readonly historiales = new HistorialesService()
  ) {}

  async enviar(input: EnviarNecesidadesPrimerNivelInput): Promise<EnviarNecesidadesPrimerNivelResult> {
    const contexto = await this.prepararSolicitud(input);
    const { cluesimb, responsable, periodo, articulos, contextosCaptura, unidad, catalogoPorClave, analisis } = contexto;

    const registro = await this.bitacoraPrimerNivel.crear({
      cluesimb,
      periodo,
      articulos,
      contextosCaptura,
    });

    const recibidoEn = new Date().toISOString();
    const folio = registro.solicitudId;
    const nombreArchivo = this.crearNombreArchivo(cluesimb, recibidoEn, folio);
    const buffer = await this.generarExcel({
      folio,
      recibidoEn,
      unidad: unidad.nombre_de_unidad,
      jurisdiccion: unidad.jurisdiccion,
      cluesimb,
      responsable,
      periodo,
      articulos: articulos.map(item => ({ ...item, ...catalogoPorClave.get(item.clave)! })),
      analisis,
      contextosCaptura,
    });

    await this.historiales.enviarWishlistASharePoint({
      nombreArchivo,
      contenidoBase64: buffer.toString('base64'),
      nombre: responsable || 'No especificado',
      unidad: unidad.nombre_de_unidad,
      clues: cluesimb,
      periodo,
      tipoMime: XLSX_MIME,
    });

    return this.crearResultado({ folio, cluesimb, unidad: unidad.nombre_de_unidad, periodo, articulos, recibidoEn });
  }

  async generarVistaPrevia(input: EnviarNecesidadesPrimerNivelInput): Promise<VistaPreviaNecesidadesPrimerNivel> {
    const contexto = await this.prepararSolicitud(input);
    const { cluesimb, responsable, periodo, articulos, contextosCaptura, unidad, catalogoPorClave, analisis } = contexto;
    const recibidoEn = new Date().toISOString();
    const folio = `PRUEBA-LOCAL-${Date.now()}`;
    const nombreArchivo = `Necesidades-${cluesimb}-${recibidoEn.slice(0, 10)}-LOCAL-${Date.now()}.xlsx`;
    const buffer = await this.generarExcel({
      folio,
      recibidoEn,
      unidad: unidad.nombre_de_unidad,
      jurisdiccion: unidad.jurisdiccion,
      cluesimb,
      responsable,
      periodo,
      articulos: articulos.map(item => ({ ...item, ...catalogoPorClave.get(item.clave)! })),
      analisis,
      contextosCaptura,
    });

    return {
      ...this.crearResultado({ folio, cluesimb, unidad: unidad.nombre_de_unidad, periodo, articulos, recibidoEn }),
      nombreArchivo,
      buffer,
    };
  }

  private async prepararSolicitud(input: EnviarNecesidadesPrimerNivelInput) {
    const cluesimb = String(input.cluesimb ?? '').trim().toUpperCase();
    const responsable = String(input.responsable ?? '').trim().slice(0, 255);
    const periodoCapturado = String(input.periodo ?? '').trim().slice(0, 120);
    const periodo = periodoCapturado || obtenerPeriodoActual();
    const articulos = this.normalizarArticulos(input.articulos);

    if (!cluesimb) throw new Error('cluesimb requerido');
    if (!articulos.length) throw new Error('La lista de necesidades está vacía');

    const unidad = await this.obtenerUnidadPrimerNivel(cluesimb);
    if (!unidad) throw new Error('La CLUES no corresponde a una unidad de Primer Nivel');

    const catalogo = await this.obtenerArticulos(articulos.map(item => item.clave));
    const catalogoPorClave = new Map(catalogo.map(item => [item.clave.trim().toUpperCase(), item]));
    const faltantes = articulos.filter(item => !catalogoPorClave.has(item.clave)).map(item => item.clave);
    if (faltantes.length) throw new Error(`Claves inexistentes en el catálogo: ${faltantes.slice(0, 5).join(', ')}`);
    const [analisis, contextosCaptura] = await Promise.all([
      this.obtenerAnalisisOperativo(cluesimb, articulos.map(item => item.clave)),
      this.resolverContextosCaptura(input.articulos),
    ]);

    return { cluesimb, responsable, periodo, articulos, contextosCaptura, unidad, catalogoPorClave, analisis };
  }

  private async resolverContextosCaptura(
    articulos: EnviarNecesidadesPrimerNivelInput['articulos']
  ): Promise<ContextoCapturaPrimerNivel[]> {
    const contextos = articulos.map((item, index) => {
      const clave = String(item?.clave ?? '').trim().toUpperCase();
      const cantidad = Number(item?.cantidad);
      const origen = String(item?.origenCaptura ?? 'CLAVE').trim().toUpperCase() as OrigenCapturaPrimerNivel;
      const referencia = String(item?.referenciaCaptura ?? '').trim().toUpperCase();
      if (!['APS', 'PROGRAMA_PREVENTIVO', 'CLAVE'].includes(origen)) {
        throw new Error(`Origen de captura inválido en articulos[${index}]`);
      }
      if (origen === 'CLAVE' && referencia) {
        throw new Error(`La captura por clave no admite referencia en articulos[${index}]`);
      }
      if (origen !== 'CLAVE' && !referencia) {
        throw new Error(`referenciaCaptura requerida para el origen ${origen}`);
      }
      return {
        clave,
        cantidad,
        origenCaptura: origen,
        referenciaCaptura: referencia || null,
      };
    });

    const etiquetas = new Map<string, string>();
    const aps = contextos.filter(item => item.origenCaptura === 'APS');
    if (aps.length) {
      const { rows } = await pool.query<{ referencia: string; clave: string; etiqueta: string }>(`
        SELECT UPPER(TRIM(m.codigo)) AS referencia, UPPER(TRIM(mc.clave)) AS clave,
               m.etiqueta_usuario AS etiqueta
        FROM aps.medicamento m
        INNER JOIN aps.grupo g ON g.id = m.grupo_id AND g.activo = true
        INNER JOIN aps.eje_atencion ea ON ea.id = g.eje_id AND ea.activo = true
        INNER JOIN aps.medicamento_clave mc
          ON mc.medicamento_id = m.id
         AND mc.activo = true
         AND mc.tipo_relacion = 'PRINCIPAL'
        WHERE m.activo = true
          AND UPPER(TRIM(m.codigo)) = ANY($1::text[])
          AND UPPER(TRIM(mc.clave)) = ANY($2::text[])
      `, [aps.map(item => item.referenciaCaptura), aps.map(item => item.clave)]);
      const permitidos = new Set(rows.map(row => `${row.referencia}|${row.clave}`));
      rows.forEach(row => etiquetas.set(`APS|${row.referencia}|${row.clave}`, row.etiqueta));
      const invalido = aps.find(item => !permitidos.has(`${item.referenciaCaptura}|${item.clave}`));
      if (invalido) {
        throw new Error(`La clave ${invalido.clave} no es PRINCIPAL del medicamento APS ${invalido.referenciaCaptura}`);
      }
    }

    const programas = contextos.filter(item => item.origenCaptura === 'PROGRAMA_PREVENTIVO');
    if (programas.length) {
      const { rows } = await pool.query<{ referencia: string; clave: string; etiqueta: string }>(`
        SELECT UPPER(TRIM(v.programa_codigo)) AS referencia, UPPER(TRIM(v.clave)) AS clave,
               p.nombre AS etiqueta
        FROM preventivos.v_programa_insumo v
        INNER JOIN preventivos.programa p
          ON UPPER(TRIM(p.codigo)) = UPPER(TRIM(v.programa_codigo))
         AND p.activo = true
        WHERE v.activo = true
          AND UPPER(TRIM(v.programa_codigo)) = ANY($1::text[])
          AND UPPER(TRIM(v.clave)) = ANY($2::text[])
      `, [programas.map(item => item.referenciaCaptura), programas.map(item => item.clave)]);
      const permitidos = new Set(rows.map(row => `${row.referencia}|${row.clave}`));
      rows.forEach(row => etiquetas.set(`PROGRAMA_PREVENTIVO|${row.referencia}|${row.clave}`, row.etiqueta));
      const invalido = programas.find(item => !permitidos.has(`${item.referenciaCaptura}|${item.clave}`));
      if (invalido) {
        throw new Error(`La clave ${invalido.clave} no pertenece al programa ${invalido.referenciaCaptura}`);
      }
    }

    return contextos.map(item => ({
      ...item,
      etiquetaCaptura: item.origenCaptura === 'CLAVE'
        ? 'Captura por clave CNIS'
        : etiquetas.get(`${item.origenCaptura}|${item.referenciaCaptura}|${item.clave}`) ?? null,
    }));
  }

  private crearNombreArchivo(cluesimb: string, recibidoEn: string, folio: string): string {
    return `Necesidades-${cluesimb}-${recibidoEn.slice(0, 10)}-${folio.slice(0, 8)}.xlsx`;
  }

  private crearResultado(contexto: {
    folio: string;
    cluesimb: string;
    unidad: string;
    periodo: string;
    articulos: Array<{ clave: string; cantidad: number }>;
    recibidoEn: string;
  }): EnviarNecesidadesPrimerNivelResult {
    return {
      solicitudId: contexto.folio,
      folio: contexto.folio,
      cluesimb: contexto.cluesimb,
      unidad: contexto.unidad,
      periodo: contexto.periodo || null,
      totalInsumos: contexto.articulos.length,
      totalPiezas: contexto.articulos.reduce((total, item) => total + item.cantidad, 0),
      recibidoEn: contexto.recibidoEn,
    };
  }

  private normalizarArticulos(input: EnviarNecesidadesPrimerNivelInput['articulos']) {
    if (!Array.isArray(input) || input.length > 500) throw new Error('La lista debe contener entre 1 y 500 insumos');
    const consolidados = new Map<string, number>();
    for (const item of input) {
      const clave = String(item?.clave ?? '').trim().toUpperCase();
      const cantidad = Number(item?.cantidad);
      if (!clave || clave.startsWith('002')) throw new Error(`Clave no permitida: ${clave || '(vacía)'}`);
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99999) {
        throw new Error(`Cantidad inválida para la clave ${clave}`);
      }
      const acumulada = (consolidados.get(clave) ?? 0) + cantidad;
      if (acumulada > 99999) throw new Error(`La cantidad acumulada excede 99999 para la clave ${clave}`);
      consolidados.set(clave, acumulada);
    }
    return [...consolidados.entries()]
      .map(([clave, cantidad]) => ({ clave, cantidad }))
      .sort((a, b) => a.clave.localeCompare(b.clave));
  }

  private async obtenerUnidadPrimerNivel(cluesimb: string): Promise<UnidadPrimerNivel | null> {
    const { rows } = await pool.query<UnidadPrimerNivel>(`
      SELECT
        cluesimb,
        nombre_de_unidad,
        CASE
          WHEN UPPER(TRIM(cluesimb)) = 'BCIMB000133' THEN 'MEXICALI'
          WHEN UPPER(TRIM(nombre_municipio)) IN ('TIJUANA', 'TECATE', 'PLAYAS DE ROSARITO') THEN 'TIJUANA'
          WHEN UPPER(TRIM(nombre_municipio)) IN ('MEXICALI', 'SAN FELIPE') THEN 'MEXICALI'
          WHEN UPPER(TRIM(nombre_municipio)) IN ('ENSENADA', 'SAN QUINTIN', 'SAN QUINTÍN') THEN 'ENSENADA'
          ELSE UPPER(TRIM(nombre_municipio))
        END AS jurisdiccion,
        es_segundo_nivel
      FROM public.v_unidad_medica_detalle
      WHERE UPPER(TRIM(cluesimb)) = $1
        AND es_segundo_nivel = false
      LIMIT 1
    `, [cluesimb]);
    return rows[0] ?? null;
  }

  private async obtenerArticulos(claves: string[]): Promise<ArticuloCatalogo[]> {
    const { rows } = await pool.query<ArticuloCatalogo>(`
      SELECT
        i.clave,
        CONCAT_WS(
          ' | ',
          NULLIF(TRIM(i.nombre), ''),
          NULLIF(REGEXP_REPLACE(TRIM(i.descripcion), '[[:space:]]+', ' ', 'g'), '')
        ) AS descripcion,
        NULL::text AS presentacion
      FROM cnis.insumo i
      WHERE i.activo = true
        AND UPPER(TRIM(i.clave)) = ANY($1::text[])
      ORDER BY i.clave
    `, [claves]);
    return rows;
  }

  private async obtenerAnalisisOperativo(cluesimb: string, claves: string[]): Promise<AnalisisOperativo[]> {
    const { rows } = await pool.query<{
      clave: string;
      cpm: string | number | null;
      existencia_azm: string | number | null;
      existencia_azt: string | number | null;
      existencia_aze: string | number | null;
      fecha_snapshot: Date | string | null;
    }>(`
      WITH claves AS (
        SELECT UNNEST($2::text[]) AS clave
      ),
      cpm_unidad AS (
        SELECT UPPER(TRIM(c.clave_cnis)) AS clave, MAX(c.cpm) AS cpm
        FROM public.cpm c
        INNER JOIN public.unidad_medica um ON um.id = c.unidad_medica_id
        WHERE UPPER(TRIM(um.cluesimb)) = $1
          AND UPPER(TRIM(c.clave_cnis)) = ANY($2::text[])
        GROUP BY UPPER(TRIM(c.clave_cnis))
      ),
      existencias_almacen AS (
        SELECT
          UPPER(TRIM(t.clave_cnis)) AS clave,
          SUM(t.existencia) FILTER (
            WHERE UPPER(CONCAT_WS(' ', vumd.nombre_de_unidad, vumd.nombre_municipio, vumd.alias_sas, vumd.cluesimb))
              SIMILAR TO '%(MEXICALI|AZM)%'
          ) AS existencia_azm,
          SUM(t.existencia) FILTER (
            WHERE UPPER(CONCAT_WS(' ', vumd.nombre_de_unidad, vumd.nombre_municipio, vumd.alias_sas, vumd.cluesimb))
              SIMILAR TO '%(TIJUANA|AZT)%'
          ) AS existencia_azt,
          SUM(t.existencia) FILTER (
            WHERE UPPER(CONCAT_WS(' ', vumd.nombre_de_unidad, vumd.nombre_municipio, vumd.alias_sas, vumd.cluesimb))
              SIMILAR TO '%(ENSENADA|AZE)%'
          ) AS existencia_aze,
          MAX(t.cargado_en) AS fecha_snapshot
        FROM public.tmp_existencias t
        INNER JOIN public.v_unidad_medica_detalle vumd ON vumd.cluesimb = t.cluesimb
        WHERE vumd.tipo_unidad = 'ALMACENES'
          AND UPPER(TRIM(t.clave_cnis)) = ANY($2::text[])
        GROUP BY UPPER(TRIM(t.clave_cnis))
      )
      SELECT
        claves.clave,
        COALESCE(cpm_unidad.cpm, 0) AS cpm,
        COALESCE(existencias_almacen.existencia_azm, 0) AS existencia_azm,
        COALESCE(existencias_almacen.existencia_azt, 0) AS existencia_azt,
        COALESCE(existencias_almacen.existencia_aze, 0) AS existencia_aze,
        existencias_almacen.fecha_snapshot
      FROM claves
      LEFT JOIN cpm_unidad ON cpm_unidad.clave = claves.clave
      LEFT JOIN existencias_almacen ON existencias_almacen.clave = claves.clave
      ORDER BY claves.clave
    `, [cluesimb, claves]);

    return rows.map(row => ({
      clave: String(row.clave),
      cpm: Number(row.cpm ?? 0),
      existenciaAzm: Number(row.existencia_azm ?? 0),
      existenciaAzt: Number(row.existencia_azt ?? 0),
      existenciaAze: Number(row.existencia_aze ?? 0),
      fechaSnapshot: row.fecha_snapshot ? new Date(row.fecha_snapshot).toISOString() : null,
    }));
  }

  private async generarExcel(contexto: {
    folio: string;
    recibidoEn: string;
    unidad: string;
    jurisdiccion: string | null;
    cluesimb: string;
    responsable: string;
    periodo: string;
    articulos: Array<ArticuloCatalogo & { cantidad: number }>;
    analisis: AnalisisOperativo[];
    contextosCaptura: ContextoCapturaPrimerNivel[];
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IMSS Bienestar BC';
    workbook.created = new Date(contexto.recibidoEn);
    const hoja = workbook.addWorksheet('Lista de necesidades');

    hoja.addRow(['LISTA DE NECESIDADES · PRIMER NIVEL']);
    hoja.addRow(['Folio', contexto.folio]);
    hoja.addRow(['Unidad', contexto.unidad]);
    hoja.addRow(['CLUES', contexto.cluesimb]);
    hoja.addRow(['Jurisdicción', contexto.jurisdiccion || 'No especificada']);
    hoja.addRow(['Periodo', contexto.periodo || 'No especificado']);
    hoja.addRow(['Responsable', contexto.responsable || 'No especificado']);
    hoja.addRow(['Recibido', formatearFechaPacifico(contexto.recibidoEn)]);
    hoja.addRow([]);
    hoja.addRow(['Clave', 'Descripción', 'Presentación', 'Cantidad', 'Origen de captura', 'Referencia', 'Contexto']);

    const contextoPorClave = this.agruparContextosPorClave(contexto.contextosCaptura);

    for (const articulo of contexto.articulos) {
      const captura = contextoPorClave.get(articulo.clave);
      hoja.addRow([
        articulo.clave,
        articulo.descripcion ?? '',
        articulo.presentacion ?? '',
        articulo.cantidad,
        captura?.origen ?? 'Por clave CNIS',
        captura?.referencia ?? '',
        captura?.etiqueta ?? 'Captura por clave CNIS',
      ]);
    }

    hoja.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF006B5F' } };
    hoja.getRow(10).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hoja.getRow(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006B5F' } };
    hoja.columns = [
      { width: 22 }, { width: 64 }, { width: 34 }, { width: 14 },
      { width: 24 }, { width: 24 }, { width: 38 },
    ];
    hoja.views = [{ state: 'frozen', ySplit: 10 }];
    hoja.autoFilter = { from: 'A10', to: 'G10' };
    hoja.getColumn(4).numFmt = '0';
    contexto.articulos.forEach((_, index) => {
      hoja.getRow(index + 11).alignment = { vertical: 'top', wrapText: true };
    });

    const analisisPorClave = new Map(contexto.analisis.map(item => [item.clave, item]));
    const hojaAnalisis = workbook.addWorksheet('Análisis operativo');
    hojaAnalisis.addRow(['ANÁLISIS OPERATIVO · CPM Y EXISTENCIAS EN ALMACENES']);
    hojaAnalisis.addRow(['Generado', formatearFechaPacifico(contexto.recibidoEn)]);
    hojaAnalisis.addRow(['Jurisdicción', contexto.jurisdiccion || 'No especificada']);
    const fechaSnapshot = contexto.analisis.find(item => item.fechaSnapshot)?.fechaSnapshot;
    hojaAnalisis.addRow(['Snapshot de existencias', formatearFechaPacifico(fechaSnapshot ?? null) ?? 'No disponible']);
    hojaAnalisis.addRow(['Nota', 'Información referencial; las existencias pueden cambiar y deben validarse antes del surtimiento.']);
    hojaAnalisis.addRow([]);
    hojaAnalisis.addRow([
      'No.', 'Clave', 'Descripción', 'Presentación', 'Necesidad', 'CPM unidad',
      'Meses solicitados', 'AZM', 'AZT', 'AZE', 'Total almacenes', 'Faltante referencial',
      'Origen de captura', 'Referencia', 'Contexto',
    ]);

    contexto.articulos.forEach((articulo, index) => {
      const dato = analisisPorClave.get(articulo.clave);
      const cpm = dato?.cpm ?? 0;
      const azm = dato?.existenciaAzm ?? 0;
      const azt = dato?.existenciaAzt ?? 0;
      const aze = dato?.existenciaAze ?? 0;
      const total = azm + azt + aze;
      const captura = contextoPorClave.get(articulo.clave);
      const renglon = hojaAnalisis.addRow([
        index + 1,
        articulo.clave,
        articulo.descripcion ?? '',
        articulo.presentacion ?? '',
        articulo.cantidad,
        cpm,
        cpm > 0 ? articulo.cantidad / cpm : null,
        azm,
        azt,
        aze,
        total,
        Math.max(articulo.cantidad - total, 0),
        captura?.origen ?? 'Por clave CNIS',
        captura?.referencia ?? '',
        captura?.etiqueta ?? 'Captura por clave CNIS',
      ]);
      renglon.alignment = { vertical: 'top', wrapText: true };
      if (cpm <= 0) renglon.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
      if (total < articulo.cantidad) renglon.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
    });

    hojaAnalisis.mergeCells('A1:O1');
    hojaAnalisis.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF006B5F' } };
    hojaAnalisis.getRow(7).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hojaAnalisis.getRow(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006B5F' } };
    hojaAnalisis.columns = [
      { width: 8 }, { width: 22 }, { width: 60 }, { width: 34 },
      { width: 14 }, { width: 14 }, { width: 18 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 18 }, { width: 20 },
      { width: 24 }, { width: 24 }, { width: 38 },
    ];
    hojaAnalisis.views = [{ state: 'frozen', ySplit: 7 }];
    hojaAnalisis.autoFilter = { from: 'A7', to: 'O7' };
    ['E', 'F', 'H', 'I', 'J', 'K', 'L'].forEach(columna => hojaAnalisis.getColumn(columna).numFmt = '0');
    hojaAnalisis.getColumn('G').numFmt = '0.00';

    const contenido = await workbook.xlsx.writeBuffer();
    return Buffer.from(contenido);
  }

  private agruparContextosPorClave(contextos: ContextoCapturaPrimerNivel[]): Map<string, {
    origen: string;
    referencia: string;
    etiqueta: string;
  }> {
    const etiquetasOrigen: Record<OrigenCapturaPrimerNivel, string> = {
      APS: 'Por APS',
      PROGRAMA_PREVENTIVO: 'Por programa preventivo',
      CLAVE: 'Por clave CNIS',
    };
    const agrupados = new Map<string, ContextoCapturaPrimerNivel[]>();
    for (const item of contextos) {
      agrupados.set(item.clave, [...(agrupados.get(item.clave) ?? []), item]);
    }
    return new Map([...agrupados.entries()].map(([clave, items]) => [clave, {
      origen: [...new Set(items.map(item => etiquetasOrigen[item.origenCaptura]))].join(' / '),
      referencia: [...new Set(items.map(item => item.referenciaCaptura).filter(Boolean))].join(' / '),
      etiqueta: [...new Set(items.map(item => item.etiquetaCaptura).filter(Boolean))].join(' / '),
    }]));
  }
}
