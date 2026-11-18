import { pool } from '../db/pool';
import type { RhAccessContext, RhAccessScope } from '../auth/requireRhAccess';

export interface RhUnidadAutorizada {
  id: number;
  nombre: string;
  cluesimb: string | null;
}

export interface RhUnidadesAutorizadasResult {
  scope: RhAccessScope;
  unidades: RhUnidadAutorizada[];
}

export interface RhPersonalUnidadItem {
  persona_id: number;
  nombre_completo: string;
  adscripcion_laboral_id: number;
  unidad_medica_id: number;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
}

export interface RhPersonalUnidadPagedResult {
  unidad: RhUnidadAutorizada;
  items: RhPersonalUnidadItem[];
  page: number;
  pageSize: number;
  total: number;
}

export type RhPersonaCandidataSituacion =
  | 'DISPONIBLE_DIRECTORIO'
  | 'YA_ADSCRITA_EN_UNIDAD'
  | 'REQUIERE_VALIDACION_OTRA_ADSCRIPCION';

export interface RhPersonaCandidataItem {
  persona_id: number;
  nombre_completo: string;
  cargo_directorio: string | null;
  unidad_medica_id_directorio: number | null;
  unidad_medica_directorio: string | null;
  coincide_unidad_directorio: boolean;
  tiene_adscripcion_rh_en_unidad: boolean;
  tiene_adscripcion_rh_activa_en_otra_unidad: boolean;
  requiere_validacion_previa: boolean;
  situacion_rh: RhPersonaCandidataSituacion;
}

export interface RhPersonasCandidatasPagedResult {
  unidad: RhUnidadAutorizada;
  items: RhPersonaCandidataItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RhListQueryOpts {
  q?: string | null;
  page?: number;
  pageSize?: number;
}

export interface RhCreateAdscripcionInput {
  persona_id: number;
  matricula?: string | null;
  puesto?: string | null;
  turno?: string | null;
  jornada?: string | null;
  horario?: string | null;
  vigente_desde: string;
  vigente_hasta?: string | null;
}

export interface RhAuditMeta {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface RhCreateAdscripcionResult {
  adscripcion_laboral_id: number;
  persona_id: number;
  nombre_completo: string;
  unidad: RhUnidadAutorizada;
  unidad_medica_id: number;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
}

export interface RhTrabajadorFichaPersonal {
  persona_id: number;
  nombre_completo: string;
  nombres: string | null;
  apellidos: string | null;
  tiene_rfc: boolean;
  rfc_masked: string | null;
  tiene_curp: boolean;
  curp_masked: string | null;
  activo: boolean;
}

export interface RhTrabajadorFichaLaboral {
  adscripcion_laboral_id: number;
  unidad_medica_id: number;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  observaciones: string | null;
}

export interface RhTrabajadorFichaPermisos {
  puede_editar_laboral: boolean;
  puede_revelar_sensibles: boolean;
  puede_editar_identificacion: boolean;
}

export interface RhTrabajadorFichaResult {
  unidad: RhUnidadAutorizada;
  personal: RhTrabajadorFichaPersonal;
  laboral: RhTrabajadorFichaLaboral;
  permisos: RhTrabajadorFichaPermisos;
}

export interface RhUpdateAdscripcionLaboralInput {
  matricula?: string | null;
  puesto?: string | null;
  turno?: string | null;
  jornada?: string | null;
  horario?: string | null;
  vigente_desde?: string;
  vigente_hasta?: string | null;
  activo?: boolean;
  observaciones?: string | null;
}

export interface RhUpdateAdscripcionLaboralResult {
  unidad: RhUnidadAutorizada;
  laboral: RhTrabajadorFichaLaboral;
  campos_modificados: string[];
}

export interface RhRevealIdentificadoresResult {
  persona_id: number;
  rfc: string | null;
  curp: string | null;
}

export interface RhUpdatePersonaIdentificacionResult {
  unidad: RhUnidadAutorizada;
  personal: RhTrabajadorFichaPersonal;
  campos_modificados: string[];
}

export class RhHttpError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = 'RhHttpError';
    Object.setPrototypeOf(this, RhHttpError.prototype);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatDateOnly(val: unknown): string | null {
  if (val === null || val === undefined) {
    return null;
  }
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  if (!str) {
    return null;
  }
  return str.length >= 10 ? str.slice(0, 10) : str;
}

function parseStrictIsoDate(raw: unknown, fieldLabel: string): string {
  if (typeof raw !== 'string') {
    throw new RhHttpError(400, `El campo "${fieldLabel}" debe ser una fecha con formato YYYY-MM-DD`);
  }
  const trimmed = raw.trim();
  if (!ISO_DATE_REGEX.test(trimmed)) {
    throw new RhHttpError(400, `El campo "${fieldLabel}" debe tener formato YYYY-MM-DD válido`);
  }
  const [yStr, mStr, dStr] = trimmed.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RhHttpError(400, `El campo "${fieldLabel}" no representa una fecha calendario válida`);
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    throw new RhHttpError(400, `El campo "${fieldLabel}" no representa una fecha calendario válida`);
  }
  return trimmed;
}

function normalizeOptionalVarchar(
  raw: unknown,
  fieldLabel: string,
  maxLength: number
): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new RhHttpError(400, `El campo "${fieldLabel}" debe ser una cadena de texto o null`);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new RhHttpError(
      400,
      `El campo "${fieldLabel}" no puede exceder ${maxLength} caracteres`
    );
  }
  return trimmed;
}

const RFC_PERSONA_FISICA_REGEX =
  /^[A-ZÑ&]{4}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{3})?$/;

const CURP_REGEX =
  /^[A-Z][AEIOUX][A-Z]{2}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX][A-Z]{2}[A-Z\d]{3}[A-Z\d]\d$/;

function isValidTwoDigitMonthDay(mmStr: string, ddStr: string): boolean {
  const month = Number(mmStr);
  const day = Number(ddStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  // Usar año bisiesto de referencia (2000) para permitir 29 de febrero en validación de MM-DD
  // y rechazar días imposibles como 30/31 de febrero o 31 de abril/junio/septiembre/noviembre
  const dt = new Date(Date.UTC(2000, month - 1, day));
  return dt.getUTCMonth() + 1 === month && dt.getUTCDate() === day;
}

function normalizeAndValidateRfc(raw: unknown): string | null {
  if (raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new RhHttpError(400, 'El campo "rfc" debe ser una cadena de texto o null');
  }
  const clean = raw.trim().toUpperCase();
  if (clean.length === 0) {
    return null;
  }
  if (clean.includes('*')) {
    throw new RhHttpError(
      400,
      'No se permite guardar un RFC enmascarado con asteriscos; envía el RFC completo o null'
    );
  }
  const match = RFC_PERSONA_FISICA_REGEX.exec(clean);
  if (!match || !isValidTwoDigitMonthDay(match[2], match[3])) {
    throw new RhHttpError(
      400,
      'El campo "rfc" no cumple con el formato estructural válido de persona física (10 o 13 caracteres)'
    );
  }
  return clean;
}

function normalizeAndValidateCurp(raw: unknown): string | null {
  if (raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new RhHttpError(400, 'El campo "curp" debe ser una cadena de texto o null');
  }
  const clean = raw.trim().toUpperCase();
  if (clean.length === 0) {
    return null;
  }
  if (clean.includes('*')) {
    throw new RhHttpError(
      400,
      'No se permite guardar una CURP enmascarada con asteriscos; envía la CURP completa o null'
    );
  }
  const match = CURP_REGEX.exec(clean);
  if (!match || !isValidTwoDigitMonthDay(match[2], match[3])) {
    throw new RhHttpError(
      400,
      'El campo "curp" debe tener exactamente 18 caracteres con estructura oficial válida'
    );
  }
  return clean;
}

function normalizeCollapsedPersonNamePart(
  raw: unknown,
  fieldLabel: string,
  maxLength: number
): string | null {
  if (raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new RhHttpError(400, `El campo "${fieldLabel}" debe ser una cadena de texto o null`);
  }
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed.length === 0) {
    return null;
  }
  if (collapsed.length > maxLength) {
    throw new RhHttpError(
      400,
      `El campo "${fieldLabel}" no puede exceder ${maxLength} caracteres`
    );
  }
  return collapsed;
}

function dateRangesOverlap(
  startA: string,
  endA: string | null,
  startB: string,
  endB: string | null
): boolean {
  const effectiveEndA = endA ?? '9999-12-31';
  const effectiveEndB = endB ?? '9999-12-31';
  return startA <= effectiveEndB && startB <= effectiveEndA;
}

/**
 * Enmascara un identificador sensible (RFC o CURP) preservando su longitud real
 * y mostrando únicamente los últimos `visibleTailChars` caracteres (3 para RFC, 2 para CURP).
 * Si el valor es nulo, vacío o demasiado corto para preservar el enmascaramiento sin exponer
 * iniciales/fecha, oculta la totalidad de caracteres o devuelve null según corresponda.
 */
