import ExcelJS from 'exceljs';
import { pool } from '../db/pool';
import {
  EnviarNecesidadesPrimerNivelInput,
  EnviarNecesidadesPrimerNivelResult,
} from '../models/solicitudes/EnviarNecesidadesPrimerNivel';
import HistorialesService from './historiales.service';
import SolicitudesService from './solicitudes.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type ArticuloCatalogo = { clave: string; descripcion: string | null; presentacion: string | null };
type UnidadPrimerNivel = { cluesimb: string; nombre_de_unidad: string; es_segundo_nivel: boolean };

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

export default class NecesidadesPrimerNivelService {
  constructor(
    private readonly solicitudes = new SolicitudesService(),
    private readonly historiales = new HistorialesService()
  ) {}

  async enviar(input: EnviarNecesidadesPrimerNivelInput): Promise<EnviarNecesidadesPrimerNivelResult> {
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

    const registro = await this.solicitudes.crearBitacora({
      cluesimb,
      tipoPedido: 'Ordinario',
      tipoInsumo: 'Medicamento - Material de Curación',
      periodo,
      articulos,
    });

    const recibidoEn = new Date().toISOString();
    const folio = registro.solicitudId;
    const nombreArchivo = `Necesidades-${cluesimb}-${recibidoEn.slice(0, 10)}-${folio.slice(0, 8)}.xlsx`;
    const buffer = await this.generarExcel({
      folio,
      recibidoEn,
      unidad: unidad.nombre_de_unidad,
      cluesimb,
      responsable,
      periodo,
      articulos: articulos.map(item => ({ ...item, ...catalogoPorClave.get(item.clave)! })),
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

    return {
      solicitudId: registro.solicitudId,
      folio,
      cluesimb,
      unidad: unidad.nombre_de_unidad,
      periodo: periodo || null,
      totalInsumos: articulos.length,
      totalPiezas: articulos.reduce((total, item) => total + item.cantidad, 0),
      recibidoEn,
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
      SELECT cluesimb, nombre_de_unidad, es_segundo_nivel
      FROM public.v_unidad_medica_detalle
      WHERE UPPER(TRIM(cluesimb)) = $1
        AND es_segundo_nivel = false
      LIMIT 1
    `, [cluesimb]);
    return rows[0] ?? null;
  }

  private async obtenerArticulos(claves: string[]): Promise<ArticuloCatalogo[]> {
    const { rows } = await pool.query<ArticuloCatalogo>(`
      SELECT clave, descripcion, presentacion
      FROM public.articulos
      WHERE UPPER(TRIM(clave)) = ANY($1::text[])
      ORDER BY clave
    `, [claves]);
    return rows;
  }

  private async generarExcel(contexto: {
    folio: string;
    recibidoEn: string;
    unidad: string;
    cluesimb: string;
    responsable: string;
    periodo: string;
    articulos: Array<ArticuloCatalogo & { cantidad: number }>;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IMSS Bienestar BC';
    workbook.created = new Date(contexto.recibidoEn);
    const hoja = workbook.addWorksheet('Lista de necesidades');

    hoja.addRow(['LISTA DE NECESIDADES · PRIMER NIVEL']);
    hoja.addRow(['Folio', contexto.folio]);
    hoja.addRow(['Unidad', contexto.unidad]);
    hoja.addRow(['CLUES', contexto.cluesimb]);
    hoja.addRow(['Periodo', contexto.periodo || 'No especificado']);
    hoja.addRow(['Responsable', contexto.responsable || 'No especificado']);
    hoja.addRow(['Recibido', contexto.recibidoEn]);
    hoja.addRow([]);
    hoja.addRow(['Clave', 'Descripción', 'Presentación', 'Cantidad']);

    for (const articulo of contexto.articulos) {
      hoja.addRow([
        articulo.clave,
        articulo.descripcion ?? '',
        articulo.presentacion ?? '',
        articulo.cantidad,
      ]);
    }

    hoja.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF006B5F' } };
    hoja.getRow(9).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hoja.getRow(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006B5F' } };
    hoja.columns = [{ width: 22 }, { width: 70 }, { width: 38 }, { width: 14 }];
    hoja.views = [{ state: 'frozen', ySplit: 9 }];
    hoja.autoFilter = { from: 'A9', to: 'D9' };
    hoja.getColumn(4).numFmt = '0';
    contexto.articulos.forEach((_, index) => {
      hoja.getRow(index + 10).alignment = { vertical: 'top', wrapText: true };
    });

    const contenido = await workbook.xlsx.writeBuffer();
    return Buffer.from(contenido);
  }
}
