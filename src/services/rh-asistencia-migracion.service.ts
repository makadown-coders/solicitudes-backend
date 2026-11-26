import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { pool } from '../db/pool';
import { RhHttpError, type RhAuditMeta } from './rh.service';

export const MAX_XLSX_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_BATCH_RECORDS = 2000;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MESES_HEADERS: ReadonlyArray<{ mes: number; nombre: string }> = [
  { mes: 1, nombre: 'ENERO' },
  { mes: 2, nombre: 'FEBRERO' },
  { mes: 3, nombre: 'MARZO' },
  { mes: 4, nombre: 'ABRIL' },
  { mes: 5, nombre: 'MAYO' },
  { mes: 6, nombre: 'JUNIO' },
  { mes: 7, nombre: 'JULIO' },
  { mes: 8, nombre: 'AGOSTO' },
  { mes: 9, nombre: 'SEPTIEMBRE' },
  { mes: 10, nombre: 'OCTUBRE' },
  { mes: 11, nombre: 'NOVIEMBRE' },
  { mes: 12, nombre: 'DICIEMBRE' },
];

export interface RhMigracionRegistroInput {
  persona_id: number;
  mes: number;
  unidad_medica_id?: number | null;
  hoja: string;
  fila: number;
  columna: string;
  nombre_excel: string;
  confirmado_por_rh: boolean;
}

export interface RhMigracionImportarInput {
  archivo_nombre: string;
  archivo_base64: string;
  archivo_hash_esperado: string;
  anio: number;
  registros: RhMigracionRegistroInput[];
}

export interface RhMigracionImportarResult {
  lote_id: string;
  archivo_hash: string;
  idempotente: boolean;
  importados: number;
  ya_existentes: number;
  ids_importados: number[];
  periodos_afectados: number[];
}