function maskSensitiveIdentifier(
  raw: unknown,
  visibleTailChars: number
): { exists: boolean; masked: string | null } {
  if (raw === null || raw === undefined) {
    return { exists: false, masked: null };
  }
  const clean = String(raw).trim();
  if (clean.length === 0) {
    return { exists: false, masked: null };
  }
  if (clean.length <= visibleTailChars) {
    return { exists: true, masked: '*'.repeat(clean.length) };
  }
  const hiddenCount = clean.length - visibleTailChars;
  return {
    exists: true,
    masked: '*'.repeat(hiddenCount) + clean.slice(-visibleTailChars),
  };
}

function buildEffectiveFichaPermisos(access: RhAccessContext): RhTrabajadorFichaPermisos {
  const isRhOperativo = access.grantedBy === 'RECURSOS_HUMANOS';
  const isRhGlobal = isRhOperativo && access.scope === 'GLOBAL';
  return {
    puede_editar_laboral: isRhOperativo && (access.scope === 'GLOBAL' || access.scope === 'CLUES'),
    puede_revelar_sensibles: isRhGlobal,
    puede_editar_identificacion: isRhGlobal,
  };
}

export default class RhService {
  async getUnidadesAutorizadas(access: RhAccessContext): Promise<RhUnidadesAutorizadasResult> {
    if (access.scope === 'GLOBAL') {
      const { rows } = await pool.query<{ id: number; nombre: string; cluesimb: string | null }>(
        `SELECT id, nombre, cluesimb
           FROM public.unidad_medica
          WHERE activo = TRUE
          ORDER BY LOWER(TRIM(nombre)) ASC, id ASC`
      );
      return {
        scope: 'GLOBAL',
        unidades: rows.map((r) => ({
          id: Number(r.id),
          nombre: String(r.nombre),
          cluesimb: r.cluesimb ?? null,
        })),
      };
    }

    const validClues = access.clues
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length > 0 && c !== 'N/A');

    if (validClues.length === 0) {
      return {
        scope: 'CLUES',
        unidades: [],
      };
    }

    const { rows } = await pool.query<{ id: number; nombre: string; cluesimb: string | null }>(
      `WITH candidatas AS (
         SELECT
           id,
           nombre,
           cluesimb,
           COUNT(*) OVER (PARTITION BY UPPER(TRIM(cluesimb))) AS coincidencias
         FROM public.unidad_medica
         WHERE activo = TRUE
           AND NULLIF(UPPER(TRIM(cluesimb)), '') IS NOT NULL
           AND UPPER(TRIM(cluesimb)) <> 'N/A'
           AND UPPER(TRIM(cluesimb)) = ANY($1::text[])
       )
       SELECT DISTINCT id, nombre, cluesimb
       FROM candidatas
       WHERE coincidencias = 1
       ORDER BY LOWER(TRIM(nombre)) ASC, id ASC`,
      [validClues]
    );

