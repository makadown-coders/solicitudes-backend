import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { createWriteStream } from 'node:fs';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { setImmediate as ceder } from 'node:timers/promises';
import { once } from 'node:events';
import { Writable } from 'node:stream';

export type ArchivoReporte = { archivo: string; limpiar: () => Promise<void> };

export function* mapearFilas<T>(data: Iterable<T>, convertir: (row: T) => Record<string, unknown>) {
  for (const row of data) yield convertir(row);
}

// Sólo las hojas pequeñas de guía/resumen usan SheetJS; las tablas se escriben fila a fila.
export class LibroReporte {
  constructor(private readonly workbook: ExcelJS.stream.xlsx.WorkbookWriter, private readonly verificar: () => void,
    private readonly signal: AbortSignal) {}

  private async esperarEscritura(hoja: ExcelJS.Worksheet): Promise<void> {
    // ExcelJS 4.4 expone StreamBuf en WorksheetWriter.stream, pero no en sus tipos.
    // commit() libera las celdas; también hay que respetar al consumidor ZIP para
    // no acumular XML en buffers cuando el disco o la compresión van más lento.
    const canal = (hoja as unknown as { stream: { pipes: Writable[] } }).stream;
    do { await ceder(); this.verificar(); } while (!canal.pipes.length);
    for (const destino of canal.pipes) {
      if (destino.writableNeedDrain) await once(destino, 'drain', { signal: this.signal });
    }
    this.verificar();
  }

  hojaPequena(nombre: string, sheet: XLSX.WorkSheet): void {
    this.verificar();
    const freeze = sheet['!freeze'] as { ySplit: number } | undefined;
    const hoja = this.workbook.addWorksheet(nombre, freeze ? { views: [{ state: 'frozen', ySplit: freeze.ySplit }] } : {});
    if (sheet['!cols']) hoja.columns = sheet['!cols'].map(col => ({ width: col.wch }));
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    for (let r = 0; r <= range.e.r; r++) {
      const values: ExcelJS.CellValue[] = [];
      for (let c = 0; c <= range.e.c; c++) values.push(sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? null);
      const row = hoja.addRow(values);
      for (let c = 0; c <= range.e.c; c++) {
        const format = sheet[XLSX.utils.encode_cell({ r, c })]?.z;
        if (format) row.getCell(c + 1).numFmt = String(format);
      }
      row.commit();
    }
    if (sheet['!autofilter']) hoja.autoFilter = sheet['!autofilter'].ref;
    hoja.commit();
  }

  async tabla(nombre: string, data: Iterable<Record<string, unknown>>, mensaje: string,
    porcentajes: string[] = []): Promise<void> {
    const iterator = data[Symbol.iterator]();
    const muestra: Record<string, unknown>[] = [];
    for (let n = 0; n < 200; n++) {
      const next = iterator.next();
      if (next.done) break;
      muestra.push(next.value);
    }
    if (!muestra.length) muestra.push({ Mensaje: mensaje });
    const headers = Object.keys(muestra[0]);
    const hoja = this.workbook.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
    await this.esperarEscritura(hoja);
    hoja.columns = headers.map(header => ({ width: Math.min(48,
      Math.max(12, header.length + 2, ...muestra.map(row => String(row[header] ?? '').length + 2))) }));
    hoja.addRow(headers).commit();
    const columnasPorcentaje = headers.map((header, index) => porcentajes.includes(header) ? index + 1 : 0).filter(Boolean);
    let count = 1;
    const agregar = async (dataRow: Record<string, unknown>) => {
      this.verificar();
      if (count >= 1048576) throw new Error('El detalle excede el límite de filas de Excel.');
      const row = hoja.addRow(headers.map(header => dataRow[header] ?? null));
      for (const index of columnasPorcentaje) row.getCell(index).numFmt = '0.00%';
      row.commit();
      // Permite que compresión/disco avancen y evita bloquear health checks.
      if (++count % 100 === 0) await this.esperarEscritura(hoja);
    };
    for (const row of muestra) await agregar(row);
    for (let next = iterator.next(); !next.done; next = iterator.next()) await agregar(next.value);
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: count, column: headers.length } };
    hoja.commit();
    await ceder();
    this.verificar();
  }
}

export async function escribirArchivoReporte(escribir: (libro: LibroReporte) => Promise<void>): Promise<ArchivoReporte> {
  const directorio = await mkdtemp(join(tmpdir(), 'radar-reporte-'));
  const archivo = join(directorio, 'reporte.xlsx');
  const limpiar = async () => {
    await unlink(archivo).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(directorio).catch(error => { if (error.code !== 'ENOENT') throw error; });
  };
  const destino = createWriteStream(archivo);
  const cancelacion = new AbortController();
  let errorEscritura: Error | undefined;
  destino.on('error', error => { errorEscritura = error; cancelacion.abort(error); });
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: destino, useStyles: true, useSharedStrings: false, zip: { zlib: { level: 1 } }
  });
  const zip = (workbook as unknown as { zip: { on: (event: string, handler: (error: Error) => void) => void; abort: () => void } }).zip;
  zip.on('error', error => { errorEscritura = error; destino.destroy(error); });
  try {
    await escribir(new LibroReporte(workbook, () => { if (errorEscritura) throw errorEscritura; }, cancelacion.signal));
    await workbook.commit();
    return { archivo, limpiar };
  } catch (error) {
    zip.abort();
    destino.destroy();
    await finished(destino).catch(() => undefined);
    await limpiar();
    throw error;
  }
}