function normalizeText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function colIndexToLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export default class RhAsistenciaMigracionService {
  async importarHistorico2026(
    input: RhMigracionImportarInput,
    auditMeta: RhAuditMeta
  ): Promise<RhMigracionImportarResult> {
    const operatorId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!operatorId || !UUID_REGEX.test(operatorId)) {
      throw new RhHttpError(401, 'No se pudo identificar el UUID del operador autenticado');
    }

    if (input.anio !== 2026) {
      throw new RhHttpError(400, 'La migración histórica temporal solo admite el año 2026');
    }

    const archivoNombre = typeof input.archivo_nombre === 'string' ? input.archivo_nombre.trim() : '';
    if (!archivoNombre) {
      throw new RhHttpError(400, 'El campo "archivo_nombre" es obligatorio');
    }

    if (typeof input.archivo_base64 !== 'string' || !input.archivo_base64.trim()) {
      throw new RhHttpError(400, 'Es obligatorio enviar el archivo XLSX original para validación en servidor');
    }

    const buffer = Buffer.from(input.archivo_base64, 'base64');
    if (buffer.length === 0) {
      throw new RhHttpError(400, 'El archivo XLSX enviado está vacío');
    }
    if (buffer.length > MAX_XLSX_BYTES) {
      throw new RhHttpError(400, `El archivo XLSX excede el límite permitido de ${MAX_XLSX_BYTES / (1024 * 1024)} MB`);
    }

    const realHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const expectedHash =
      typeof input.archivo_hash_esperado === 'string' ? input.archivo_hash_esperado.trim().toLowerCase() : '';
    if (!expectedHash || realHash !== expectedHash) {
      throw new RhHttpError(
        400,
        'La huella SHA-256 del archivo XLSX no coincide con la conciliación presentada'
      );
    }

    if (!Array.isArray(input.registros) || input.registros.length === 0) {
      throw new RhHttpError(400, 'Debe enviar al menos un registro aprobado para importar');
    }
    if (input.registros.length > MAX_BATCH_RECORDS) {
      throw new RhHttpError(400, `El lote excede el máximo permitido de ${MAX_BATCH_RECORDS} registros`);
    }

    // Reconstruir y validar el Excel original en memoria (sin almacenar en disco)
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new RhHttpError(400, 'El archivo proporcionado no es un libro XLSX válido');
    }

    const sheetMatrices = new Map<string, { matrix: unknown[][]; colNombre: number; mesColMap: Map<number, number> }>();
    for (const sName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: true,
      });

      let colNombre = -1;
      const mesColMap = new Map<number, number>();
      for (let r = 0; r < Math.min(matrix.length, 15); r++) {
        const norm = (matrix[r] ?? []).map((c) => normalizeText(String(c ?? '')));
        const pIdx = norm.findIndex((c) => c === 'PUESTO');
        const nIdx = norm.findIndex((c) => c === 'NOMBRE');
        const eneIdx = norm.findIndex((c) => c === 'ENERO');
        if (pIdx >= 0 && nIdx >= 0 && eneIdx >= 0) {
          colNombre = nIdx;
          for (const m of MESES_HEADERS) {
            const idx = norm.findIndex((c) => c === m.nombre);
            if (idx >= 0) mesColMap.set(m.mes, idx);
          }
          break;
        }
      }
      if (colNombre >= 0 && mesColMap.size >= 6) {
        sheetMatrices.set(sName, { matrix, colNombre, mesColMap });
      }
    }

    if (sheetMatrices.size === 0) {
      throw new RhHttpError(400, 'El archivo XLSX no tiene la estructura esperada de CONTROL LISTA DE ASISTENCIA - 2026');
    }

    // Validar cada registro contra el Excel original y detectar duplicados internos
    const seenKeys = new Set<string>();
    const periodosSet = new Set<number>();

    for (const reg of input.registros) {
      if (reg.confirmado_por_rh !== true) {
        throw new RhHttpError(400, `El registro de persona_id=${reg.persona_id} no cuenta con confirmación explícita de RH`);
      }
      if (!Number.isSafeInteger(reg.persona_id) || reg.persona_id <= 0) {
        throw new RhHttpError(400, 'Todos los registros deben incluir un "persona_id" entero positivo válido');
      }
      if (!Number.isInteger(reg.mes) || reg.mes < 1 || reg.mes > 12) {
        throw new RhHttpError(400, `Mes inválido (${reg.mes}) para persona_id=${reg.persona_id}`);
      }
      const key = `${reg.persona_id}:${reg.mes}`;
      if (seenKeys.has(key)) {
        throw new RhHttpError(400, `Duplicado interno en el lote para persona_id=${reg.persona_id}, mes=${reg.mes}`);
      }
      seenKeys.add(key);
      periodosSet.add(reg.mes);

      const parsedSheet = sheetMatrices.get(reg.hoja);
      if (!parsedSheet) {
        throw new RhHttpError(400, `La hoja "${reg.hoja}" no existe o no es válida en el archivo XLSX`);
      }
      const rowIdx = Number(reg.fila) - 1;
      const excelRow = parsedSheet.matrix[rowIdx];
      if (!excelRow) {
        throw new RhHttpError(400, `La fila ${reg.fila} no existe en la hoja "${reg.hoja}"`);
      }

      const excelNombreNorm = normalizeText(String(excelRow[parsedSheet.colNombre] ?? ''));
      const inputNombreNorm = normalizeText(reg.nombre_excel);
      if (!excelNombreNorm || excelNombreNorm === 'VACANTE' || excelNombreNorm !== inputNombreNorm) {
        throw new RhHttpError(
          400,
          `Discrepancia entre la conciliación y el Excel en ${reg.hoja}!R${reg.fila}`
        );
      }

      const mesColIdx = parsedSheet.mesColMap.get(reg.mes);
      if (mesColIdx === undefined) {
        throw new RhHttpError(400, `Columna del mes ${reg.mes} no encontrada en hoja "${reg.hoja}"`);
      }
      const expectedColLetter = colIndexToLetter(mesColIdx);
      if (expectedColLetter !== String(reg.columna ?? '').trim().toUpperCase()) {
        throw new RhHttpError(
          400,
          `Columna "${reg.columna}" no corresponde al mes ${reg.mes} (esperada: ${expectedColLetter})`
        );
      }

      const cellNorm = normalizeText(String(excelRow[mesColIdx] ?? ''));
      if (cellNorm !== 'X') {
        throw new RhHttpError(
          400,
          `La celda ${reg.hoja}!${expectedColLetter}${reg.fila} no contiene una marca X válida`
        );
      }
    }

    // Transacción atómica en PostgreSQL
    const loteId = crypto.randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [20260502, 1]);

      // 1) Validar existencia de todas las personas
      const uniquePersonaIds = Array.from(new Set(input.registros.map((r) => r.persona_id)));
      const personasRes = await client.query<{ id: number }>(
        'SELECT id FROM public.persona WHERE id = ANY($1::int[])',
        [uniquePersonaIds]
      );
      const existingPersonas = new Set(personasRes.rows.map((r) => Number(r.id)));
      for (const pid of uniquePersonaIds) {
        if (!existingPersonas.has(pid)) {
          throw new RhHttpError(400, `La persona_id=${pid} no existe en public.persona`);
        }
      }

      // 2) Revisar registros existentes en public.rh_asistencia_entrega_mensual (FOR UPDATE)
      const existingRes = await client.query<{
        id: number;
        persona_id: number;
        mes: number;
        estado: string;
        origen_registro: string;
        referencia_migracion: { archivo_hash?: string } | null;
      }>(
        `SELECT id, persona_id, mes, estado, origen_registro, referencia_migracion
         FROM public.rh_asistencia_entrega_mensual
         WHERE anio = 2026 AND persona_id = ANY($1::int[])
         FOR UPDATE`,
        [uniquePersonaIds]
      );

      const existingMap = new Map(
        existingRes.rows.map((r) => [`${r.persona_id}:${r.mes}`, r])
      );

      let matchedIdempotentCount = 0;
      const conflicts: string[] = [];

      for (const reg of input.registros) {
        const ex = existingMap.get(`${reg.persona_id}:${reg.mes}`);
        if (ex) {
          const sameOrigin = ex.origen_registro === 'MIGRACION_HISTORICA_EXCEL';
          const sameEstado = ex.estado === 'RECIBIDA';
          const sameHash = ex.referencia_migracion?.archivo_hash === realHash;
          if (sameOrigin && sameEstado && sameHash) {
            matchedIdempotentCount++;
          } else {
            conflicts.push(`persona_id=${reg.persona_id} mes=${reg.mes} (estado=${ex.estado}, origen=${ex.origen_registro})`);
          }
        }
      }

      // Si TODO el lote ya fue importado con exactamente la misma huella -> idempotente
      if (matchedIdempotentCount === input.registros.length && conflicts.length === 0) {
        await client.query('COMMIT');
        return {
          lote_id: loteId,
          archivo_hash: realHash,
          idempotente: true,
          importados: 0,
          ya_existentes: matchedIdempotentCount,
          ids_importados: [],
          periodos_afectados: Array.from(periodosSet).sort((a, b) => a - b),
        };
      }

      // Si hay conflictos o solo una parte del lote ya existía -> rechazar completo con ROLLBACK
      if (conflicts.length > 0 || matchedIdempotentCount > 0) {
        throw new RhHttpError(
          409,
          conflicts.length > 0
            ? `Conflicto con registros existentes en PostgreSQL: ${conflicts.slice(0, 5).join('; ')}`
            : `Lote parcialmente existente (${matchedIdempotentCount} de ${input.registros.length} ya importados). Reconcilie antes de reintentar.`
        );
      }

      // 3) Insertar todos los registros aprobados
      const idsImportados: number[] = [];
      for (const reg of input.registros) {
        const refJson = {
          lote_id: loteId,
          archivo_nombre: archivoNombre,
          archivo_hash: realHash,
          hoja: reg.hoja,
          fila: String(reg.fila),
          columna: String(reg.columna).trim().toUpperCase(),
          mes: reg.mes,
          valor_original: 'X',
        };

        const insRes = await client.query<{ id: number }>(
          `INSERT INTO public.rh_asistencia_entrega_mensual (
             persona_id, anio, mes, unidad_medica_id,
             estado, fecha_recepcion, recibido_por,
             excepcion_administrativa, motivo_excepcion,
             origen_registro, referencia_migracion, importado_en, importado_por,
             creado_por, actualizado_por
           )
           VALUES (
             $1, 2026, $2, $3,
             'RECIBIDA', NULL, NULL,
             FALSE, NULL,
             'MIGRACION_HISTORICA_EXCEL', $4::jsonb, NOW(), $5::uuid,
             $5::uuid, $5::uuid
           )
           RETURNING id`,
          [reg.persona_id, reg.mes, reg.unidad_medica_id ?? null, JSON.stringify(refJson), operatorId]
        );
        idsImportados.push(Number(insRes.rows[0].id));
      }

      // 4) Auditoría transaccional en public.app_audit_logs
      const periodosAfectados = Array.from(periodosSet).sort((a, b) => a - b);
      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1::uuid, 'RH_ASISTENCIA_MIGRACION_HISTORICA_2026', $2, $3, $4, $5::jsonb)`,
        [
          operatorId,
          `rh_asistencia_migracion_2026:${loteId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify({
            lote_id: loteId,
            operador_user_id: operatorId,
            fecha_importacion: new Date().toISOString(),
            archivo_hash: realHash,
            cantidad_registros: idsImportados.length,
            ids_importados: idsImportados,
            periodos_afectados: periodosAfectados,
          }),
        ]
      );

      await client.query('COMMIT');
      return {
        lote_id: loteId,
        archivo_hash: realHash,
        idempotente: false,
        importados: idsImportados.length,
        ya_existentes: 0,
        ids_importados: idsImportados,
        periodos_afectados: periodosAfectados,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