    return {
      scope: 'CLUES',
      unidades: rows.map((r) => ({
        id: Number(r.id),
        nombre: String(r.nombre),
        cluesimb: r.cluesimb ?? null,
      })),
    };
  }

  /**
   * Valida que `unidadMedicaId` exista, esté activa y pertenezca al alcance autorizado del operador:
   * - `GLOBAL` (`RECURSOS_HUMANOS GLOBAL` o `ADMIN_TIC GLOBAL`): exige que la unidad exista y tenga `activo = TRUE`
   *   (responde 404 si no existe o está inactiva).
   * - `CLUES` (`RECURSOS_HUMANOS CLUES`): resuelve el conjunto autorizado mediante `getUnidadesAutorizadas(access)`
   *   y exige que `unidadMedicaId` pertenezca a ese conjunto; si no pertenece, responde 403 sin revelar si un ID
   *   ajeno existe o no en el catálogo.
   * Nunca utiliza `persona.unidad_medica_id` para determinar permisos del operador.
   */
  async assertUnidadAutorizada(
    access: RhAccessContext,
    unidadMedicaId: number
  ): Promise<RhUnidadAutorizada> {
    if (!Number.isInteger(unidadMedicaId) || unidadMedicaId <= 0) {
      throw new RhHttpError(400, 'Identificador de unidad de trabajo inválido');
    }

    if (access.scope === 'CLUES') {
      const { unidades } = await this.getUnidadesAutorizadas(access);
      const matched = unidades.find((u) => u.id === unidadMedicaId);
      if (!matched) {
        throw new RhHttpError(
          403,
          'No tienes autorización para consultar ni operar información de esta unidad de trabajo'
        );
      }
      return matched;
    }

    const { rows } = await pool.query<{ id: number; nombre: string; cluesimb: string | null }>(
      `SELECT id, nombre, cluesimb
         FROM public.unidad_medica
        WHERE id = $1
          AND activo = TRUE`,
      [unidadMedicaId]
    );

    const row = rows[0];
    if (!row) {
      throw new RhHttpError(404, 'Unidad de trabajo no encontrada o inactiva');
    }

    return {
      id: Number(row.id),
      nombre: String(row.nombre),
      cluesimb: row.cluesimb ?? null,
    };
  }

  /**
   * Consulta paginada de solo lectura del padrón laboral de una unidad (`GET /api/rh/unidades/:unidadId/personal`).
   * Devuelve únicamente trabajadores que cuentan con registro formal en `public.rh_adscripcion_laboral`
   * para la unidad autorizada. No genera adscripciones automáticas ni expone RFC, CURP, correos o secretos.
   */
  async listPersonalPorUnidad(
    access: RhAccessContext,
    unidadMedicaId: number,
    opts: RhListQueryOpts = {}
  ): Promise<RhPersonalUnidadPagedResult> {
    const unidad = await this.assertUnidadAutorizada(access, unidadMedicaId);

    const rawPageSize = Number(opts.pageSize ?? 20);
    const rawPage = Number(opts.page ?? 1);
    const pageSize = Math.min(Math.max(Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 20, 1), 100);
    const page = Math.max(Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1, 1);
    const offset = (page - 1) * pageSize;

    const params: unknown[] = [unidad.id];
    const conditions: string[] = ['al.unidad_medica_id = $1'];

    const q = typeof opts.q === 'string' ? opts.q.trim() : '';
    if (q.length > 0) {
      params.push(q.toLowerCase());
      const qParam = `$${params.length}`;
      conditions.push(`(
        LOWER(COALESCE(p.nombre_completo, '')) LIKE '%' || ${qParam} || '%' OR
        LOWER(COALESCE(al.matricula, '')) LIKE '%' || ${qParam} || '%'
      )`);
    }

    params.push(pageSize);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const sql = `
      SELECT
        p.id AS persona_id,
        p.nombre_completo,
        al.id AS adscripcion_laboral_id,
        al.unidad_medica_id,
        al.matricula,
        al.puesto,
        al.turno,
        al.jornada,
        al.horario,
        al.vigente_desde,
        al.vigente_hasta,
        al.activo,
        COUNT(*) OVER() AS total
      FROM public.rh_adscripcion_laboral al
      JOIN public.persona p
        ON p.id = al.persona_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        al.activo DESC,
        LOWER(TRIM(p.nombre_completo)) ASC,
        al.vigente_desde DESC,
        al.id DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const { rows } = await pool.query(sql, params);
    const total = rows.length > 0 ? Number(rows[0].total) : 0;

    const items: RhPersonalUnidadItem[] = rows.map((r: any) => ({
      persona_id: Number(r.persona_id),
      nombre_completo: String(r.nombre_completo ?? ''),
      adscripcion_laboral_id: Number(r.adscripcion_laboral_id),
      unidad_medica_id: Number(r.unidad_medica_id),
      matricula: r.matricula != null ? String(r.matricula) : null,
      puesto: r.puesto != null ? String(r.puesto) : null,
      turno: r.turno != null ? String(r.turno) : null,
      jornada: r.jornada != null ? String(r.jornada) : null,
      horario: r.horario != null ? String(r.horario) : null,
      vigente_desde: formatDateOnly(r.vigente_desde) ?? '',
      vigente_hasta: formatDateOnly(r.vigente_hasta),
      activo: Boolean(r.activo),
    }));

    return {
      unidad,
      items,
      page,
      pageSize,
      total,
    };
  }

  /**
   * Consulta paginada y de solo lectura de personas activas en `public.persona` que pueden ser
   * vinculadas posteriormente al padrón laboral de la unidad (`GET /api/rh/unidades/:unidadId/personas-candidatas`).
   * - Alcance `GLOBAL`: consulta personas activas institucionales (manteniendo clasificación de situación laboral).
   * - Alcance `CLUES`: restringe desde SQL (`p.unidad_medica_id = $1`) exclusivamente a personas activas
   *   asociadas en el directorio a la unidad autorizada consultada.
   */
  async listPersonasCandidatasPorUnidad(
    access: RhAccessContext,
    unidadMedicaId: number,
    opts: RhListQueryOpts = {}
  ): Promise<RhPersonasCandidatasPagedResult> {
    const unidad = await this.assertUnidadAutorizada(access, unidadMedicaId);

    const rawPageSize = Number(opts.pageSize ?? 20);
    const rawPage = Number(opts.page ?? 1);
    const pageSize = Math.min(Math.max(Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 20, 1), 100);
    const page = Math.max(Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1, 1);
    const offset = (page - 1) * pageSize;

    const params: unknown[] = [unidad.id];
    const conditions: string[] = ['p.activo = TRUE'];

    if (access.scope === 'CLUES') {
      conditions.push('p.unidad_medica_id = $1');
    }

    const q = typeof opts.q === 'string' ? opts.q.trim() : '';
    if (q.length > 0) {
      params.push(q.toLowerCase());
      const qParam = `$${params.length}`;
      conditions.push(`(
        LOWER(COALESCE(p.nombre_completo, '')) LIKE '%' || ${qParam} || '%' OR
        LOWER(COALESCE(p.cargo, '')) LIKE '%' || ${qParam} || '%' OR
        EXISTS (
          SELECT 1
            FROM public.rh_adscripcion_laboral al_q
           WHERE al_q.persona_id = p.id
             AND LOWER(COALESCE(al_q.matricula, '')) LIKE '%' || ${qParam} || '%'
        )
      )`);
    }

    params.push(pageSize);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const sql = `
      SELECT
        p.id AS persona_id,
        p.nombre_completo,
        p.cargo AS cargo_directorio,
        p.unidad_medica_id AS unidad_medica_id_directorio,
        um.nombre AS unidad_medica_directorio,
        (p.unidad_medica_id = $1) AS coincide_unidad_directorio,
        COALESCE(rh_curr.tiene_adscripcion_en_unidad, FALSE) AS tiene_adscripcion_rh_en_unidad,
        COALESCE(rh_other.tiene_adscripcion_activa_otra_unidad, FALSE) AS tiene_adscripcion_rh_activa_en_otra_unidad,
        COUNT(*) OVER() AS total
      FROM public.persona p
      LEFT JOIN public.unidad_medica um
        ON um.id = p.unidad_medica_id
      LEFT JOIN LATERAL (
        SELECT TRUE AS tiene_adscripcion_en_unidad
          FROM public.rh_adscripcion_laboral al
         WHERE al.persona_id = p.id
           AND al.unidad_medica_id = $1
         LIMIT 1
      ) rh_curr ON TRUE
      LEFT JOIN LATERAL (
        SELECT TRUE AS tiene_adscripcion_activa_otra_unidad
          FROM public.rh_adscripcion_laboral al2
         WHERE al2.persona_id = p.id
           AND al2.unidad_medica_id <> $1
           AND al2.activo = TRUE
         LIMIT 1
      ) rh_other ON TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE WHEN p.unidad_medica_id = $1 THEN 0 ELSE 1 END ASC,
        LOWER(TRIM(p.nombre_completo)) ASC,
        p.id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const { rows } = await pool.query(sql, params);
    const total = rows.length > 0 ? Number(rows[0].total) : 0;

    const items: RhPersonaCandidataItem[] = rows.map((r: any) => {
      const dirUnidadId = r.unidad_medica_id_directorio != null ? Number(r.unidad_medica_id_directorio) : null;
      const coincideUnidadDirectorio = Boolean(r.coincide_unidad_directorio);
      const tieneAdscripcionEnUnidad = Boolean(r.tiene_adscripcion_rh_en_unidad);
      const tieneAdscripcionActivaEnOtraUnidad = Boolean(r.tiene_adscripcion_rh_activa_en_otra_unidad);
      const tieneOtraUnidadEnDirectorio = dirUnidadId !== null && dirUnidadId !== unidad.id;

      const requiereValidacionPrevia =
        !tieneAdscripcionEnUnidad && (tieneAdscripcionActivaEnOtraUnidad || tieneOtraUnidadEnDirectorio);

      let situacionRh: RhPersonaCandidataSituacion = 'DISPONIBLE_DIRECTORIO';
      if (tieneAdscripcionEnUnidad) {
        situacionRh = 'YA_ADSCRITA_EN_UNIDAD';
      } else if (requiereValidacionPrevia) {
        situacionRh = 'REQUIERE_VALIDACION_OTRA_ADSCRIPCION';
      }

      const exposeDirectorioUnidad =
        access.scope === 'GLOBAL' || coincideUnidadDirectorio;

      return {
        persona_id: Number(r.persona_id),
        nombre_completo: String(r.nombre_completo ?? ''),
        cargo_directorio: r.cargo_directorio != null ? String(r.cargo_directorio) : null,
        unidad_medica_id_directorio: exposeDirectorioUnidad ? dirUnidadId : null,
        unidad_medica_directorio:
          exposeDirectorioUnidad && r.unidad_medica_directorio != null
            ? String(r.unidad_medica_directorio)
            : null,
        coincide_unidad_directorio: coincideUnidadDirectorio,
        tiene_adscripcion_rh_en_unidad: tieneAdscripcionEnUnidad,
        tiene_adscripcion_rh_activa_en_otra_unidad: tieneAdscripcionActivaEnOtraUnidad,
        requiere_validacion_previa: requiereValidacionPrevia,
        situacion_rh: situacionRh,
      };
    });

    return {
      unidad,
      items,
      page,
      pageSize,
      total,
    };
  }

  /**
   * Registra una adscripción laboral en `public.rh_adscripcion_laboral` para una persona existente y activa
   * dentro de una unidad autorizada (`POST /api/rh/unidades/:unidadId/adscripciones`).
   *
   * Reglas de seguridad e integridad:
   * - Exclusivo para cuentas con rol operativo `RECURSOS_HUMANOS` (`GLOBAL` o `CLUES` autorizado).
   *   Las cuentas que solo tienen `ADMIN_TIC GLOBAL` reciben HTTP 403.
   * - Valida autorización sobre `unidadMedicaId` mediante `assertUnidadAutorizada()`.
   * - Bloquea la fila de `public.persona` con `FOR UPDATE` para serializar solicitudes concurrentes
   *   sobre la misma persona y evitar altas duplicadas simultáneas.
   * - No inserta ni modifica registros en `public.persona`.
   * - Si la persona tiene en el directorio una `unidad_medica_id` distinta a la unidad objetivo,
   *   o si ya cuenta con adscripción activa o con vigencias solapadas, devuelve HTTP 409.
   * - Registra el evento en `public.app_audit_logs` (`RH_CREATE_ADSCRIPCION_LABORAL`) en la misma transacción.
   */
  async createAdscripcionLaboral(
    access: RhAccessContext,
    unidadMedicaId: number,
    input: RhCreateAdscripcionInput,
    auditMeta: RhAuditMeta
  ): Promise<RhCreateAdscripcionResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS') {
      throw new RhHttpError(
        403,
        'Solo el personal operativo con rol RECURSOS_HUMANOS puede registrar adscripciones laborales'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    const unidad = await this.assertUnidadAutorizada(access, unidadMedicaId);

    if (
      typeof input.persona_id !== 'number' ||
      !Number.isSafeInteger(input.persona_id) ||
      input.persona_id <= 0
    ) {
      throw new RhHttpError(400, 'El campo "persona_id" debe ser un entero positivo válido');
    }

    const matricula = normalizeOptionalVarchar(input.matricula, 'matricula', 64);
    const puesto = normalizeOptionalVarchar(input.puesto, 'puesto', 160);
    const turno = normalizeOptionalVarchar(input.turno, 'turno', 60);
    const jornada = normalizeOptionalVarchar(input.jornada, 'jornada', 80);
    const horario = normalizeOptionalVarchar(input.horario, 'horario', 120);

    const vigenteDesde = parseStrictIsoDate(input.vigente_desde, 'vigente_desde');
    let vigenteHasta: string | null = null;
    if (input.vigente_hasta !== undefined && input.vigente_hasta !== null) {
      if (typeof input.vigente_hasta === 'string' && input.vigente_hasta.trim() === '') {
        vigenteHasta = null;
      } else {
        vigenteHasta = parseStrictIsoDate(input.vigente_hasta, 'vigente_hasta');
      }
    }

    if (vigenteHasta !== null && vigenteHasta < vigenteDesde) {
      throw new RhHttpError(
        400,
        'La fecha "vigente_hasta" debe ser igual o posterior a "vigente_desde"'
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) Bloquear la fila de public.persona con FOR UPDATE para serializar altas concurrentes de la misma persona
      const personaRes = await client.query<{
        id: number;
        nombre_completo: string;
        unidad_medica_id: number | null;
        activo: boolean;
      }>(
        `SELECT id, nombre_completo, unidad_medica_id, activo
           FROM public.persona
          WHERE id = $1
            FOR UPDATE`,
        [input.persona_id]
      );

      if (!personaRes.rowCount) {
        throw new RhHttpError(404, 'La persona especificada no existe en el directorio');
      }

      const persona = personaRes.rows[0];
      if (persona.activo !== true) {
        throw new RhHttpError(409, 'La persona especificada se encuentra inactiva en el directorio');
      }

      // 2) Verificar si la persona pertenece en el directorio a una unidad diferente
      if (
        persona.unidad_medica_id !== null &&
        Number(persona.unidad_medica_id) !== unidad.id
      ) {
        throw new RhHttpError(
          409,
          'La persona tiene registrada otra unidad en el directorio institucional y requiere validación administrativa antes de vincularse'
        );
      }

      // 3) Consultar y bloquear las adscripciones existentes de la persona en rh_adscripcion_laboral
      const existingRes = await client.query<{
        id: number;
        unidad_medica_id: number;
        vigente_desde: unknown;
        vigente_hasta: unknown;
        activo: boolean;
      }>(
        `SELECT id, unidad_medica_id, vigente_desde, vigente_hasta, activo
           FROM public.rh_adscripcion_laboral
          WHERE persona_id = $1
          ORDER BY id ASC
            FOR UPDATE`,
        [persona.id]
      );

      for (const row of existingRes.rows) {
        const rowUnidadId = Number(row.unidad_medica_id);
        const rowDesde = formatDateOnly(row.vigente_desde) ?? '0001-01-01';
        const rowHasta = formatDateOnly(row.vigente_hasta);
        const rowActivo = Boolean(row.activo);

        if (rowUnidadId === unidad.id && rowActivo) {
          throw new RhHttpError(
            409,
            'La persona ya cuenta con una adscripción laboral activa en esta unidad de trabajo'
          );
        }

        if (rowUnidadId !== unidad.id && rowActivo) {
          throw new RhHttpError(
            409,
            'La persona cuenta con una adscripción laboral activa en otra unidad de trabajo y requiere validación administrativa'
          );
        }

        if (
          rowUnidadId === unidad.id &&
          dateRangesOverlap(vigenteDesde, vigenteHasta, rowDesde, rowHasta)
        ) {
          throw new RhHttpError(
            409,
            'El periodo de vigencia se solapa con otra adscripción laboral registrada para la persona en esta unidad'
          );
        }

        if (
          rowUnidadId !== unidad.id &&
          dateRangesOverlap(vigenteDesde, vigenteHasta, rowDesde, rowHasta)
        ) {
          throw new RhHttpError(
            409,
            'El periodo de vigencia se solapa con una adscripción registrada en otra unidad de trabajo'
          );
        }
      }

      // 4) Insertar la nueva adscripción laboral en public.rh_adscripcion_laboral (sin tocar public.persona)
      const insertRes = await client.query<{
        id: number;
        persona_id: number;
        unidad_medica_id: number;
        matricula: string | null;
        puesto: string | null;
        turno: string | null;
        jornada: string | null;
        horario: string | null;
        vigente_desde: unknown;
        vigente_hasta: unknown;
        activo: boolean;
      }>(
        `INSERT INTO public.rh_adscripcion_laboral (
           persona_id,
           unidad_medica_id,
           matricula,
           puesto,
           turno,
           jornada,
           horario,
           vigente_desde,
           vigente_hasta,
           activo
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
         RETURNING
           id,
           persona_id,
           unidad_medica_id,
           matricula,
           puesto,
           turno,
           jornada,
           horario,
           vigente_desde,
           vigente_hasta,
           activo`,
        [
          persona.id,
          unidad.id,
          matricula,
          puesto,
          turno,
          jornada,
          horario,
          vigenteDesde,
          vigenteHasta,
        ]
      );

      const created = insertRes.rows[0];
      const createdId = Number(created.id);

      // 5) Registrar el evento en public.app_audit_logs dentro de la misma transacción
      const auditPayload = {
        adscripcion_laboral_id: createdId,
        persona_id: Number(persona.id),
        unidad_medica_id: unidad.id,
        vigente_desde: vigenteDesde,
        vigente_hasta: vigenteHasta,
      };

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_CREATE_ADSCRIPCION_LABORAL',
          `rh_adscripcion_laboral:${createdId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      return {
        adscripcion_laboral_id: createdId,
        persona_id: Number(persona.id),
        nombre_completo: String(persona.nombre_completo ?? ''),
        unidad,
        unidad_medica_id: unidad.id,
        matricula: created.matricula != null ? String(created.matricula) : null,
        puesto: created.puesto != null ? String(created.puesto) : null,
        turno: created.turno != null ? String(created.turno) : null,
        jornada: created.jornada != null ? String(created.jornada) : null,
        horario: created.horario != null ? String(created.horario) : null,
        vigente_desde: formatDateOnly(created.vigente_desde) ?? vigenteDesde,
        vigente_hasta: formatDateOnly(created.vigente_hasta),
        activo: Boolean(created.activo),
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure to preserve original error
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Consulta protegida de solo lectura de la ficha individual de un trabajador adscrito
   * (`GET /api/rh/unidades/:unidadId/personal/:adscripcionId`).
   *
   * - Verifica que `unidadMedicaId` pertenezca al alcance autorizado del operador mediante `assertUnidadAutorizada()`.
   * - Exige que la adscripción exista y pertenezca exactamente a la unidad solicitada
   *   (`al.id = $2 AND al.unidad_medica_id = $1`), evitando el acceso cruzado entre unidades.
   * - Nunca expone RFC ni CURP completos; aplica enmascaramiento antes de construir el DTO de respuesta.
   * - Calcula los permisos efectivos (`puede_editar_laboral`, `puede_revelar_sensibles`, `puede_editar_identificacion`)
   *   a partir de `access`.
   */
  async getFichaPersonalAdscripcion(
    access: RhAccessContext,
    unidadMedicaId: number,
    adscripcionLaboralId: number
  ): Promise<RhTrabajadorFichaResult> {
    if (!Number.isInteger(adscripcionLaboralId) || adscripcionLaboralId <= 0) {
      throw new RhHttpError(400, 'Identificador de adscripción laboral inválido');
    }

    const unidad = await this.assertUnidadAutorizada(access, unidadMedicaId);

    const { rows } = await pool.query<{
      adscripcion_laboral_id: number;
      unidad_medica_id: number;
      matricula: string | null;
      puesto: string | null;
      turno: string | null;
      jornada: string | null;
      horario: string | null;
      vigente_desde: unknown;
      vigente_hasta: unknown;
      adscripcion_activo: boolean;
      observaciones: string | null;
      persona_id: number;
      nombre_completo: string;
      nombres: string | null;
      apellidos: string | null;
      rfc: string | null;
      curp: string | null;
      persona_activo: boolean;
    }>(
      `SELECT
         al.id AS adscripcion_laboral_id,
         al.unidad_medica_id,
         al.matricula,
         al.puesto,
         al.turno,
         al.jornada,
         al.horario,
         al.vigente_desde,
         al.vigente_hasta,
         al.activo AS adscripcion_activo,
         al.observaciones,
         p.id AS persona_id,
         p.nombre_completo,
         p.nombres,
         p.apellidos,
         p.rfc,
         p.curp,
         p.activo AS persona_activo
       FROM public.rh_adscripcion_laboral al
       JOIN public.persona p
         ON p.id = al.persona_id
      WHERE al.unidad_medica_id = $1
        AND al.id = $2
      LIMIT 1`,
      [unidad.id, adscripcionLaboralId]
    );

    const row = rows[0];
    if (!row) {
      throw new RhHttpError(
        404,
        'Adscripción laboral no encontrada en la unidad de trabajo solicitada'
      );
    }

    const rfcInfo = maskSensitiveIdentifier(row.rfc, 3);
    const curpInfo = maskSensitiveIdentifier(row.curp, 2);

    return {
      unidad,
      personal: {
        persona_id: Number(row.persona_id),
        nombre_completo: String(row.nombre_completo ?? ''),
        nombres: row.nombres != null ? String(row.nombres) : null,
        apellidos: row.apellidos != null ? String(row.apellidos) : null,
        tiene_rfc: rfcInfo.exists,
        rfc_masked: rfcInfo.masked,
        tiene_curp: curpInfo.exists,
        curp_masked: curpInfo.masked,
        activo: Boolean(row.persona_activo),
      },
      laboral: {
        adscripcion_laboral_id: Number(row.adscripcion_laboral_id),
        unidad_medica_id: Number(row.unidad_medica_id),
        matricula: row.matricula != null ? String(row.matricula) : null,
        puesto: row.puesto != null ? String(row.puesto) : null,
        turno: row.turno != null ? String(row.turno) : null,
        jornada: row.jornada != null ? String(row.jornada) : null,
        horario: row.horario != null ? String(row.horario) : null,
        vigente_desde: formatDateOnly(row.vigente_desde) ?? '',
        vigente_hasta: formatDateOnly(row.vigente_hasta),
        activo: Boolean(row.adscripcion_activo),
        observaciones: row.observaciones != null ? String(row.observaciones) : null,
      },
      permisos: buildEffectiveFichaPermisos(access),
    };
  }

  /**
   * Actualización parcial y auditada de una adscripción laboral existente
   * (`PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/laboral`).
   *
   * Reglas de seguridad, integridad histórica y concurrencia:
   * - Exclusivo para cuentas con rol operativo `RECURSOS_HUMANOS` (`GLOBAL` o `CLUES` autorizado).
   *   Las cuentas que solo tienen `ADMIN_TIC GLOBAL` reciben HTTP 403.
   * - Nunca modifica `public.persona` ni las columnas `id`, `persona_id` o `unidad_medica_id` de `rh_adscripcion_laboral`.
   * - Bloquea la fila de `public.persona` (`FOR UPDATE`) y todas las adscripciones de la persona (`ORDER BY id ASC FOR UPDATE`)
   *   respetando el mismo orden de bloqueo que `createAdscripcionLaboral` para evitar interbloqueos y serializar ediciones.
   * - Verifica que las nuevas fechas de vigencia o la desactivación (`activo = false`) no contradigan
   *   listas de asistencia ya registradas en `public.rh_lista_asistencia` para la adscripción.
   * - Verifica que el estado y rango resultante no duplique otra adscripción activa ni se solape con otras adscripciones de la misma persona.
   * - Registra `RH_UPDATE_ADSCRIPCION_LABORAL` en `public.app_audit_logs` dentro de la misma transacción únicamente cuando existen cambios efectivos.
   */
  async updateAdscripcionLaboral(
    access: RhAccessContext,
    unidadMedicaId: number,
    adscripcionLaboralId: number,
    patch: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<RhUpdateAdscripcionLaboralResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS') {
      throw new RhHttpError(
        403,
        'Solo el personal operativo con rol RECURSOS_HUMANOS puede modificar información laboral'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    if (!Number.isInteger(adscripcionLaboralId) || adscripcionLaboralId <= 0) {
      throw new RhHttpError(400, 'Identificador de adscripción laboral inválido');
    }

    const unidad = await this.assertUnidadAutorizada(access, unidadMedicaId);

    const hasOwn = (k: string): boolean => Object.prototype.hasOwnProperty.call(patch, k);

    const parsedPatch: {
      matricula?: string | null;
      puesto?: string | null;
      turno?: string | null;
      jornada?: string | null;
      horario?: string | null;
      vigente_desde?: string;
      vigente_hasta?: string | null;
      activo?: boolean;
      observaciones?: string | null;
    } = {};

    if (hasOwn('matricula')) {
      parsedPatch.matricula = normalizeOptionalVarchar(patch.matricula, 'matricula', 64);
    }
    if (hasOwn('puesto')) {
      parsedPatch.puesto = normalizeOptionalVarchar(patch.puesto, 'puesto', 160);
    }
    if (hasOwn('turno')) {
      parsedPatch.turno = normalizeOptionalVarchar(patch.turno, 'turno', 60);
    }
    if (hasOwn('jornada')) {
      parsedPatch.jornada = normalizeOptionalVarchar(patch.jornada, 'jornada', 80);
    }
    if (hasOwn('horario')) {
      parsedPatch.horario = normalizeOptionalVarchar(patch.horario, 'horario', 120);
    }
    if (hasOwn('observaciones')) {
      parsedPatch.observaciones = normalizeOptionalVarchar(
        patch.observaciones,
        'observaciones',
        2000
      );
    }
    if (hasOwn('vigente_desde')) {
      if (patch.vigente_desde === null || patch.vigente_desde === undefined) {
        throw new RhHttpError(400, 'El campo "vigente_desde" no puede ser nulo');
      }
      parsedPatch.vigente_desde = parseStrictIsoDate(patch.vigente_desde, 'vigente_desde');
    }
    if (hasOwn('vigente_hasta')) {
      if (patch.vigente_hasta === null || patch.vigente_hasta === undefined) {
        parsedPatch.vigente_hasta = null;
      } else if (typeof patch.vigente_hasta === 'string' && patch.vigente_hasta.trim() === '') {
        parsedPatch.vigente_hasta = null;
      } else {
        parsedPatch.vigente_hasta = parseStrictIsoDate(patch.vigente_hasta, 'vigente_hasta');
      }
    }
    if (hasOwn('activo')) {
      if (typeof patch.activo !== 'boolean') {
        throw new RhHttpError(400, 'El campo "activo" debe ser un booleano real (true o false)');
      }
      parsedPatch.activo = patch.activo;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) Localizar la adscripción en la unidad solicitada para obtener persona_id
      const targetLookup = await client.query<{
        id: number;
        persona_id: number;
        unidad_medica_id: number;
      }>(
        `SELECT id, persona_id, unidad_medica_id
           FROM public.rh_adscripcion_laboral
          WHERE id = $1
            AND unidad_medica_id = $2
          LIMIT 1`,
        [adscripcionLaboralId, unidad.id]
      );

      if (!targetLookup.rowCount) {
        throw new RhHttpError(
          404,
          'Adscripción laboral no encontrada en la unidad de trabajo solicitada'
        );
      }

      const personaId = Number(targetLookup.rows[0].persona_id);

      // 2) Bloquear la fila de public.persona con FOR UPDATE (mismo orden de bloqueo que createAdscripcionLaboral)
      const personaRes = await client.query<{
        id: number;
        nombre_completo: string;
        unidad_medica_id: number | null;
        activo: boolean;
      }>(
        `SELECT id, nombre_completo, unidad_medica_id, activo
           FROM public.persona
          WHERE id = $1
            FOR UPDATE`,
        [personaId]
      );

      if (!personaRes.rowCount) {
        throw new RhHttpError(404, 'La persona vinculada a la adscripción no existe en el directorio');
      }

      const persona = personaRes.rows[0];

      // 3) Bloquear todas las adscripciones de la persona en rh_adscripcion_laboral (ORDER BY id ASC FOR UPDATE)
      const allAdscripcionesRes = await client.query<{
        id: number;
        persona_id: number;
        unidad_medica_id: number;
        matricula: string | null;
        puesto: string | null;
        turno: string | null;
        jornada: string | null;
        horario: string | null;
        vigente_desde: unknown;
        vigente_hasta: unknown;
        activo: boolean;
        observaciones: string | null;
      }>(
        `SELECT
           id,
           persona_id,
           unidad_medica_id,
           matricula,
           puesto,
           turno,
           jornada,
           horario,
           vigente_desde,
           vigente_hasta,
           activo,
           observaciones
         FROM public.rh_adscripcion_laboral
         WHERE persona_id = $1
         ORDER BY id ASC
           FOR UPDATE`,
        [personaId]
      );

      const currentRow = allAdscripcionesRes.rows.find(
        (r) => Number(r.id) === adscripcionLaboralId && Number(r.unidad_medica_id) === unidad.id
      );

      if (!currentRow) {
        throw new RhHttpError(
          404,
          'Adscripción laboral no encontrada en la unidad de trabajo solicitada'
        );
      }

      const currentMatricula = currentRow.matricula != null ? String(currentRow.matricula) : null;
      const currentPuesto = currentRow.puesto != null ? String(currentRow.puesto) : null;
      const currentTurno = currentRow.turno != null ? String(currentRow.turno) : null;
      const currentJornada = currentRow.jornada != null ? String(currentRow.jornada) : null;
      const currentHorario = currentRow.horario != null ? String(currentRow.horario) : null;
      const currentDesde = formatDateOnly(currentRow.vigente_desde) ?? '';
      const currentHasta = formatDateOnly(currentRow.vigente_hasta);
      const currentActivo = Boolean(currentRow.activo);
      const currentObservaciones =
        currentRow.observaciones != null ? String(currentRow.observaciones) : null;

      // 4) Aplicar semántica de PATCH parcial conservando propiedades omitidas
      const finalMatricula = hasOwn('matricula') ? parsedPatch.matricula! : currentMatricula;
      const finalPuesto = hasOwn('puesto') ? parsedPatch.puesto! : currentPuesto;
      const finalTurno = hasOwn('turno') ? parsedPatch.turno! : currentTurno;
      const finalJornada = hasOwn('jornada') ? parsedPatch.jornada! : currentJornada;
      const finalHorario = hasOwn('horario') ? parsedPatch.horario! : currentHorario;
      const finalDesde = hasOwn('vigente_desde') ? parsedPatch.vigente_desde! : currentDesde;
      const finalHasta = hasOwn('vigente_hasta') ? parsedPatch.vigente_hasta! : currentHasta;
      const finalActivo = hasOwn('activo') ? parsedPatch.activo! : currentActivo;
      const finalObservaciones = hasOwn('observaciones')
        ? parsedPatch.observaciones!
        : currentObservaciones;

      if (!finalDesde) {
        throw new RhHttpError(400, 'La fecha "vigente_desde" final es obligatoria');
      }

      if (finalHasta !== null && finalHasta < finalDesde) {
        throw new RhHttpError(
          400,
          'La fecha "vigente_hasta" debe ser igual o posterior a "vigente_desde"'
        );
      }

      // Si se intenta activar una adscripción de una persona inactiva en el directorio -> 409
      if (finalActivo && persona.activo !== true) {
        throw new RhHttpError(
          409,
          'No es posible mantener o activar una adscripción laboral para una persona inactiva en el directorio'
        );
      }

      // 5) Verificar conflictos contra las demás adscripciones de la misma persona (excluyendo la propia adscripción editada)
      for (const other of allAdscripcionesRes.rows) {
        if (Number(other.id) === adscripcionLaboralId) {
          continue;
        }
        const otherUnidadId = Number(other.unidad_medica_id);
        const otherDesde = formatDateOnly(other.vigente_desde) ?? '0001-01-01';
        const otherHasta = formatDateOnly(other.vigente_hasta);
        const otherActivo = Boolean(other.activo);

        if (finalActivo && otherActivo && otherUnidadId === unidad.id) {
          throw new RhHttpError(
            409,
            'La persona ya cuenta con otra adscripción laboral activa en esta unidad de trabajo'
          );
        }

        if (finalActivo && otherActivo && otherUnidadId !== unidad.id) {
          throw new RhHttpError(
            409,
            'La persona cuenta con otra adscripción laboral activa en otra unidad de trabajo'
          );
        }

        if (dateRangesOverlap(finalDesde, finalHasta, otherDesde, otherHasta)) {
          throw new RhHttpError(
            409,
            otherUnidadId === unidad.id
              ? 'El periodo de vigencia resultante se solapa con otra adscripción registrada para la persona en esta unidad'
              : 'El periodo de vigencia resultante se solapa con una adscripción registrada en otra unidad de trabajo'
          );
        }
      }

      // 6) Protección de integridad histórica frente a listas de asistencia registradas (public.rh_lista_asistencia)
      const vigenciaChanged = finalDesde !== currentDesde || finalHasta !== currentHasta;
      const deactivating = currentActivo && !finalActivo;

      if (vigenciaChanged || deactivating) {
        const listasRes = await client.query<{
          id: number;
          estado: string;
          fecha_inicio: unknown;
          fecha_fin: unknown;
        }>(
          `SELECT
             la.id,
             la.estado,
             pa.fecha_inicio,
             pa.fecha_fin
           FROM public.rh_lista_asistencia la
           JOIN public.rh_periodo_asistencia pa
             ON pa.id = la.periodo_id
          WHERE la.adscripcion_laboral_id = $1`,
          [adscripcionLaboralId]
        );

        for (const lista of listasRes.rows) {
          const periodoInicio = formatDateOnly(lista.fecha_inicio);
          const periodoFin = formatDateOnly(lista.fecha_fin);

          // Si el nuevo rango de vigencia deja fuera un periodo con lista de asistencia registrada -> 409
          if (periodoInicio && finalDesde > periodoInicio) {
            throw new RhHttpError(
              409,
              'No se puede modificar "vigente_desde" a una fecha posterior a un periodo con lista de asistencia ya registrada para esta adscripción'
            );
          }

          if (periodoFin && finalHasta !== null && finalHasta < periodoFin) {
            throw new RhHttpError(
              409,
              'No se puede modificar "vigente_hasta" a una fecha anterior al cierre de un periodo con lista de asistencia ya registrada para esta adscripción'
            );
          }

          // Si se desactiva la adscripción mientras tiene una lista de asistencia activa/en captura (no cerrada) sin fecha de término válida -> 409
          const estadoUpper = String(lista.estado ?? '').trim().toUpperCase();
          if (
            deactivating &&
            (estadoUpper === 'BORRADOR' || estadoUpper === 'ABIERTA' || estadoUpper === 'EN_CAPTURA')
          ) {
            throw new RhHttpError(
              409,
              'No se puede desactivar la adscripción laboral mientras exista una lista de asistencia en captura asociada a ella'
            );
          }
        }
      }

      // 7) Determinar los campos efectivamente modificados
      const camposModificados: string[] = [];
      if (finalMatricula !== currentMatricula) camposModificados.push('matricula');
      if (finalPuesto !== currentPuesto) camposModificados.push('puesto');
      if (finalTurno !== currentTurno) camposModificados.push('turno');
      if (finalJornada !== currentJornada) camposModificados.push('jornada');
      if (finalHorario !== currentHorario) camposModificados.push('horario');
      if (finalDesde !== currentDesde) camposModificados.push('vigente_desde');
      if (finalHasta !== currentHasta) camposModificados.push('vigente_hasta');
      if (finalActivo !== currentActivo) camposModificados.push('activo');
      if (finalObservaciones !== currentObservaciones) camposModificados.push('observaciones');

      // Si no hubo cambios efectivos, no ejecutar UPDATE ni registrar auditoría engañosa
      if (camposModificados.length === 0) {
        await client.query('COMMIT');
        return {
          unidad,
          laboral: {
            adscripcion_laboral_id: adscripcionLaboralId,
            unidad_medica_id: unidad.id,
            matricula: currentMatricula,
            puesto: currentPuesto,
            turno: currentTurno,
            jornada: currentJornada,
            horario: currentHorario,
            vigente_desde: currentDesde,
            vigente_hasta: currentHasta,
            activo: currentActivo,
            observaciones: currentObservaciones,
          },
          campos_modificados: [],
        };
      }

      // 8) Ejecutar UPDATE exclusivamente sobre las columnas laborales permitidas de rh_adscripcion_laboral
      const updateRes = await client.query<{
        id: number;
        unidad_medica_id: number;
        matricula: string | null;
        puesto: string | null;
        turno: string | null;
        jornada: string | null;
        horario: string | null;
        vigente_desde: unknown;
        vigente_hasta: unknown;
        activo: boolean;
        observaciones: string | null;
      }>(
        `UPDATE public.rh_adscripcion_laboral
            SET matricula = $1,
                puesto = $2,
                turno = $3,
                jornada = $4,
                horario = $5,
                vigente_desde = $6,
                vigente_hasta = $7,
                activo = $8,
                observaciones = $9,
                actualizado_en = NOW()
          WHERE id = $10
            AND unidad_medica_id = $11
          RETURNING
            id,
            unidad_medica_id,
            matricula,
            puesto,
            turno,
            jornada,
            horario,
            vigente_desde,
            vigente_hasta,
            activo,
            observaciones`,
        [
          finalMatricula,
          finalPuesto,
          finalTurno,
          finalJornada,
          finalHorario,
          finalDesde,
          finalHasta,
          finalActivo,
          finalObservaciones,
          adscripcionLaboralId,
          unidad.id,
        ]
      );

      const updated = updateRes.rows[0];

      // 9) Registrar evento en public.app_audit_logs dentro de la misma transacción (sin RFC, CURP ni datos sensibles)
      const auditPayload = {
        adscripcion_laboral_id: adscripcionLaboralId,
        persona_id: personaId,
        unidad_medica_id: unidad.id,
        campos_modificados: camposModificados,
      };

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_UPDATE_ADSCRIPCION_LABORAL',
          `rh_adscripcion_laboral:${adscripcionLaboralId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      return {
        unidad,
        laboral: {
          adscripcion_laboral_id: Number(updated.id),
          unidad_medica_id: Number(updated.unidad_medica_id),
          matricula: updated.matricula != null ? String(updated.matricula) : null,
          puesto: updated.puesto != null ? String(updated.puesto) : null,
          turno: updated.turno != null ? String(updated.turno) : null,
          jornada: updated.jornada != null ? String(updated.jornada) : null,
          horario: updated.horario != null ? String(updated.horario) : null,
          vigente_desde: formatDateOnly(updated.vigente_desde) ?? finalDesde,
          vigente_hasta: formatDateOnly(updated.vigente_hasta),
          activo: Boolean(updated.activo),
          observaciones: updated.observaciones != null ? String(updated.observaciones) : null,
        },
        campos_modificados: camposModificados,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure to preserve original error
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Revelación explícita, autorizada y auditada de RFC y CURP completos de un trabajador adscrito
   * (`POST /api/rh/unidades/:unidadId/personal/:adscripcionId/revelar-identificadores`).
   *
   * Reglas estrictas de seguridad y auditoría:
   * - Exclusivo cuando `access.grantedBy === 'RECURSOS_HUMANOS' && access.scope === 'GLOBAL'`.
   *   Rechaza con HTTP 403 a `RECURSOS_HUMANOS CLUES` y `ADMIN_TIC GLOBAL` antes de abrir conexión
   *   o consultar valores sensibles.
   * - Verifica que `unidadMedicaId` exista y esté activa (`assertUnidadAutorizada`).
   * - Dentro de una transacción (`BEGIN` / `COMMIT` / `ROLLBACK`), consulta `rfc` y `curp` exigiendo
   *   `al.unidad_medica_id = $1 AND al.id = $2`. Si la adscripción no existe o pertenece a otra unidad,
   *   hace `ROLLBACK` y responde HTTP 404 sin filtrar información.
   * - Inserta obligatoriamente el registro `RH_REVEAL_SENSITIVE_IDS` en `public.app_audit_logs`
   *   antes de hacer `COMMIT` y antes de devolver los identificadores. El payload de auditoría
   *   incluye únicamente metadatos y `campos_revelados: ["rfc", "curp"]` (nunca los valores de RFC/CURP).
   */
  async revelarIdentificadoresSensiblesAdscripcion(
    access: RhAccessContext,
    unidadMedicaId: number,
    adscripcionLaboralId: number,
    auditMeta: RhAuditMeta
  ): Promise<RhRevealIdentificadoresResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para revelar identificadores sensibles'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    if (!Number.isInteger(adscripcionLaboralId) || adscripcionLaboralId <= 0) {
      throw new RhHttpError(400, 'Identificador de adscripción laboral inválido');
    }

    const unidad = await this.assertUnidadAutorizada(access, unidadMedicaId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{
        adscripcion_laboral_id: number;
        unidad_medica_id: number;
        persona_id: number;
        rfc: string | null;
        curp: string | null;
      }>(
        `SELECT
           al.id AS adscripcion_laboral_id,
           al.unidad_medica_id,
           p.id AS persona_id,
           p.rfc,
           p.curp
         FROM public.rh_adscripcion_laboral al
         JOIN public.persona p
           ON p.id = al.persona_id
        WHERE al.unidad_medica_id = $1
          AND al.id = $2
        LIMIT 1`,
        [unidad.id, adscripcionLaboralId]
      );

      const row = rows[0];
      if (!row) {
        throw new RhHttpError(
          404,
          'Adscripción laboral no encontrada en la unidad de trabajo solicitada'
        );
      }

      const personaId = Number(row.persona_id);

      const auditPayload = {
        adscripcion_laboral_id: adscripcionLaboralId,
        persona_id: personaId,
        unidad_medica_id: unidad.id,
        campos_revelados: ['rfc', 'curp'],
      };

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_REVEAL_SENSITIVE_IDS',
          `rh_adscripcion_laboral:${adscripcionLaboralId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      const rfcClean =
        row.rfc !== null && row.rfc !== undefined && String(row.rfc).trim().length > 0
          ? String(row.rfc).trim()
          : null;
      const curpClean =
        row.curp !== null && row.curp !== undefined && String(row.curp).trim().length > 0
          ? String(row.curp).trim()
          : null;

      return {
        persona_id: personaId,
        rfc: rfcClean,
        curp: curpClean,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure to preserve original error
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Actualización protegida, parcial y auditada de los datos de identificación personal
   * (`PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/identificacion`).
   *
   * Reglas estrictas de seguridad, integridad del trigger `t_persona_nombre` y auditoría:
   * - Exclusivo cuando `access.grantedBy === 'RECURSOS_HUMANOS' && access.scope === 'GLOBAL'`.
   *   Rechaza con HTTP 403 a `RECURSOS_HUMANOS CLUES` y `ADMIN_TIC GLOBAL` antes de abrir conexión
   *   o consultar valores sensibles.
   * - Exige que la adscripción exista y pertenezca exactamente a la unidad solicitada (`al.id = $1 AND al.unidad_medica_id = $2`).
   * - Bloquea la fila de `public.persona` con `SELECT ... FOR UPDATE`.
   * - Propiedades aceptadas: `nombres`, `apellidos`, `nombre_completo`, `rfc`, `curp`.
   * - Respeta el trigger `t_persona_nombre` (`BEFORE INSERT OR UPDATE OF nombres, apellidos` -> `set_nombre_completo()`):
   *   - Si el registro tiene o tendrá `nombres` o `apellidos` no nulos, `nombre_completo` se sincroniza automáticamente
   *     como `btrim(coalesce(nombres, '') || ' ' || coalesce(apellidos, ''))`. Si el cliente envía además `nombre_completo`
   *     con un valor discrepante, se rechaza con HTTP 400 para evitar ambigüedad.
   *   - Si el registro solo tiene `nombre_completo` (`nombres IS NULL` y `apellidos IS NULL`), se permite editar
   *     `nombre_completo` directamente sin heurísticas de división, o bien poblar `nombres` y `apellidos`.
   *   - Nunca permite vaciar simultáneamente `nombres` y `apellidos` en un registro que ya los tenía poblados.
   * - Si PostgreSQL devuelve `23505` (`uq_persona_rfc` o `uq_persona_curp`), hace `ROLLBACK` y responde HTTP 409
   *   sin revelar el valor ni la persona propietaria.
   * - Registra `RH_UPDATE_PERSONA_IDENTIFICACION` en `public.app_audit_logs` dentro de la misma transacción
   *   incluyendo únicamente los nombres de los campos efectivamente modificados (nunca valores de RFC/CURP).
   * - Devuelve siempre `rfc_masked` y `curp_masked` (nunca los valores completos).
   */
  async updatePersonaIdentificacionAdscripcion(
    access: RhAccessContext,
    unidadMedicaId: number,
    adscripcionLaboralId: number,
    patch: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<RhUpdatePersonaIdentificacionResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para modificar datos de identificación personal'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    if (!Number.isInteger(adscripcionLaboralId) || adscripcionLaboralId <= 0) {
      throw new RhHttpError(400, 'Identificador de adscripción laboral inválido');
    }

    const unidad = await this.assertUnidadAutorizada(access, unidadMedicaId);

    const hasOwn = (k: string): boolean => Object.prototype.hasOwnProperty.call(patch, k);

    const parsedPatch: {
      nombres?: string | null;
      apellidos?: string | null;
      nombre_completo?: string;
      rfc?: string | null;
      curp?: string | null;
    } = {};

    if (hasOwn('nombres')) {
      parsedPatch.nombres = normalizeCollapsedPersonNamePart(patch.nombres, 'nombres', 150);
    }
    if (hasOwn('apellidos')) {
      parsedPatch.apellidos = normalizeCollapsedPersonNamePart(patch.apellidos, 'apellidos', 150);
    }
    if (hasOwn('nombre_completo')) {
      if (patch.nombre_completo === null || patch.nombre_completo === undefined) {
        throw new RhHttpError(400, 'El campo "nombre_completo" no puede ser nulo');
      }
      const normNombreCompleto = normalizeCollapsedPersonNamePart(
        patch.nombre_completo,
        'nombre_completo',
        150
      );
      if (!normNombreCompleto) {
        throw new RhHttpError(400, 'El campo "nombre_completo" no puede estar vacío');
      }
      parsedPatch.nombre_completo = normNombreCompleto;
    }
    if (hasOwn('rfc')) {
      parsedPatch.rfc = normalizeAndValidateRfc(patch.rfc);
    }
    if (hasOwn('curp')) {
      parsedPatch.curp = normalizeAndValidateCurp(patch.curp);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) Verificar que la adscripción exista y pertenezca exactamente a la unidad solicitada
      const targetLookup = await client.query<{
        id: number;
        persona_id: number;
        unidad_medica_id: number;
      }>(
        `SELECT id, persona_id, unidad_medica_id
           FROM public.rh_adscripcion_laboral
          WHERE id = $1
            AND unidad_medica_id = $2
          LIMIT 1`,
        [adscripcionLaboralId, unidad.id]
      );

      if (!targetLookup.rowCount) {
        throw new RhHttpError(
          404,
          'Adscripción laboral no encontrada en la unidad de trabajo solicitada'
        );
      }

      const personaId = Number(targetLookup.rows[0].persona_id);

      // 2) Bloquear la fila de public.persona con FOR UPDATE
      const personaRes = await client.query<{
        id: number;
        nombre_completo: string;
        nombres: string | null;
        apellidos: string | null;
        rfc: string | null;
        curp: string | null;
        activo: boolean;
      }>(
        `SELECT id, nombre_completo, nombres, apellidos, rfc, curp, activo
           FROM public.persona
          WHERE id = $1
            FOR UPDATE`,
        [personaId]
      );

      if (!personaRes.rowCount) {
        throw new RhHttpError(404, 'La persona vinculada a la adscripción no existe en el directorio');
      }

      const currentPersona = personaRes.rows[0];
      const currentNombres =
        currentPersona.nombres != null && String(currentPersona.nombres).trim() !== ''
          ? String(currentPersona.nombres).trim()
          : null;
      const currentApellidos =
        currentPersona.apellidos != null && String(currentPersona.apellidos).trim() !== ''
          ? String(currentPersona.apellidos).trim()
          : null;
      const currentNombreCompleto = String(currentPersona.nombre_completo ?? '').trim();
      const currentRfc =
        currentPersona.rfc != null && String(currentPersona.rfc).trim() !== ''
          ? String(currentPersona.rfc).trim().toUpperCase()
          : null;
      const currentCurp =
        currentPersona.curp != null && String(currentPersona.curp).trim() !== ''
          ? String(currentPersona.curp).trim().toUpperCase()
          : null;

      // 3) Resolver semántica de nombres/apellidos/nombre_completo compatible con el trigger t_persona_nombre
      //    (`BEFORE INSERT OR UPDATE OF nombres, apellidos ON public.persona FOR EACH ROW EXECUTE FUNCTION set_nombre_completo()`)
      const finalNombres = hasOwn('nombres') ? parsedPatch.nombres! : currentNombres;
      const finalApellidos = hasOwn('apellidos') ? parsedPatch.apellidos! : currentApellidos;
      const finalRfc = hasOwn('rfc') ? parsedPatch.rfc! : currentRfc;
      const finalCurp = hasOwn('curp') ? parsedPatch.curp! : currentCurp;

      const hadStructuredNames = currentNombres !== null || currentApellidos !== null;
      const willHaveStructuredNames = finalNombres !== null || finalApellidos !== null;

      // Prohibir borrar simultáneamente nombres y apellidos cuando ya estaban registrados
      if (hadStructuredNames && !willHaveStructuredNames) {
        throw new RhHttpError(
          400,
          'No se permite eliminar simultáneamente "nombres" y "apellidos" en un registro que ya cuenta con nombre estructurado'
        );
      }

      const touchingStructuredNames =
        hasOwn('nombres') ||
        hasOwn('apellidos') ||
        finalNombres !== currentNombres ||
        finalApellidos !== currentApellidos;

      let finalNombreCompleto = currentNombreCompleto;

      if (willHaveStructuredNames) {
        const derivedFull = `${finalNombres ?? ''} ${finalApellidos ?? ''}`.trim();
        if (!derivedFull) {
          throw new RhHttpError(400, 'El nombre resultante del trabajador no puede quedar vacío');
        }
        if (derivedFull.length > 150) {
          throw new RhHttpError(
            400,
            'La combinación de "nombres" y "apellidos" no puede exceder 150 caracteres en "nombre_completo"'
          );
        }
        if (hasOwn('nombre_completo') && parsedPatch.nombre_completo !== derivedFull) {
          throw new RhHttpError(
            400,
            'Cuando "nombres" o "apellidos" están registrados, "nombre_completo" se sincroniza automáticamente a partir de ellos y no puede enviarse con un valor distinto'
          );
        }
        if (touchingStructuredNames || hasOwn('nombre_completo')) {
          finalNombreCompleto = derivedFull;
        }
      } else {
        // Caso legado donde nombres IS NULL y apellidos IS NULL
        if (hasOwn('nombre_completo')) {
          finalNombreCompleto = parsedPatch.nombre_completo!;
        }
        if (!finalNombreCompleto) {
          throw new RhHttpError(400, 'El campo "nombre_completo" no puede quedar vacío');
        }
      }

      // 4) Determinar los campos efectivamente modificados
      const camposModificados: string[] = [];
      if (finalNombres !== currentNombres) {
        camposModificados.push('nombres');
      }
      if (finalApellidos !== currentApellidos) {
        camposModificados.push('apellidos');
      }
      if (finalNombreCompleto !== currentNombreCompleto) {
        camposModificados.push('nombre_completo');
      }
      if (finalRfc !== currentRfc) {
        camposModificados.push('rfc');
      }
      if (finalCurp !== currentCurp) {
        camposModificados.push('curp');
      }

      // Si no hubo cambios efectivos, no ejecutar UPDATE ni registrar auditoría ficticia
      if (camposModificados.length === 0) {
        await client.query('COMMIT');
        const rfcInfoNoOp = maskSensitiveIdentifier(currentRfc, 3);
        const curpInfoNoOp = maskSensitiveIdentifier(currentCurp, 2);
        return {
          unidad,
          personal: {
            persona_id: personaId,
            nombre_completo: currentNombreCompleto,
            nombres: currentNombres,
            apellidos: currentApellidos,
            tiene_rfc: rfcInfoNoOp.exists,
            rfc_masked: rfcInfoNoOp.masked,
            tiene_curp: curpInfoNoOp.exists,
            curp_masked: curpInfoNoOp.masked,
            activo: Boolean(currentPersona.activo),
          },
          campos_modificados: [],
        };
      }

      // 5) Ejecutar UPDATE parcial exclusivamente sobre las columnas de identificación modificadas en public.persona
      //    - Respeta `t_persona_nombre` (`BEFORE INSERT OR UPDATE OF nombres, apellidos`): solo incluye `nombres` / `apellidos`
      //      en la cláusula SET cuando realmente fueron parte de la edición, evitando disparar `set_nombre_completo()`
      //      al editar únicamente `rfc` o `curp`.
      //    - Nunca modifica `unidad_medica_id`, `correo_principal`, `activo`, `fecha_baja` ni `user_id`.
      const setClauses: string[] = [];
      const updateParams: unknown[] = [];

      const pushSetColumn = (columnName: string, value: unknown): void => {
        updateParams.push(value);
        setClauses.push(`${columnName} = $${updateParams.length}`);
      };

      if (camposModificados.includes('nombres')) {
        pushSetColumn('nombres', finalNombres);
      }
      if (camposModificados.includes('apellidos')) {
        pushSetColumn('apellidos', finalApellidos);
      }
      if (camposModificados.includes('nombre_completo')) {
        pushSetColumn('nombre_completo', finalNombreCompleto);
      }
      if (camposModificados.includes('rfc')) {
        pushSetColumn('rfc', finalRfc);
      }
      if (camposModificados.includes('curp')) {
        pushSetColumn('curp', finalCurp);
      }

      updateParams.push(personaId);
      const whereIdParamIdx = updateParams.length;

      const updateRes = await client.query<{
        id: number;
        nombre_completo: string;
        nombres: string | null;
        apellidos: string | null;
        rfc: string | null;
        curp: string | null;
        activo: boolean;
      }>(
        `UPDATE public.persona
            SET ${setClauses.join(',\n                ')}
          WHERE id = $${whereIdParamIdx}
          RETURNING
            id,
            nombre_completo,
            nombres,
            apellidos,
            rfc,
            curp,
            activo`,
        updateParams
      );

      const updatedPersona = updateRes.rows[0];

      // 6) Registrar auditoría obligatoria en public.app_audit_logs dentro de la misma transacción
      //    (sin valores anteriores ni nuevos de RFC, CURP o nombres)
      const auditPayload = {
        adscripcion_laboral_id: adscripcionLaboralId,
        persona_id: personaId,
        unidad_medica_id: unidad.id,
        campos_modificados: camposModificados,
      };

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_UPDATE_PERSONA_IDENTIFICACION',
          `persona:${personaId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      const rfcInfo = maskSensitiveIdentifier(updatedPersona.rfc, 3);
      const curpInfo = maskSensitiveIdentifier(updatedPersona.curp, 2);

      return {
        unidad,
        personal: {
          persona_id: Number(updatedPersona.id),
          nombre_completo: String(updatedPersona.nombre_completo ?? ''),
          nombres: updatedPersona.nombres != null ? String(updatedPersona.nombres) : null,
          apellidos: updatedPersona.apellidos != null ? String(updatedPersona.apellidos) : null,
          tiene_rfc: rfcInfo.exists,
          rfc_masked: rfcInfo.masked,
          tiene_curp: curpInfo.exists,
          curp_masked: curpInfo.masked,
          activo: Boolean(updatedPersona.activo),
        },
        campos_modificados: camposModificados,
      };
    } catch (err: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure to preserve original error
      }

      // Mapear violación de unicidad PostgreSQL 23505 (uq_persona_rfc / uq_persona_curp) a HTTP 409
      // sin exponer el valor duplicado ni el registro propietario
      if (err && typeof err === 'object' && err.code === '23505') {
        const constraint = String(err.constraint ?? '').toLowerCase();
        if (constraint.includes('rfc')) {
          throw new RhHttpError(
            409,
            'El RFC proporcionado ya se encuentra registrado en otra persona del directorio institucional'
          );
        }
        if (constraint.includes('curp')) {
          throw new RhHttpError(
            409,
            'La CURP proporcionada ya se encuentra registrada en otra persona del directorio institucional'
          );
        }
        throw new RhHttpError(
          409,
          'Uno de los identificadores proporcionados (RFC o CURP) ya se encuentra registrado en el directorio institucional'
        );
      }

      throw err;
    } finally {
      client.release();
    }
  }
}
