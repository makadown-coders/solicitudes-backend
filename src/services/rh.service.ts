import crypto from 'crypto';
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
  situacion?: 'ACTIVOS' | 'BAJAS' | 'TODOS' | null;
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

export type RhMiContextoEstadoVinculacion =
  | 'ADSCRIPCION_VIGENTE'
  | 'ADSCRIPCION_HISTORICA'
  | 'ADSCRIPCION_FUTURA'
  | 'PENDIENTE_ADSCRIPCION_RH';

export type RhAdscripcionEstadoVigencia = 'VIGENTE' | 'HISTORICA' | 'FUTURA';

export interface RhMiContextoPersona {
  persona_id: number;
  nombre_completo: string;
  nombres: string | null;
  apellidos: string | null;
  tiene_rfc: boolean;
  rfc_masked: string | null;
  tiene_curp: boolean;
  curp_masked: string | null;
}

export interface RhMiContextoUnidadReferencia {
  id: number;
  nombre: string;
  cluesimb: string | null;
  origen: 'ADSCRIPCION_RH' | 'DIRECTORIO';
}

export interface RhMiContextoAdscripcionPropia {
  adscripcion_laboral_id: number;
  unidad_medica_id: number;
  unidad: RhUnidadAutorizada;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  es_vigente: boolean;
  estado_vigencia: RhAdscripcionEstadoVigencia;
  observaciones: string | null;
}

export interface RhMiContextoPermisos {
  puede_ver_perfil_propio: true;
  puede_administrar_personal_desde_autogestion: false;
  puede_revelar_identificadores_desde_autogestion: false;
  puede_editar_identificacion_desde_autogestion: false;
}

export interface RhMiContextoResult {
  modo: 'EMPLEADO';
  persona: RhMiContextoPersona;
  unidad_referencia: RhMiContextoUnidadReferencia | null;
  estado_vinculacion_rh: RhMiContextoEstadoVinculacion;
  adscripciones: RhMiContextoAdscripcionPropia[];
  permisos: RhMiContextoPermisos;
}

export interface RhPersonaAdminDto {
  persona_id: number;
  nombre_completo: string;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  correo_principal: string | null;
  unidad_medica_id: number | null;
  tiene_rfc: boolean;
  rfc_masked: string | null;
  tiene_curp: boolean;
  curp_masked: string | null;
  activo: boolean;
  fecha_baja: string | null;
  fecha_ingreso?: string | null;
}

export interface RhUpdatePersonaEstadoResult {
  persona: RhPersonaAdminDto;
  estado_anterior: boolean;
  estado_nuevo: boolean;
  idempotente: boolean;
  campos_modificados: string[];
}

export interface RhPersonasPadronItem extends RhPersonaAdminDto {
  unidad_medica_nombre: string | null;
  unidad_medica_cluesimb: string | null;
  tiene_cuenta_activa: boolean;
}

export interface RhPersonasPadronPagedResult {
  items: RhPersonasPadronItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RhPersonasPadronQueryOpts extends RhListQueryOpts {
  estado?: 'activas' | 'inactivas' | 'todas';
  unidadId?: number | null;
  sinUnidad?: boolean;
}

export interface RhUpdatePersonaGeneralResult {
  persona: RhPersonaAdminDto;
  idempotente: boolean;
  campos_modificados: string[];
}

export type RhComisionEstadoVigencia = 'VIGENTE' | 'FUTURA' | 'CONCLUIDA';

export interface RhComisionLaboralDto {
  id: number;
  persona_id: number;
  adscripcion_origen_id: number | null;
  sin_adscripcion_formal_origen: boolean;
  unidad_destino_id: number | null;
  unidad_destino_nombre: string | null;
  unidad_destino_cluesimb: string | null;
  area_destino_texto: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  motivo: string | null;
  oficio_referencia: string | null;
  observaciones: string | null;
  activo: boolean;
  estado_vigencia: RhComisionEstadoVigencia;
}

export interface RhComisionesListResult {
  persona_id: number;
  items: RhComisionLaboralDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RhConcluirComisionResult {
  comision: RhComisionLaboralDto;
  idempotente: boolean;
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
  /**
   * Resuelve el contexto individual de autogestión del empleado autenticado (`GET /api/rh/mi-contexto`).
   *
   * Reglas estrictas de identidad, seguridad y contención:
   * - Identidad canónica: `req.user.sub` -> `public.app_users.id` -> `app_users.persona_id` -> `public.persona.id`.
   * - Nunca utiliza `persona.user_id`, ni coincidencias de correo o nombre, ni acepta `persona_id` externo.
   * - Exige que la cuenta exista en `public.app_users` con `UPPER(TRIM(status)) = 'ACTIVE'`, que tenga
   *   `persona_id IS NOT NULL` y que la persona vinculada exista en `public.persona` con `activo = TRUE`.
   * - No otorga acceso por el simple hecho de poseer `ADMIN_TIC GLOBAL` u otro rol si no tiene persona activa.
   * - Reconoce `OFICINA CENTRAL` (`unidad_medica.id = 177`, `cluesimb = 'N/A'`) mediante `unidad_medica.id`.
   * - Consulta exclusivamente las adscripciones de `rh_adscripcion_laboral.persona_id = persona.id` y clasifica
   *   su vigencia (`VIGENTE`, `FUTURA`, `HISTORICA`) contra `CURRENT_DATE` de PostgreSQL.
   * - Devuelve siempre `rfc_masked` y `curp_masked` (nunca identificadores completos).
   */
  async getMiContextoEmpleado(rawUserId: unknown): Promise<RhMiContextoResult> {
    const userId = typeof rawUserId === 'string' ? rawUserId.trim() : '';
    if (!UUID_REGEX.test(userId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    const identityRes = await pool.query<{
      user_id: string;
      user_status: string;
      user_persona_id: number | null;
      persona_id: number | null;
      nombre_completo: string | null;
      nombres: string | null;
      apellidos: string | null;
      rfc: string | null;
      curp: string | null;
      persona_activo: boolean | null;
      directorio_unidad_id: number | null;
      directorio_unidad_nombre: string | null;
      directorio_unidad_cluesimb: string | null;
      directorio_unidad_activo: boolean | null;
    }>(
      `SELECT
         u.id AS user_id,
         u.status AS user_status,
         u.persona_id AS user_persona_id,
         p.id AS persona_id,
         p.nombre_completo,
         p.nombres,
         p.apellidos,
         p.rfc,
         p.curp,
         p.activo AS persona_activo,
         um.id AS directorio_unidad_id,
         um.nombre AS directorio_unidad_nombre,
         um.cluesimb AS directorio_unidad_cluesimb,
         um.activo AS directorio_unidad_activo
       FROM public.app_users u
       LEFT JOIN public.persona p
         ON p.id = u.persona_id
       LEFT JOIN public.unidad_medica um
         ON um.id = p.unidad_medica_id
      WHERE u.id = $1
      LIMIT 1`,
      [userId]
    );

    const identity = identityRes.rows[0];
    if (!identity) {
      throw new RhHttpError(401, 'Cuenta de usuario no encontrada');
    }

    const normalizedStatus = String(identity.user_status ?? '')
      .trim()
      .toUpperCase();
    if (normalizedStatus !== 'ACTIVE') {
      throw new RhHttpError(403, 'La cuenta de usuario no se encuentra activa');
    }

    if (
      identity.user_persona_id === null ||
      identity.user_persona_id === undefined ||
      identity.persona_id === null ||
      identity.persona_id === undefined
    ) {
      throw new RhHttpError(
        403,
        'La cuenta autenticada no está vinculada a un registro de persona institucional'
      );
    }

    if (identity.persona_activo !== true) {
      throw new RhHttpError(
        403,
        'El registro de persona institucional vinculado a esta cuenta se encuentra inactivo'
      );
    }

    const personaId = Number(identity.persona_id);

    const adscripcionesRes = await pool.query<{
      adscripcion_laboral_id: number;
      unidad_medica_id: number;
      unidad_nombre: string;
      unidad_cluesimb: string | null;
      matricula: string | null;
      puesto: string | null;
      turno: string | null;
      jornada: string | null;
      horario: string | null;
      vigente_desde: unknown;
      vigente_hasta: unknown;
      activo: boolean;
      observaciones: string | null;
      current_date_iso: unknown;
    }>(
      `SELECT
         al.id AS adscripcion_laboral_id,
         al.unidad_medica_id,
         um.nombre AS unidad_nombre,
         um.cluesimb AS unidad_cluesimb,
         al.matricula,
         al.puesto,
         al.turno,
         al.jornada,
         al.horario,
         al.vigente_desde,
         al.vigente_hasta,
         al.activo,
         al.observaciones,
         CURRENT_DATE::text AS current_date_iso
       FROM public.rh_adscripcion_laboral al
       JOIN public.unidad_medica um
         ON um.id = al.unidad_medica_id
      WHERE al.persona_id = $1
      ORDER BY
        al.activo DESC,
        al.vigente_desde DESC,
        al.id DESC`,
      [personaId]
    );

    const fallbackTodayIso = new Date().toISOString().slice(0, 10);

    const mappedAdscripciones: RhMiContextoAdscripcionPropia[] = adscripcionesRes.rows.map(
      (row) => {
        const desdeIso = formatDateOnly(row.vigente_desde) ?? '';
        const hastaIso = formatDateOnly(row.vigente_hasta);
        const todayIso = formatDateOnly(row.current_date_iso) ?? fallbackTodayIso;
        const isActive = Boolean(row.activo);

        let estadoVigencia: RhAdscripcionEstadoVigencia;
        if (!isActive) {
          estadoVigencia = 'HISTORICA';
        } else if (desdeIso > todayIso) {
          estadoVigencia = 'FUTURA';
        } else if (hastaIso !== null && hastaIso < todayIso) {
          estadoVigencia = 'HISTORICA';
        } else {
          estadoVigencia = 'VIGENTE';
        }

        const unidad: RhUnidadAutorizada = {
          id: Number(row.unidad_medica_id),
          nombre: String(row.unidad_nombre),
          cluesimb: row.unidad_cluesimb ?? null,
        };

        return {
          adscripcion_laboral_id: Number(row.adscripcion_laboral_id),
          unidad_medica_id: Number(row.unidad_medica_id),
          unidad,
          matricula: row.matricula != null ? String(row.matricula) : null,
          puesto: row.puesto != null ? String(row.puesto) : null,
          turno: row.turno != null ? String(row.turno) : null,
          jornada: row.jornada != null ? String(row.jornada) : null,
          horario: row.horario != null ? String(row.horario) : null,
          vigente_desde: desdeIso,
          vigente_hasta: hastaIso,
          activo: isActive,
          es_vigente: estadoVigencia === 'VIGENTE',
          estado_vigencia: estadoVigencia,
          observaciones: row.observaciones != null ? String(row.observaciones) : null,
        };
      }
    );

    // Ordenar priorizando VIGENTE > FUTURA > HISTORICA y luego vigente_desde DESC, id DESC
    const priorityMap: Record<RhAdscripcionEstadoVigencia, number> = {
      VIGENTE: 0,
      FUTURA: 1,
      HISTORICA: 2,
    };
    mappedAdscripciones.sort((a, b) => {
      const prioDiff = priorityMap[a.estado_vigencia] - priorityMap[b.estado_vigencia];
      if (prioDiff !== 0) return prioDiff;
      if (a.vigente_desde !== b.vigente_desde) {
        return b.vigente_desde.localeCompare(a.vigente_desde);
      }
      return b.adscripcion_laboral_id - a.adscripcion_laboral_id;
    });

    const firstVigente = mappedAdscripciones.find((a) => a.estado_vigencia === 'VIGENTE') ?? null;
    const firstFutura = mappedAdscripciones.find((a) => a.estado_vigencia === 'FUTURA') ?? null;

    let estadoVinculacion: RhMiContextoEstadoVinculacion;
    if (mappedAdscripciones.length === 0) {
      estadoVinculacion = 'PENDIENTE_ADSCRIPCION_RH';
    } else if (firstVigente) {
      estadoVinculacion = 'ADSCRIPCION_VIGENTE';
    } else if (firstFutura) {
      estadoVinculacion = 'ADSCRIPCION_FUTURA';
    } else {
      estadoVinculacion = 'ADSCRIPCION_HISTORICA';
    }

    let unidadReferencia: RhMiContextoUnidadReferencia | null = null;
    if (firstVigente) {
      unidadReferencia = {
        id: firstVigente.unidad.id,
        nombre: firstVigente.unidad.nombre,
        cluesimb: firstVigente.unidad.cluesimb,
        origen: 'ADSCRIPCION_RH',
      };
    } else if (
      identity.directorio_unidad_id !== null &&
      identity.directorio_unidad_id !== undefined &&
      identity.directorio_unidad_activo === true
    ) {
      unidadReferencia = {
        id: Number(identity.directorio_unidad_id),
        nombre: String(identity.directorio_unidad_nombre ?? ''),
        cluesimb:
          identity.directorio_unidad_cluesimb != null
            ? String(identity.directorio_unidad_cluesimb)
            : null,
        origen: 'DIRECTORIO',
      };
    } else if (mappedAdscripciones.length > 0) {
      const topAds = mappedAdscripciones[0];
      unidadReferencia = {
        id: topAds.unidad.id,
        nombre: topAds.unidad.nombre,
        cluesimb: topAds.unidad.cluesimb,
        origen: 'ADSCRIPCION_RH',
      };
    }

    const rfcInfo = maskSensitiveIdentifier(identity.rfc, 3);
    const curpInfo = maskSensitiveIdentifier(identity.curp, 2);

    return {
      modo: 'EMPLEADO',
      persona: {
        persona_id: personaId,
        nombre_completo: String(identity.nombre_completo ?? ''),
        nombres: identity.nombres != null ? String(identity.nombres) : null,
        apellidos: identity.apellidos != null ? String(identity.apellidos) : null,
        tiene_rfc: rfcInfo.exists,
        rfc_masked: rfcInfo.masked,
        tiene_curp: curpInfo.exists,
        curp_masked: curpInfo.masked,
      },
      unidad_referencia: unidadReferencia,
      estado_vinculacion_rh: estadoVinculacion,
      adscripciones: mappedAdscripciones,
      permisos: {
        puede_ver_perfil_propio: true,
        puede_administrar_personal_desde_autogestion: false,
        puede_revelar_identificadores_desde_autogestion: false,
        puede_editar_identificacion_desde_autogestion: false,
      },
    };
  }

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

    if (opts.situacion === 'ACTIVOS') {
      conditions.push('(p.activo IS TRUE AND p.fecha_baja IS NULL)');
    } else if (opts.situacion === 'BAJAS') {
      conditions.push('(p.activo IS FALSE OR p.fecha_baja IS NOT NULL)');
    }

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

  /**
   * Alta administrativa de una persona institucional en `public.persona` (`POST /api/rh/personas`).
   *
   * - Exclusivo para `RECURSOS_HUMANOS GLOBAL`.
   * - No crea cuentas en `app_users`, ni contraseñas, ni roles, ni adscripciones laborales.
   * - Respeta el trigger `t_persona_nombre` enviando `nombres` y `apellidos` sin sobrescribir `nombre_completo`.
   * - Mapea errores de unicidad `23505` (`uq_persona_rfc` / `uq_persona_curp`) a HTTP 409 sin revelar terceros.
   * - Registra auditoría `RH_CREATE_PERSONA` en `public.app_audit_logs` dentro de la misma transacción.
   */
  async createPersonaInstitucional(
    access: RhAccessContext,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<RhPersonaAdminDto> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para registrar personas en el padrón institucional'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    const hasOwn = (k: string): boolean => Object.prototype.hasOwnProperty.call(input, k);

    const nombres = normalizeCollapsedPersonNamePart(
      hasOwn('nombres') ? input.nombres : null,
      'nombres',
      150
    );
    if (!nombres) {
      throw new RhHttpError(400, 'El campo "nombres" es obligatorio');
    }

    const apellidos = normalizeCollapsedPersonNamePart(
      hasOwn('apellidos') ? input.apellidos : null,
      'apellidos',
      150
    );
    if (!apellidos) {
      throw new RhHttpError(400, 'El campo "apellidos" es obligatorio');
    }

    const combinedLength = `${nombres} ${apellidos}`.trim().length;
    if (combinedLength > 150) {
      throw new RhHttpError(
        400,
        'La combinación de "nombres" y "apellidos" no puede exceder 150 caracteres'
      );
    }

    const rfc = hasOwn('rfc') && input.rfc !== undefined ? normalizeAndValidateRfc(input.rfc) : null;
    const curp =
      hasOwn('curp') && input.curp !== undefined ? normalizeAndValidateCurp(input.curp) : null;
    const cargo = hasOwn('cargo') ? normalizeOptionalVarchar(input.cargo, 'cargo', 100) : null;

    let fechaIngreso: string | null = null;
    if (hasOwn('fecha_ingreso') && input.fecha_ingreso !== null && input.fecha_ingreso !== undefined) {
      if (typeof input.fecha_ingreso === 'string' && input.fecha_ingreso.trim() === '') {
        fechaIngreso = null;
      } else {
        const parsedFecha = parseStrictIsoDate(input.fecha_ingreso, 'fecha_ingreso');
        if (parsedFecha < '1940-01-01' || parsedFecha > '2100-12-31') {
          throw new RhHttpError(
            400,
            'El campo "fecha_ingreso" debe estar entre 1940-01-01 y 2100-12-31'
          );
        }
        fechaIngreso = parsedFecha;
      }
    }

    let correoPrincipal: string | null = null;
    if (hasOwn('correo_principal') && input.correo_principal !== null && input.correo_principal !== undefined) {
      if (typeof input.correo_principal !== 'string') {
        throw new RhHttpError(400, 'El campo "correo_principal" debe ser una cadena de texto o null');
      }
      const cleanEmail = input.correo_principal.trim().toLowerCase();
      if (cleanEmail.length > 0) {
        if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          throw new RhHttpError(400, 'El campo "correo_principal" no tiene un formato de correo válido');
        }
        correoPrincipal = cleanEmail;
      }
    }

    let unidadMedicaId: number | null = null;
    if (hasOwn('unidad_medica_id') && input.unidad_medica_id !== null && input.unidad_medica_id !== undefined) {
      if (
        typeof input.unidad_medica_id !== 'number' ||
        !Number.isSafeInteger(input.unidad_medica_id) ||
        input.unidad_medica_id <= 0
      ) {
        throw new RhHttpError(400, 'El campo "unidad_medica_id" debe ser un entero positivo o null');
      }
      unidadMedicaId = input.unidad_medica_id;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (unidadMedicaId !== null) {
        const umRes = await client.query<{ id: number }>(
          `SELECT id
             FROM public.unidad_medica
            WHERE id = $1
              AND activo = TRUE
            LIMIT 1`,
          [unidadMedicaId]
        );
        if (!umRes.rowCount) {
          throw new RhHttpError(404, 'Unidad médica de referencia no encontrada o inactiva');
        }
      }

      const insertRes = await client.query<{
        id: number;
        nombre_completo: string;
        nombres: string | null;
        apellidos: string | null;
        cargo: string | null;
        correo_principal: string | null;
        unidad_medica_id: number | null;
        rfc: string | null;
        curp: string | null;
        activo: boolean;
        fecha_baja: unknown;
        fecha_ingreso?: unknown;
      }>(
        `INSERT INTO public.persona (
           nombres,
           apellidos,
           rfc,
           curp,
           cargo,
           correo_principal,
           unidad_medica_id,
           fecha_ingreso,
           activo
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
         RETURNING
           id,
           nombre_completo,
           nombres,
           apellidos,
           cargo,
           correo_principal,
           unidad_medica_id,
           rfc,
           curp,
           activo,
           fecha_baja,
           fecha_ingreso`,
        [nombres, apellidos, rfc, curp, cargo, correoPrincipal, unidadMedicaId, fechaIngreso]
      );

      const created = insertRes.rows[0];
      const personaId = Number(created.id);

      const camposRegistrados = ['nombres', 'apellidos', 'activo'];
      if (rfc !== null) camposRegistrados.push('rfc');
      if (curp !== null) camposRegistrados.push('curp');
      if (cargo !== null) camposRegistrados.push('cargo');
      if (correoPrincipal !== null) camposRegistrados.push('correo_principal');
      if (unidadMedicaId !== null) camposRegistrados.push('unidad_medica_id');
      if (fechaIngreso !== null) camposRegistrados.push('fecha_ingreso');

      const auditPayload = {
        persona_id: personaId,
        unidad_medica_id: unidadMedicaId,
        campos_registrados: camposRegistrados,
      };

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_CREATE_PERSONA',
          `persona:${personaId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      const rfcInfo = maskSensitiveIdentifier(created.rfc, 3);
      const curpInfo = maskSensitiveIdentifier(created.curp, 2);

      return {
        persona_id: personaId,
        nombre_completo: String(created.nombre_completo ?? `${nombres} ${apellidos}`.trim()),
        nombres: created.nombres != null ? String(created.nombres) : nombres,
        apellidos: created.apellidos != null ? String(created.apellidos) : apellidos,
        cargo: created.cargo != null ? String(created.cargo) : null,
        correo_principal: created.correo_principal != null ? String(created.correo_principal) : null,
        unidad_medica_id:
          created.unidad_medica_id != null ? Number(created.unidad_medica_id) : null,
        tiene_rfc: rfcInfo.exists,
        rfc_masked: rfcInfo.masked,
        tiene_curp: curpInfo.exists,
        curp_masked: curpInfo.masked,
        activo: Boolean(created.activo),
        fecha_baja: formatDateOnly(created.fecha_baja),
        fecha_ingreso: formatDateOnly(created.fecha_ingreso ?? fechaIngreso),
      };
    } catch (err: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }

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
          'Uno de los identificadores proporcionados ya se encuentra registrado en el directorio institucional'
        );
      }

      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cambio controlado de estado administrativo (`activo` y `fecha_baja`) de una persona
   * (`PATCH /api/rh/personas/:personaId/estado`).
   *
   * - Exclusivo para `RECURSOS_HUMANOS GLOBAL`.
   * - No elimina físicamente registros, ni modifica `app_users`, roles ni adscripciones.
   * - Al desactivar (`activo = false`), bloquea con HTTP 409 si existe una cuenta activa vinculada
   *   en `app_users` o una adscripción laboral vigente en `rh_adscripcion_laboral`.
   * - Idempotente: si el estado solicitado coincide con el actual, no ejecuta UPDATE ni duplica auditoría.
   * - Registra `RH_UPDATE_PERSONA_ESTADO` en `app_audit_logs` dentro de la misma transacción.
   */
  async updatePersonaEstadoAdministrativo(
    access: RhAccessContext,
    personaId: number,
    activo: boolean,
    auditMeta: RhAuditMeta
  ): Promise<RhUpdatePersonaEstadoResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para modificar el estado administrativo de personas'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    if (!Number.isInteger(personaId) || personaId <= 0) {
      throw new RhHttpError(400, 'Identificador de persona inválido');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const personaRes = await client.query<{
        id: number;
        nombre_completo: string;
        nombres: string | null;
        apellidos: string | null;
        cargo: string | null;
        correo_principal: string | null;
        unidad_medica_id: number | null;
        rfc: string | null;
        curp: string | null;
        activo: boolean;
        fecha_baja: unknown;
        fecha_ingreso?: unknown;
      }>(
        `SELECT id, nombre_completo, nombres, apellidos, cargo, correo_principal,
                unidad_medica_id, rfc, curp, activo, fecha_baja, fecha_ingreso
           FROM public.persona
          WHERE id = $1
            FOR UPDATE`,
        [personaId]
      );

      if (!personaRes.rowCount) {
        throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
      }

      const current = personaRes.rows[0];
      const currentActivo = Boolean(current.activo);

      if (currentActivo === activo) {
        await client.query('COMMIT');
        const rfcInfoNoOp = maskSensitiveIdentifier(current.rfc, 3);
        const curpInfoNoOp = maskSensitiveIdentifier(current.curp, 2);
        return {
          persona: {
            persona_id: Number(current.id),
            nombre_completo: String(current.nombre_completo ?? ''),
            nombres: current.nombres != null ? String(current.nombres) : null,
            apellidos: current.apellidos != null ? String(current.apellidos) : null,
            cargo: current.cargo != null ? String(current.cargo) : null,
            correo_principal: current.correo_principal != null ? String(current.correo_principal) : null,
            unidad_medica_id:
              current.unidad_medica_id != null ? Number(current.unidad_medica_id) : null,
            tiene_rfc: rfcInfoNoOp.exists,
            rfc_masked: rfcInfoNoOp.masked,
            tiene_curp: curpInfoNoOp.exists,
            curp_masked: curpInfoNoOp.masked,
            activo: currentActivo,
            fecha_baja: formatDateOnly(current.fecha_baja),
          },
          estado_anterior: currentActivo,
          estado_nuevo: currentActivo,
          idempotente: true,
          campos_modificados: [],
        };
      }

      if (!activo) {
        const activeUserRes = await client.query<{ id: string }>(
          `SELECT id
             FROM public.app_users
            WHERE persona_id = $1
              AND UPPER(TRIM(status)) = 'ACTIVE'
            LIMIT 1`,
          [personaId]
        );
        if (activeUserRes.rowCount) {
          throw new RhHttpError(
            409,
            'No se puede desactivar administrativamente una persona que tiene una cuenta de acceso activa vinculada'
          );
        }

        const activeAdsRes = await client.query<{ id: number }>(
          `SELECT id
             FROM public.rh_adscripcion_laboral
            WHERE persona_id = $1
              AND activo = TRUE
              AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
            LIMIT 1`,
          [personaId]
        );
        if (activeAdsRes.rowCount) {
          throw new RhHttpError(
            409,
            'No se puede desactivar administrativamente una persona con adscripción laboral vigente'
          );
        }
      }

      const updateRes = await client.query<{
        id: number;
        nombre_completo: string;
        nombres: string | null;
        apellidos: string | null;
        cargo: string | null;
        correo_principal: string | null;
        unidad_medica_id: number | null;
        rfc: string | null;
        curp: string | null;
        activo: boolean;
        fecha_baja: unknown;
      }>(
        activo
          ? `UPDATE public.persona
                SET activo = TRUE,
                    fecha_baja = NULL,
                    actualizado_en = NOW()
              WHERE id = $1
              RETURNING id, nombre_completo, nombres, apellidos, cargo, correo_principal,
                        unidad_medica_id, rfc, curp, activo, fecha_baja`
          : `UPDATE public.persona
                SET activo = FALSE,
                    fecha_baja = CURRENT_DATE,
                    actualizado_en = NOW()
              WHERE id = $1
              RETURNING id, nombre_completo, nombres, apellidos, cargo, correo_principal,
                        unidad_medica_id, rfc, curp, activo, fecha_baja`,
        [personaId]
      );

      const updated = updateRes.rows[0];
      const camposModificados = ['activo', 'fecha_baja'];

      const auditPayload = {
        persona_id: personaId,
        estado_anterior: currentActivo,
        estado_nuevo: activo,
        campos_modificados: camposModificados,
      };

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_UPDATE_PERSONA_ESTADO',
          `persona:${personaId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      const rfcInfo = maskSensitiveIdentifier(updated.rfc, 3);
      const curpInfo = maskSensitiveIdentifier(updated.curp, 2);

      return {
        persona: {
          persona_id: Number(updated.id),
          nombre_completo: String(updated.nombre_completo ?? ''),
          nombres: updated.nombres != null ? String(updated.nombres) : null,
          apellidos: updated.apellidos != null ? String(updated.apellidos) : null,
          cargo: updated.cargo != null ? String(updated.cargo) : null,
          correo_principal: updated.correo_principal != null ? String(updated.correo_principal) : null,
          unidad_medica_id:
            updated.unidad_medica_id != null ? Number(updated.unidad_medica_id) : null,
          tiene_rfc: rfcInfo.exists,
          rfc_masked: rfcInfo.masked,
          tiene_curp: curpInfo.exists,
          curp_masked: curpInfo.masked,
          activo: Boolean(updated.activo),
          fecha_baja: formatDateOnly(updated.fecha_baja),
        },
        estado_anterior: currentActivo,
        estado_nuevo: Boolean(updated.activo),
        idempotente: false,
        campos_modificados: camposModificados,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Consulta paginada del padrón institucional directamente sobre `public.persona`
   * (`GET /api/rh/personas`), independiente de `rh_adscripcion_laboral` y `app_users`.
   *
   * - Exclusivo para `RECURSOS_HUMANOS GLOBAL`.
   * - Utiliza `LEFT JOIN` para incluir personas sin cuenta en `app_users`, sin adscripción
   *   laboral y sin unidad médica de referencia (`unidad_medica_id IS NULL`).
   * - Enmascara siempre RFC y CURP antes de construir el DTO.
   */
  async listPersonasPadronInstitucional(
    access: RhAccessContext,
    opts: RhPersonasPadronQueryOpts = {}
  ): Promise<RhPersonasPadronPagedResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar el padrón institucional completo'
      );
    }

    const rawPageSize = Number(opts.pageSize ?? 20);
    const rawPage = Number(opts.page ?? 1);
    const pageSize = Math.min(
      Math.max(Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 20, 1),
      100
    );
    const page = Math.max(Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1, 1);
    const offset = (page - 1) * pageSize;

    const params: unknown[] = [];
    const conditions: string[] = [];

    const estado = opts.estado ?? 'todas';
    if (estado === 'activas') {
      conditions.push('p.activo = TRUE');
    } else if (estado === 'inactivas') {
      conditions.push('p.activo = FALSE');
    }

    if (opts.sinUnidad === true) {
      conditions.push('p.unidad_medica_id IS NULL');
    } else if (opts.unidadId !== null && opts.unidadId !== undefined) {
      params.push(opts.unidadId);
      conditions.push(`p.unidad_medica_id = $${params.length}`);
    }

    const q = typeof opts.q === 'string' ? opts.q.trim() : '';
    if (q.length > 0) {
      params.push(q.toLowerCase());
      const qParam = `$${params.length}`;
      conditions.push(`(
        LOWER(COALESCE(p.nombre_completo, '')) LIKE '%' || ${qParam} || '%' OR
        LOWER(COALESCE(p.nombres, '')) LIKE '%' || ${qParam} || '%' OR
        LOWER(COALESCE(p.apellidos, '')) LIKE '%' || ${qParam} || '%'
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(pageSize);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const sql = `
      SELECT
        p.id AS persona_id,
        p.nombre_completo,
        p.nombres,
        p.apellidos,
        p.cargo,
        p.correo_principal,
        p.unidad_medica_id,
        um.nombre AS unidad_medica_nombre,
        um.cluesimb AS unidad_medica_cluesimb,
        p.rfc,
        p.curp,
        p.activo,
        p.fecha_baja,
        p.fecha_ingreso,
        COALESCE(acc.tiene_cuenta_activa, FALSE) AS tiene_cuenta_activa,
        COUNT(*) OVER() AS total
      FROM public.persona p
      LEFT JOIN public.unidad_medica um
        ON um.id = p.unidad_medica_id
      LEFT JOIN LATERAL (
        SELECT TRUE AS tiene_cuenta_activa
          FROM public.app_users u
         WHERE u.persona_id = p.id
           AND UPPER(TRIM(u.status)) = 'ACTIVE'
         LIMIT 1
      ) acc ON TRUE
      ${whereClause}
      ORDER BY
        p.activo DESC,
        LOWER(TRIM(p.nombre_completo)) ASC,
        p.id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const { rows } = await pool.query(sql, params);
    const total = rows.length > 0 ? Number(rows[0].total) : 0;

    const items: RhPersonasPadronItem[] = rows.map((r: any) => {
      const rfcInfo = maskSensitiveIdentifier(r.rfc, 3);
      const curpInfo = maskSensitiveIdentifier(r.curp, 2);

      return {
        persona_id: Number(r.persona_id),
        nombre_completo: String(r.nombre_completo ?? ''),
        nombres: r.nombres != null ? String(r.nombres) : null,
        apellidos: r.apellidos != null ? String(r.apellidos) : null,
        cargo: r.cargo != null ? String(r.cargo) : null,
        correo_principal: r.correo_principal != null ? String(r.correo_principal) : null,
        unidad_medica_id: r.unidad_medica_id != null ? Number(r.unidad_medica_id) : null,
        unidad_medica_nombre:
          r.unidad_medica_nombre != null ? String(r.unidad_medica_nombre) : null,
        unidad_medica_cluesimb:
          r.unidad_medica_cluesimb != null ? String(r.unidad_medica_cluesimb) : null,
        tiene_rfc: rfcInfo.exists,
        rfc_masked: rfcInfo.masked,
        tiene_curp: curpInfo.exists,
        curp_masked: curpInfo.masked,
        activo: Boolean(r.activo),
        fecha_baja: formatDateOnly(r.fecha_baja),
        fecha_ingreso: formatDateOnly(r.fecha_ingreso),
        tiene_cuenta_activa: Boolean(r.tiene_cuenta_activa),
      };
    });

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  /**
   * Edición parcial y auditada de datos generales del directorio institucional en `public.persona`
   * (`PATCH /api/rh/personas/:personaId/general`).
   *
   * - Exclusivo para `RECURSOS_HUMANOS GLOBAL`.
   * - Campos permitidos: `cargo`, `correo_principal`, `unidad_medica_id` (referencia del directorio).
   * - Nunca modifica `rh_adscripcion_laboral`, `nombres`, `apellidos`, `rfc`, `curp`, `activo` ni `app_users`.
   * - Soporta `OFICINA CENTRAL` (`id = 177`, `cluesimb = 'N/A'`) y `unidad_medica_id = null`.
   * - Idempotente: si no hay cambios efectivos, no ejecuta UPDATE ni duplica auditoría.
   * - Registra `RH_UPDATE_PERSONA_GENERAL` en `app_audit_logs` dentro de la misma transacción
   *   sin almacenar `correo_principal`, `rfc` ni `curp`.
   */
  async updatePersonaGeneralDatos(
    access: RhAccessContext,
    personaId: number,
    patch: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<RhUpdatePersonaGeneralResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para editar datos generales del padrón institucional'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    if (!Number.isInteger(personaId) || personaId <= 0) {
      throw new RhHttpError(400, 'Identificador de persona inválido');
    }

    const hasOwn = (k: string): boolean => Object.prototype.hasOwnProperty.call(patch, k);

    const parsedPatch: {
      nombres?: string;
      apellidos?: string;
      cargo?: string | null;
      correo_principal?: string | null;
      unidad_medica_id?: number | null;
      curp?: string | null;
      rfc?: string | null;
      fecha_ingreso?: string | null;
    } = {};

    if (hasOwn('fecha_ingreso')) {
      if (
        patch.fecha_ingreso === null ||
        (typeof patch.fecha_ingreso === 'string' && patch.fecha_ingreso.trim() === '')
      ) {
        parsedPatch.fecha_ingreso = null;
      } else {
        const parsedFecha = parseStrictIsoDate(patch.fecha_ingreso, 'fecha_ingreso');
        if (parsedFecha < '1940-01-01' || parsedFecha > '2100-12-31') {
          throw new RhHttpError(
            400,
            'El campo "fecha_ingreso" debe estar entre 1940-01-01 y 2100-12-31'
          );
        }
        parsedPatch.fecha_ingreso = parsedFecha;
      }
    }

    if (hasOwn('nombres')) {
      const cleanNombres = normalizeCollapsedPersonNamePart(patch.nombres, 'nombres', 150);
      if (!cleanNombres) {
        throw new RhHttpError(400, 'El campo "nombres" no puede estar vacío');
      }
      parsedPatch.nombres = cleanNombres;
    }

    if (hasOwn('apellidos')) {
      const cleanApellidos = normalizeCollapsedPersonNamePart(patch.apellidos, 'apellidos', 150);
      if (!cleanApellidos) {
        throw new RhHttpError(400, 'El campo "apellidos" no puede estar vacío');
      }
      parsedPatch.apellidos = cleanApellidos;
    }

    if (hasOwn('curp')) {
      parsedPatch.curp = normalizeAndValidateCurp(patch.curp);
    }

    if (hasOwn('rfc')) {
      parsedPatch.rfc = normalizeAndValidateRfc(patch.rfc);
    }

    if (hasOwn('cargo')) {
      parsedPatch.cargo = normalizeOptionalVarchar(patch.cargo, 'cargo', 100);
    }

    if (hasOwn('correo_principal')) {
      if (patch.correo_principal === null || patch.correo_principal === undefined) {
        parsedPatch.correo_principal = null;
      } else if (typeof patch.correo_principal !== 'string') {
        throw new RhHttpError(400, 'El campo "correo_principal" debe ser una cadena de texto o null');
      } else {
        const cleanEmail = patch.correo_principal.trim().toLowerCase();
        if (cleanEmail.length === 0) {
          parsedPatch.correo_principal = null;
        } else if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          throw new RhHttpError(400, 'El campo "correo_principal" no tiene un formato de correo válido');
        } else {
          parsedPatch.correo_principal = cleanEmail;
        }
      }
    }

    if (hasOwn('unidad_medica_id')) {
      if (patch.unidad_medica_id === null || patch.unidad_medica_id === undefined) {
        parsedPatch.unidad_medica_id = null;
      } else if (
        typeof patch.unidad_medica_id !== 'number' ||
        !Number.isSafeInteger(patch.unidad_medica_id) ||
        patch.unidad_medica_id <= 0
      ) {
        throw new RhHttpError(400, 'El campo "unidad_medica_id" debe ser un entero positivo o null');
      } else {
        parsedPatch.unidad_medica_id = patch.unidad_medica_id;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const personaRes = await client.query<{
        id: number;
        nombre_completo: string;
        nombres: string | null;
        apellidos: string | null;
        cargo: string | null;
        correo_principal: string | null;
        unidad_medica_id: number | null;
        rfc: string | null;
        curp: string | null;
        activo: boolean;
        fecha_baja: unknown;
        fecha_ingreso?: unknown;
      }>(
        `SELECT id, nombre_completo, nombres, apellidos, cargo, correo_principal,
                unidad_medica_id, rfc, curp, activo, fecha_baja, fecha_ingreso
           FROM public.persona
          WHERE id = $1
            FOR UPDATE`,
        [personaId]
      );

      if (!personaRes.rowCount) {
        throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
      }

      const current = personaRes.rows[0];
      const currentNombres =
        current.nombres != null && String(current.nombres).trim() !== ''
          ? String(current.nombres).trim()
          : null;
      const currentApellidos =
        current.apellidos != null && String(current.apellidos).trim() !== ''
          ? String(current.apellidos).trim()
          : null;
      const currentCargo =
        current.cargo != null && String(current.cargo).trim() !== ''
          ? String(current.cargo).trim()
          : null;
      const currentCorreo =
        current.correo_principal != null && String(current.correo_principal).trim() !== ''
          ? String(current.correo_principal).trim().toLowerCase()
          : null;
      const currentUnidadId =
        current.unidad_medica_id != null ? Number(current.unidad_medica_id) : null;
      const currentCurp =
        current.curp != null && String(current.curp).trim() !== ''
          ? String(current.curp).trim().toUpperCase()
          : null;
      const currentRfc =
        current.rfc != null && String(current.rfc).trim() !== ''
          ? String(current.rfc).trim().toUpperCase()
          : null;
      const currentFechaIngreso = formatDateOnly(current.fecha_ingreso);

      const finalNombres = hasOwn('nombres') ? parsedPatch.nombres! : currentNombres;
      const finalApellidos = hasOwn('apellidos') ? parsedPatch.apellidos! : currentApellidos;
      const finalNombreCompleto =
        hasOwn('nombres') || hasOwn('apellidos')
          ? `${finalNombres ?? ''} ${finalApellidos ?? ''}`.trim()
          : String(current.nombre_completo ?? '');

      if ((hasOwn('nombres') || hasOwn('apellidos')) && (!finalNombreCompleto || finalNombreCompleto.length > 150)) {
        throw new RhHttpError(
          400,
          'La combinación de "nombres" y "apellidos" debe tener entre 1 y 150 caracteres'
        );
      }

      const finalCargo = hasOwn('cargo') ? parsedPatch.cargo! : currentCargo;
      const finalCorreo = hasOwn('correo_principal') ? parsedPatch.correo_principal! : currentCorreo;
      const finalUnidadId = hasOwn('unidad_medica_id')
        ? parsedPatch.unidad_medica_id!
        : currentUnidadId;
      const finalCurp = hasOwn('curp') ? parsedPatch.curp! : currentCurp;
      const finalRfc = hasOwn('rfc') ? parsedPatch.rfc! : currentRfc;
      const finalFechaIngreso = hasOwn('fecha_ingreso')
        ? parsedPatch.fecha_ingreso!
        : currentFechaIngreso;

      if (finalUnidadId !== null && finalUnidadId !== currentUnidadId) {
        const umRes = await client.query<{ id: number }>(
          `SELECT id
             FROM public.unidad_medica
            WHERE id = $1
              AND activo = TRUE
            LIMIT 1`,
          [finalUnidadId]
        );
        if (!umRes.rowCount) {
          throw new RhHttpError(404, 'Unidad médica de referencia no encontrada o inactiva');
        }
      }

      if (finalCurp !== null && finalCurp !== currentCurp) {
        const dupCurp = await client.query<{ id: number }>(
          `SELECT id
             FROM public.persona
            WHERE UPPER(BTRIM(curp)) = $1
              AND id <> $2
            LIMIT 1`,
          [finalCurp, personaId]
        );
        if (dupCurp.rowCount) {
          throw new RhHttpError(409, 'Ya existe otra persona registrada con esa CURP');
        }
      }

      if (finalRfc !== null && finalRfc !== currentRfc) {
        const dupRfc = await client.query<{ id: number }>(
          `SELECT id
             FROM public.persona
            WHERE UPPER(BTRIM(rfc)) = $1
              AND id <> $2
            LIMIT 1`,
          [finalRfc, personaId]
        );
        if (dupRfc.rowCount) {
          throw new RhHttpError(409, 'Ya existe otra persona registrada con ese RFC');
        }
      }

      const camposModificados: string[] = [];
      if (finalNombres !== currentNombres) camposModificados.push('nombres');
      if (finalApellidos !== currentApellidos) camposModificados.push('apellidos');
      if (finalCargo !== currentCargo) camposModificados.push('cargo');
      if (finalCorreo !== currentCorreo) camposModificados.push('correo_principal');
      if (finalUnidadId !== currentUnidadId) camposModificados.push('unidad_medica_id');
      if (finalCurp !== currentCurp) camposModificados.push('curp');
      if (finalRfc !== currentRfc) camposModificados.push('rfc');
      if (finalFechaIngreso !== currentFechaIngreso) camposModificados.push('fecha_ingreso');

      if (camposModificados.length === 0) {
        await client.query('COMMIT');
        const rfcInfoNoOp = maskSensitiveIdentifier(current.rfc, 3);
        const curpInfoNoOp = maskSensitiveIdentifier(current.curp, 2);
        return {
          persona: {
            persona_id: Number(current.id),
            nombre_completo: String(current.nombre_completo ?? ''),
            nombres: current.nombres != null ? String(current.nombres) : null,
            apellidos: current.apellidos != null ? String(current.apellidos) : null,
            cargo: currentCargo,
            correo_principal: currentCorreo,
            unidad_medica_id: currentUnidadId,
            tiene_rfc: rfcInfoNoOp.exists,
            rfc_masked: rfcInfoNoOp.masked,
            tiene_curp: curpInfoNoOp.exists,
            curp_masked: curpInfoNoOp.masked,
            activo: Boolean(current.activo),
            fecha_baja: formatDateOnly(current.fecha_baja),
            fecha_ingreso: currentFechaIngreso,
          },
          idempotente: true,
          campos_modificados: [],
        };
      }

      const setClauses: string[] = [];
      const updateParams: unknown[] = [];

      if (camposModificados.includes('nombres')) {
        updateParams.push(finalNombres);
        setClauses.push(`nombres = $${updateParams.length}`);
      }
      if (camposModificados.includes('apellidos')) {
        updateParams.push(finalApellidos);
        setClauses.push(`apellidos = $${updateParams.length}`);
      }
      if (camposModificados.includes('nombres') || camposModificados.includes('apellidos')) {
        updateParams.push(finalNombreCompleto);
        setClauses.push(`nombre_completo = $${updateParams.length}`);
      }
      if (camposModificados.includes('cargo')) {
        updateParams.push(finalCargo);
        setClauses.push(`cargo = $${updateParams.length}`);
      }
      if (camposModificados.includes('correo_principal')) {
        updateParams.push(finalCorreo);
        setClauses.push(`correo_principal = $${updateParams.length}`);
      }
      if (camposModificados.includes('unidad_medica_id')) {
        updateParams.push(finalUnidadId);
        setClauses.push(`unidad_medica_id = $${updateParams.length}`);
      }
      if (camposModificados.includes('curp')) {
        updateParams.push(finalCurp);
        setClauses.push(`curp = $${updateParams.length}`);
      }
      if (camposModificados.includes('rfc')) {
        updateParams.push(finalRfc);
        setClauses.push(`rfc = $${updateParams.length}`);
      }
      if (camposModificados.includes('fecha_ingreso')) {
        updateParams.push(finalFechaIngreso);
        setClauses.push(`fecha_ingreso = $${updateParams.length}`);
      }
      setClauses.push('actualizado_en = NOW()');

      updateParams.push(personaId);
      const whereIdx = updateParams.length;

      const updateRes = await client.query<{
        id: number;
        nombre_completo: string;
        nombres: string | null;
        apellidos: string | null;
        cargo: string | null;
        correo_principal: string | null;
        unidad_medica_id: number | null;
        rfc: string | null;
        curp: string | null;
        activo: boolean;
        fecha_baja: unknown;
        fecha_ingreso?: unknown;
      }>(
        `UPDATE public.persona
            SET ${setClauses.join(', ')}
          WHERE id = $${whereIdx}
          RETURNING id, nombre_completo, nombres, apellidos, cargo, correo_principal,
                    unidad_medica_id, rfc, curp, activo, fecha_baja, fecha_ingreso`,
        updateParams
      );

      const updated = updateRes.rows[0];

      // Auditoría sin correo electrónico completo ni identificadores sensibles
      const auditPayload: Record<string, unknown> = {
        persona_id: personaId,
        campos_modificados: camposModificados,
      };
      if (camposModificados.includes('unidad_medica_id')) {
        auditPayload.unidad_medica_id_anterior = currentUnidadId;
        auditPayload.unidad_medica_id_nueva = finalUnidadId;
      }

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_UPDATE_PERSONA_GENERAL',
          `persona:${personaId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      const rfcInfo = maskSensitiveIdentifier(updated.rfc, 3);
      const curpInfo = maskSensitiveIdentifier(updated.curp, 2);

      return {
        persona: {
          persona_id: Number(updated.id),
          nombre_completo: String(updated.nombre_completo ?? ''),
          nombres: updated.nombres != null ? String(updated.nombres) : null,
          apellidos: updated.apellidos != null ? String(updated.apellidos) : null,
          cargo: updated.cargo != null ? String(updated.cargo) : null,
          correo_principal: updated.correo_principal != null ? String(updated.correo_principal) : null,
          unidad_medica_id:
            updated.unidad_medica_id != null ? Number(updated.unidad_medica_id) : null,
          tiene_rfc: rfcInfo.exists,
          rfc_masked: rfcInfo.masked,
          tiene_curp: curpInfo.exists,
          curp_masked: curpInfo.masked,
          activo: Boolean(updated.activo),
          fecha_baja: formatDateOnly(updated.fecha_baja),
          fecha_ingreso: formatDateOnly(updated.fecha_ingreso ?? finalFechaIngreso),
        },
        idempotente: false,
        campos_modificados: camposModificados,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    } finally {
      client.release();
    }
  }

  private computeComisionEstadoVigencia(
    activo: boolean,
    fechaInicio: string,
    fechaFin: string | null,
    todayIso: string
  ): RhComisionEstadoVigencia {
    if (!activo) {
      return 'CONCLUIDA';
    }
    if (fechaInicio > todayIso) {
      return 'FUTURA';
    }
    if (fechaFin !== null && fechaFin < todayIso) {
      return 'CONCLUIDA';
    }
    return 'VIGENTE';
  }

  async listComisionesPorPersona(
    access: RhAccessContext,
    personaId: number,
    opts: { estado?: 'todas' | 'vigentes' | 'futuras' | 'concluidas'; page?: number; pageSize?: number } = {}
  ): Promise<RhComisionesListResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar comisiones laborales'
      );
    }

    if (!Number.isInteger(personaId) || personaId <= 0) {
      throw new RhHttpError(400, 'Identificador de persona inválido');
    }

    const personaCheck = await pool.query<{ id: number }>(
      `SELECT id FROM public.persona WHERE id = $1 LIMIT 1`,
      [personaId]
    );
    if (!personaCheck.rowCount) {
      throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
    }

    const rawPageSize = Number(opts.pageSize ?? 20);
    const rawPage = Number(opts.page ?? 1);
    const pageSize = Math.min(Math.max(Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 20, 1), 100);
    const page = Math.max(Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1, 1);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['c.persona_id = $1'];
    const estado = opts.estado ?? 'todas';
    if (estado === 'vigentes') {
      conditions.push(
        'c.activo = TRUE AND c.fecha_inicio <= CURRENT_DATE AND (c.fecha_fin IS NULL OR c.fecha_fin >= CURRENT_DATE)'
      );
    } else if (estado === 'futuras') {
      conditions.push('c.activo = TRUE AND c.fecha_inicio > CURRENT_DATE');
    } else if (estado === 'concluidas') {
      conditions.push('(c.activo = FALSE OR (c.fecha_fin IS NOT NULL AND c.fecha_fin < CURRENT_DATE))');
    }

    const sql = `
      SELECT
        c.id,
        c.persona_id,
        c.adscripcion_origen_id,
        c.unidad_destino_id,
        um.nombre AS unidad_destino_nombre,
        um.cluesimb AS unidad_destino_cluesimb,
        c.area_destino_texto,
        c.fecha_inicio,
        c.fecha_fin,
        c.motivo,
        c.oficio_referencia,
        c.observaciones,
        c.activo,
        CURRENT_DATE::text AS current_date_iso,
        COUNT(*) OVER() AS total
      FROM public.rh_comision_laboral c
      LEFT JOIN public.unidad_medica um
        ON um.id = c.unidad_destino_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        c.activo DESC,
        c.fecha_inicio DESC,
        c.id DESC
      LIMIT $2 OFFSET $3
    `;

    const { rows } = await pool.query(sql, [personaId, pageSize, offset]);
    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const fallbackToday = new Date().toISOString().slice(0, 10);

    const items: RhComisionLaboralDto[] = rows.map((r: any) => {
      const inicio = formatDateOnly(r.fecha_inicio) ?? '';
      const fin = formatDateOnly(r.fecha_fin);
      const today = formatDateOnly(r.current_date_iso) ?? fallbackToday;
      const activo = Boolean(r.activo);

      return {
        id: Number(r.id),
        persona_id: Number(r.persona_id),
        adscripcion_origen_id: r.adscripcion_origen_id != null ? Number(r.adscripcion_origen_id) : null,
        sin_adscripcion_formal_origen: r.adscripcion_origen_id == null,
        unidad_destino_id: r.unidad_destino_id != null ? Number(r.unidad_destino_id) : null,
        unidad_destino_nombre: r.unidad_destino_nombre != null ? String(r.unidad_destino_nombre) : null,
        unidad_destino_cluesimb: r.unidad_destino_cluesimb != null ? String(r.unidad_destino_cluesimb) : null,
        area_destino_texto: r.area_destino_texto != null ? String(r.area_destino_texto) : null,
        fecha_inicio: inicio,
        fecha_fin: fin,
        motivo: r.motivo != null ? String(r.motivo) : null,
        oficio_referencia: r.oficio_referencia != null ? String(r.oficio_referencia) : null,
        observaciones: r.observaciones != null ? String(r.observaciones) : null,
        activo,
        estado_vigencia: this.computeComisionEstadoVigencia(activo, inicio, fin, today),
      };
    });

    return {
      persona_id: personaId,
      items,
      page,
      pageSize,
      total,
    };
  }

  async createComisionLaboral(
    access: RhAccessContext,
    personaId: number,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<RhComisionLaboralDto> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para registrar comisiones laborales'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    if (!Number.isInteger(personaId) || personaId <= 0) {
      throw new RhHttpError(400, 'Identificador de persona inválido');
    }

    const hasOwn = (k: string): boolean => Object.prototype.hasOwnProperty.call(input, k);

    let adscripcionOrigenId: number | null = null;
    if (hasOwn('adscripcion_origen_id') && input.adscripcion_origen_id !== null && input.adscripcion_origen_id !== undefined) {
      if (
        typeof input.adscripcion_origen_id !== 'number' ||
        !Number.isSafeInteger(input.adscripcion_origen_id) ||
        input.adscripcion_origen_id <= 0
      ) {
        throw new RhHttpError(400, 'El campo "adscripcion_origen_id" debe ser un entero positivo o null');
      }
      adscripcionOrigenId = input.adscripcion_origen_id;
    }

    let unidadDestinoId: number | null = null;
    if (hasOwn('unidad_destino_id') && input.unidad_destino_id !== null && input.unidad_destino_id !== undefined) {
      if (
        typeof input.unidad_destino_id !== 'number' ||
        !Number.isSafeInteger(input.unidad_destino_id) ||
        input.unidad_destino_id <= 0
      ) {
        throw new RhHttpError(400, 'El campo "unidad_destino_id" debe ser un entero positivo o null');
      }
      unidadDestinoId = input.unidad_destino_id;
    }

    const areaDestinoTexto = hasOwn('area_destino_texto')
      ? normalizeOptionalVarchar(input.area_destino_texto, 'area_destino_texto', 160)
      : null;

    if (unidadDestinoId === null && areaDestinoTexto === null) {
      throw new RhHttpError(
        400,
        'Debe especificar un destino identificable: "unidad_destino_id", "area_destino_texto" o ambos'
      );
    }

    const fechaInicio = parseStrictIsoDate(input.fecha_inicio, 'fecha_inicio');
    let fechaFin: string | null = null;
    if (hasOwn('fecha_fin') && input.fecha_fin !== null && input.fecha_fin !== undefined) {
      if (typeof input.fecha_fin === 'string' && input.fecha_fin.trim() === '') {
        fechaFin = null;
      } else {
        fechaFin = parseStrictIsoDate(input.fecha_fin, 'fecha_fin');
      }
    }

    if (fechaFin !== null && fechaFin < fechaInicio) {
      throw new RhHttpError(400, 'La fecha "fecha_fin" no puede ser anterior a "fecha_inicio"');
    }

    const motivo = hasOwn('motivo') ? normalizeOptionalVarchar(input.motivo, 'motivo', 200) : null;
    const oficioReferencia = hasOwn('oficio_referencia')
      ? normalizeOptionalVarchar(input.oficio_referencia, 'oficio_referencia', 120)
      : null;
    const observaciones = hasOwn('observaciones')
      ? normalizeOptionalVarchar(input.observaciones, 'observaciones', 2000)
      : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) Bloquear fila de persona para serializar altas concurrentes de comisiones
      const personaRes = await client.query<{ id: number; activo: boolean }>(
        `SELECT id, activo FROM public.persona WHERE id = $1 FOR UPDATE`,
        [personaId]
      );
      if (!personaRes.rowCount) {
        throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
      }
      if (personaRes.rows[0].activo !== true) {
        throw new RhHttpError(
          409,
          'No se puede registrar una comisión laboral para una persona inactiva en el padrón'
        );
      }

      // 2) Validar unidad destino si se proporcionó (soporta OFICINA CENTRAL id=177, CLUES N/A)
      let unidadDestinoNombre: string | null = null;
      let unidadDestinoClues: string | null = null;
      if (unidadDestinoId !== null) {
        const umRes = await client.query<{ id: number; nombre: string; cluesimb: string | null }>(
          `SELECT id, nombre, cluesimb FROM public.unidad_medica WHERE id = $1 AND activo = TRUE LIMIT 1`,
          [unidadDestinoId]
        );
        if (!umRes.rowCount) {
          throw new RhHttpError(404, 'Unidad médica de destino no encontrada o inactiva');
        }
        unidadDestinoNombre = String(umRes.rows[0].nombre);
        unidadDestinoClues = umRes.rows[0].cluesimb ?? null;
      }

      // 3) Si se indicó adscripcion_origen_id, verificar que pertenezca a la misma persona (sin modificar rh_adscripcion_laboral)
      if (adscripcionOrigenId !== null) {
        const adsRes = await client.query<{ id: number; persona_id: number }>(
          `SELECT id, persona_id FROM public.rh_adscripcion_laboral WHERE id = $1 LIMIT 1`,
          [adscripcionOrigenId]
        );
        if (!adsRes.rowCount) {
          throw new RhHttpError(404, 'La adscripción de origen especificada no existe');
        }
        if (Number(adsRes.rows[0].persona_id) !== personaId) {
          throw new RhHttpError(
            409,
            'La adscripción de origen especificada pertenece a otra persona'
          );
        }
      }

      // 4) Bloquear y validar superposición contra comisiones activas de la misma persona
      const activeComisionesRes = await client.query<{
        id: number;
        fecha_inicio: unknown;
        fecha_fin: unknown;
        activo: boolean;
      }>(
        `SELECT id, fecha_inicio, fecha_fin, activo
           FROM public.rh_comision_laboral
          WHERE persona_id = $1
            AND activo = TRUE
          ORDER BY id ASC
            FOR UPDATE`,
        [personaId]
      );

      for (const existing of activeComisionesRes.rows) {
        const exInicio = formatDateOnly(existing.fecha_inicio) ?? '0001-01-01';
        const exFin = formatDateOnly(existing.fecha_fin);
        if (dateRangesOverlap(fechaInicio, fechaFin, exInicio, exFin)) {
          throw new RhHttpError(
            409,
            'El periodo de la comisión se superpone con otra comisión activa registrada para la misma persona'
          );
        }
      }

      // 5) Insertar nueva comisión laboral (sin tocar rh_adscripcion_laboral)
      const insertRes = await client.query<{
        id: number;
        persona_id: number;
        adscripcion_origen_id: number | null;
        unidad_destino_id: number | null;
        area_destino_texto: string | null;
        fecha_inicio: unknown;
        fecha_fin: unknown;
        motivo: string | null;
        oficio_referencia: string | null;
        observaciones: string | null;
        activo: boolean;
        current_date_iso: unknown;
      }>(
        `INSERT INTO public.rh_comision_laboral (
           persona_id,
           adscripcion_origen_id,
           unidad_destino_id,
           area_destino_texto,
           fecha_inicio,
           fecha_fin,
           motivo,
           oficio_referencia,
           observaciones,
           activo,
           creado_por,
           actualizado_por
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $10)
         RETURNING
           id, persona_id, adscripcion_origen_id, unidad_destino_id, area_destino_texto,
           fecha_inicio, fecha_fin, motivo, oficio_referencia, observaciones, activo,
           CURRENT_DATE::text AS current_date_iso`,
        [
          personaId,
          adscripcionOrigenId,
          unidadDestinoId,
          areaDestinoTexto,
          fechaInicio,
          fechaFin,
          motivo,
          oficioReferencia,
          observaciones,
          rawUserId,
        ]
      );

      const created = insertRes.rows[0];
      const comisionId = Number(created.id);

      const auditPayload = {
        comision_id: comisionId,
        persona_id: personaId,
        adscripcion_origen_id: adscripcionOrigenId,
        unidad_destino_id: unidadDestinoId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        oficio_referencia: oficioReferencia,
      };

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_CREATE_COMISION',
          `rh_comision_laboral:${comisionId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      const todayIso =
        formatDateOnly(created.current_date_iso) ?? new Date().toISOString().slice(0, 10);

      return {
        id: comisionId,
        persona_id: personaId,
        adscripcion_origen_id: adscripcionOrigenId,
        sin_adscripcion_formal_origen: adscripcionOrigenId === null,
        unidad_destino_id: unidadDestinoId,
        unidad_destino_nombre: unidadDestinoNombre,
        unidad_destino_cluesimb: unidadDestinoClues,
        area_destino_texto: areaDestinoTexto,
        fecha_inicio: formatDateOnly(created.fecha_inicio) ?? fechaInicio,
        fecha_fin: formatDateOnly(created.fecha_fin),
        motivo,
        oficio_referencia: oficioReferencia,
        observaciones,
        activo: Boolean(created.activo),
        estado_vigencia: this.computeComisionEstadoVigencia(
          Boolean(created.activo),
          formatDateOnly(created.fecha_inicio) ?? fechaInicio,
          formatDateOnly(created.fecha_fin),
          todayIso
        ),
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async concluirComisionLaboral(
    access: RhAccessContext,
    personaId: number,
    comisionId: number,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<RhConcluirComisionResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para concluir comisiones laborales'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    if (!Number.isInteger(personaId) || personaId <= 0) {
      throw new RhHttpError(400, 'Identificador de persona inválido');
    }

    if (!Number.isInteger(comisionId) || comisionId <= 0) {
      throw new RhHttpError(400, 'Identificador de comisión inválido');
    }

    const hasOwn = (k: string): boolean => Object.prototype.hasOwnProperty.call(input, k);
    let requestedFechaFin: string | null = null;
    if (hasOwn('fecha_fin') && input.fecha_fin !== null && input.fecha_fin !== undefined) {
      requestedFechaFin = parseStrictIsoDate(input.fecha_fin, 'fecha_fin');
    }

    const requestedObservaciones = hasOwn('observaciones')
      ? normalizeOptionalVarchar(input.observaciones, 'observaciones', 2000)
      : undefined;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const comisionRes = await client.query<{
        id: number;
        persona_id: number;
        adscripcion_origen_id: number | null;
        unidad_destino_id: number | null;
        unidad_destino_nombre: string | null;
        unidad_destino_cluesimb: string | null;
        area_destino_texto: string | null;
        fecha_inicio: unknown;
        fecha_fin: unknown;
        motivo: string | null;
        oficio_referencia: string | null;
        observaciones: string | null;
        activo: boolean;
        current_date_iso: unknown;
      }>(
        `SELECT
           c.id, c.persona_id, c.adscripcion_origen_id, c.unidad_destino_id,
           um.nombre AS unidad_destino_nombre, um.cluesimb AS unidad_destino_cluesimb,
           c.area_destino_texto, c.fecha_inicio, c.fecha_fin, c.motivo,
           c.oficio_referencia, c.observaciones, c.activo,
           CURRENT_DATE::text AS current_date_iso
         FROM public.rh_comision_laboral c
         LEFT JOIN public.unidad_medica um
           ON um.id = c.unidad_destino_id
        WHERE c.id = $1
          AND c.persona_id = $2
          FOR UPDATE OF c`,
        [comisionId, personaId]
      );

      if (!comisionRes.rowCount) {
        throw new RhHttpError(404, 'Comisión laboral no encontrada para la persona especificada');
      }

      const current = comisionRes.rows[0];
      const currentInicio = formatDateOnly(current.fecha_inicio) ?? '';
      const currentFin = formatDateOnly(current.fecha_fin);
      const todayIso =
        formatDateOnly(current.current_date_iso) ?? new Date().toISOString().slice(0, 10);

      // Idempotencia: si ya está concluida (activo === false), no modificar ni duplicar auditoría
      if (!Boolean(current.activo)) {
        await client.query('COMMIT');
        return {
          comision: {
            id: Number(current.id),
            persona_id: Number(current.persona_id),
            adscripcion_origen_id:
              current.adscripcion_origen_id != null ? Number(current.adscripcion_origen_id) : null,
            sin_adscripcion_formal_origen: current.adscripcion_origen_id == null,
            unidad_destino_id:
              current.unidad_destino_id != null ? Number(current.unidad_destino_id) : null,
            unidad_destino_nombre:
              current.unidad_destino_nombre != null ? String(current.unidad_destino_nombre) : null,
            unidad_destino_cluesimb:
              current.unidad_destino_cluesimb != null
                ? String(current.unidad_destino_cluesimb)
                : null,
            area_destino_texto:
              current.area_destino_texto != null ? String(current.area_destino_texto) : null,
            fecha_inicio: currentInicio,
            fecha_fin: currentFin,
            motivo: current.motivo != null ? String(current.motivo) : null,
            oficio_referencia:
              current.oficio_referencia != null ? String(current.oficio_referencia) : null,
            observaciones: current.observaciones != null ? String(current.observaciones) : null,
            activo: false,
            estado_vigencia: 'CONCLUIDA',
          },
          idempotente: true,
        };
      }

      const finalFechaFin = requestedFechaFin ?? (currentFin ?? (todayIso >= currentInicio ? todayIso : currentInicio));
      if (finalFechaFin < currentInicio) {
        throw new RhHttpError(
          400,
          'La fecha de conclusión no puede ser anterior a "fecha_inicio"'
        );
      }

      const finalObservaciones =
        requestedObservaciones !== undefined
          ? requestedObservaciones
          : current.observaciones != null
            ? String(current.observaciones)
            : null;

      await client.query(
        `UPDATE public.rh_comision_laboral
            SET activo = FALSE,
                fecha_fin = $1,
                observaciones = $2,
                actualizado_por = $3,
                actualizado_en = NOW()
          WHERE id = $4
            AND persona_id = $5`,
        [finalFechaFin, finalObservaciones, rawUserId, comisionId, personaId]
      );

      const auditPayload = {
        comision_id: comisionId,
        persona_id: personaId,
        fecha_inicio: currentInicio,
        fecha_fin_anterior: currentFin,
        fecha_fin_nueva: finalFechaFin,
      };

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_CONCLUIR_COMISION',
          `rh_comision_laboral:${comisionId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      return {
        comision: {
          id: Number(current.id),
          persona_id: Number(current.persona_id),
          adscripcion_origen_id:
            current.adscripcion_origen_id != null ? Number(current.adscripcion_origen_id) : null,
          sin_adscripcion_formal_origen: current.adscripcion_origen_id == null,
          unidad_destino_id:
            current.unidad_destino_id != null ? Number(current.unidad_destino_id) : null,
          unidad_destino_nombre:
            current.unidad_destino_nombre != null ? String(current.unidad_destino_nombre) : null,
          unidad_destino_cluesimb:
            current.unidad_destino_cluesimb != null ? String(current.unidad_destino_cluesimb) : null,
          area_destino_texto:
            current.area_destino_texto != null ? String(current.area_destino_texto) : null,
          fecha_inicio: currentInicio,
          fecha_fin: finalFechaFin,
          motivo: current.motivo != null ? String(current.motivo) : null,
          oficio_referencia:
            current.oficio_referencia != null ? String(current.oficio_referencia) : null,
          observaciones: finalObservaciones,
          activo: false,
          estado_vigencia: 'CONCLUIDA',
        },
        idempotente: false,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async listVacacionesPorPersona(
    access: RhAccessContext,
    personaId: number,
    opts: {
      anioCiclo?: number;
      estado?: 'todos' | 'registrados' | 'anulados';
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<RhVacacionesListResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar vacaciones'
      );
    }

    if (!Number.isInteger(personaId) || personaId <= 0) {
      throw new RhHttpError(400, 'Identificador de persona inválido');
    }

    const personaCheck = await pool.query<{ id: number }>(
      `SELECT id FROM public.persona WHERE id = $1 LIMIT 1`,
      [personaId]
    );
    if (!personaCheck.rowCount) {
      throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
    }

    const rawPageSize = Number(opts.pageSize ?? 20);
    const rawPage = Number(opts.page ?? 1);
    const pageSize = Math.min(Math.max(Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 20, 1), 100);
    const page = Math.max(Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1, 1);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['v.persona_id = $1'];
    const params: unknown[] = [personaId];

    if (opts.anioCiclo !== undefined) {
      params.push(opts.anioCiclo);
      conditions.push(`v.anio_ciclo = $${params.length}`);
    }

    const estado = opts.estado ?? 'todos';
    if (estado === 'registrados') {
      conditions.push(`v.estado = 'REGISTRADO'`);
    } else if (estado === 'anulados') {
      conditions.push(`v.estado = 'ANULADO'`);
    }

    params.push(pageSize);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const sql = `
      SELECT
        v.id,
        v.persona_id,
        v.adscripcion_id,
        v.anio_ciclo,
        v.periodo_referencia,
        v.fecha_inicio,
        v.fecha_fin,
        v.dias_registrados,
        v.documento_referencia,
        v.observaciones,
        v.estado,
        v.motivo_anulacion,
        v.anulado_en,
        v.creado_en,
        v.actualizado_en,
        COUNT(*) OVER() AS total
      FROM public.rh_vacacion_registro v
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        v.anio_ciclo DESC,
        v.fecha_inicio DESC,
        v.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const { rows } = await pool.query(sql, params);
    const total = rows.length > 0 ? Number(rows[0].total) : 0;

    const items: RhVacacionRegistroDto[] = rows.map((r: any) => ({
      id: Number(r.id),
      persona_id: Number(r.persona_id),
      adscripcion_id: r.adscripcion_id != null ? Number(r.adscripcion_id) : null,
      anio_ciclo: Number(r.anio_ciclo),
      periodo_referencia: String(r.periodo_referencia),
      fecha_inicio: formatDateOnly(r.fecha_inicio) ?? '',
      fecha_fin: formatDateOnly(r.fecha_fin) ?? '',
      dias_registrados: Number(r.dias_registrados),
      documento_referencia: r.documento_referencia != null ? String(r.documento_referencia) : null,
      observaciones: r.observaciones != null ? String(r.observaciones) : null,
      estado: String(r.estado) === 'ANULADO' ? 'ANULADO' : 'REGISTRADO',
      motivo_anulacion: r.motivo_anulacion != null ? String(r.motivo_anulacion) : null,
      anulado_en: r.anulado_en != null ? new Date(r.anulado_en).toISOString() : null,
      creado_en: r.creado_en != null ? new Date(r.creado_en).toISOString() : '',
      actualizado_en: r.actualizado_en != null ? new Date(r.actualizado_en).toISOString() : '',
    }));

    return {
      persona_id: personaId,
      items,
      page,
      pageSize,
      total,
    };
  }

  async createVacacionRegistro(
    access: RhAccessContext,
    personaId: number,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<RhCreateVacacionResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para registrar vacaciones'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    if (!Number.isInteger(personaId) || personaId <= 0) {
      throw new RhHttpError(400, 'Identificador de persona inválido');
    }

    const hasOwn = (k: string): boolean => Object.prototype.hasOwnProperty.call(input, k);

    if (hasOwn('fechas') || hasOwn('periodo_id')) {
      return this.createVacacionRegistroFechasDetalladas(access, personaId, input, auditMeta);
    }

    let adscripcionId: number | null = null;
    if (hasOwn('adscripcion_id') && input.adscripcion_id !== null && input.adscripcion_id !== undefined) {
      if (
        typeof input.adscripcion_id !== 'number' ||
        !Number.isSafeInteger(input.adscripcion_id) ||
        input.adscripcion_id <= 0
      ) {
        throw new RhHttpError(400, 'El campo "adscripcion_id" debe ser un entero positivo o null');
      }
      adscripcionId = input.adscripcion_id;
    }

    if (
      typeof input.anio_ciclo !== 'number' ||
      !Number.isInteger(input.anio_ciclo) ||
      input.anio_ciclo < 1990 ||
      input.anio_ciclo > 2100
    ) {
      throw new RhHttpError(400, 'El campo "anio_ciclo" debe ser un año entero válido (1990-2100)');
    }
    const anioCiclo = input.anio_ciclo;

    const periodoReferencia = normalizeOptionalVarchar(
      input.periodo_referencia,
      'periodo_referencia',
      80
    );
    if (!periodoReferencia) {
      throw new RhHttpError(400, 'El campo "periodo_referencia" es obligatorio');
    }

    const fechaInicio = parseStrictIsoDate(input.fecha_inicio, 'fecha_inicio');
    const fechaFin = parseStrictIsoDate(input.fecha_fin, 'fecha_fin');
    if (fechaFin < fechaInicio) {
      throw new RhHttpError(400, 'La fecha "fecha_fin" no puede ser anterior a "fecha_inicio"');
    }

    if (
      typeof input.dias_registrados !== 'number' ||
      !Number.isInteger(input.dias_registrados) ||
      input.dias_registrados < 1 ||
      input.dias_registrados > 366
    ) {
      throw new RhHttpError(
        400,
        'El campo "dias_registrados" debe ser un número entero entre 1 y 366'
      );
    }
    const diasRegistrados = input.dias_registrados;

    const documentoReferencia = hasOwn('documento_referencia')
      ? normalizeOptionalVarchar(input.documento_referencia, 'documento_referencia', 120)
      : null;
    const observaciones = hasOwn('observaciones')
      ? normalizeOptionalVarchar(input.observaciones, 'observaciones', 2000)
      : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const personaRes = await client.query<{ id: number; activo: boolean }>(
        `SELECT id, activo FROM public.persona WHERE id = $1 FOR UPDATE`,
        [personaId]
      );
      if (!personaRes.rowCount) {
        throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
      }
      if (personaRes.rows[0].activo !== true) {
        throw new RhHttpError(
          409,
          'No se puede registrar un periodo vacacional para una persona inactiva en el padrón'
        );
      }

      if (adscripcionId !== null) {
        const adsRes = await client.query<{ id: number; persona_id: number }>(
          `SELECT id, persona_id FROM public.rh_adscripcion_laboral WHERE id = $1 LIMIT 1`,
          [adscripcionId]
        );
        if (!adsRes.rowCount) {
          throw new RhHttpError(404, 'La adscripción laboral especificada no existe');
        }
        if (Number(adsRes.rows[0].persona_id) !== personaId) {
          throw new RhHttpError(
            409,
            'La adscripción laboral especificada pertenece a otra persona'
          );
        }
      }

      // Verificar duplicado exacto activo y detectar posibles superposiciones (informativas para RH)
      const existingRes = await client.query<{
        id: number;
        anio_ciclo: number;
        fecha_inicio: unknown;
        fecha_fin: unknown;
      }>(
        `SELECT id, anio_ciclo, fecha_inicio, fecha_fin
           FROM public.rh_vacacion_registro
          WHERE persona_id = $1
            AND estado = 'REGISTRADO'
          ORDER BY id ASC`,
        [personaId]
      );

      const overlappingIds: number[] = [];
      for (const ex of existingRes.rows) {
        const exInicio = formatDateOnly(ex.fecha_inicio) ?? '';
        const exFin = formatDateOnly(ex.fecha_fin) ?? '';
        if (
          Number(ex.anio_ciclo) === anioCiclo &&
          exInicio === fechaInicio &&
          exFin === fechaFin
        ) {
          throw new RhHttpError(
            409,
            'Ya existe un registro vacacional activo idéntico para esa persona, ciclo y fechas'
          );
        }
        if (dateRangesOverlap(fechaInicio, fechaFin, exInicio, exFin)) {
          overlappingIds.push(Number(ex.id));
        }
      }

      const insertRes = await client.query<any>(
        `INSERT INTO public.rh_vacacion_registro (
           persona_id,
           adscripcion_id,
           anio_ciclo,
           periodo_referencia,
           fecha_inicio,
           fecha_fin,
           dias_registrados,
           documento_referencia,
           observaciones,
           estado,
           creado_por,
           actualizado_por
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'REGISTRADO', $10, $10)
         RETURNING
           id, persona_id, adscripcion_id, anio_ciclo, periodo_referencia,
           fecha_inicio, fecha_fin, dias_registrados, documento_referencia,
           observaciones, estado, motivo_anulacion, anulado_en, creado_en, actualizado_en`,
        [
          personaId,
          adscripcionId,
          anioCiclo,
          periodoReferencia,
          fechaInicio,
          fechaFin,
          diasRegistrados,
          documentoReferencia,
          observaciones,
          rawUserId,
        ]
      );

      const created = insertRes.rows[0];
      const registroId = Number(created.id);

      const auditPayload = {
        registro_id: registroId,
        persona_id: personaId,
        adscripcion_id: adscripcionId,
        anio_ciclo: anioCiclo,
        periodo_referencia: periodoReferencia,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        dias_registrados: diasRegistrados,
        documento_referencia: documentoReferencia,
        tiene_superposicion: overlappingIds.length > 0,
      };

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_CREATE_VACACION_REGISTRO',
          `rh_vacacion_registro:${registroId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      return {
        registro: {
          id: registroId,
          persona_id: personaId,
          adscripcion_id: adscripcionId,
          anio_ciclo: anioCiclo,
          periodo_referencia: periodoReferencia,
          fecha_inicio: formatDateOnly(created.fecha_inicio) ?? fechaInicio,
          fecha_fin: formatDateOnly(created.fecha_fin) ?? fechaFin,
          dias_registrados: diasRegistrados,
          documento_referencia: documentoReferencia,
          observaciones,
          estado: 'REGISTRADO',
          motivo_anulacion: null,
          anulado_en: null,
          creado_en: created.creado_en != null ? new Date(created.creado_en).toISOString() : '',
          actualizado_en:
            created.actualizado_en != null ? new Date(created.actualizado_en).toISOString() : '',
        },
        tiene_superposicion: overlappingIds.length > 0,
        registros_superpuestos_ids: overlappingIds,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async anularVacacionRegistro(
    access: RhAccessContext,
    personaId: number,
    registroId: number,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<RhAnularVacacionResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para anular registros vacacionales'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    if (!Number.isInteger(personaId) || personaId <= 0) {
      throw new RhHttpError(400, 'Identificador de persona inválido');
    }

    if (!Number.isInteger(registroId) || registroId <= 0) {
      throw new RhHttpError(400, 'Identificador de registro vacacional inválido');
    }

    const motivoAnulacion = normalizeOptionalVarchar(
      input.motivo_anulacion,
      'motivo_anulacion',
      300
    );
    if (!motivoAnulacion) {
      throw new RhHttpError(400, 'El campo "motivo_anulacion" es obligatorio');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const regRes = await client.query<any>(
        `SELECT
           id, persona_id, adscripcion_id, anio_ciclo, periodo_referencia,
           fecha_inicio, fecha_fin, dias_registrados, documento_referencia,
           observaciones, estado, motivo_anulacion, anulado_en, creado_en, actualizado_en,
           periodo_id, modo_registro
         FROM public.rh_vacacion_registro
        WHERE id = $1
          AND persona_id = $2
          FOR UPDATE`,
        [registroId, personaId]
      );

      if (!regRes.rowCount) {
        throw new RhHttpError(404, 'Registro vacacional no encontrado para la persona especificada');
      }

      const current = regRes.rows[0];
      if (String(current.estado) === 'ANULADO') {
        await client.query('COMMIT');
        return {
          registro: {
            id: Number(current.id),
            persona_id: Number(current.persona_id),
            adscripcion_id: current.adscripcion_id != null ? Number(current.adscripcion_id) : null,
            anio_ciclo: Number(current.anio_ciclo),
            periodo_referencia: String(current.periodo_referencia),
            fecha_inicio: formatDateOnly(current.fecha_inicio) ?? '',
            fecha_fin: formatDateOnly(current.fecha_fin) ?? '',
            dias_registrados: Number(current.dias_registrados),
            documento_referencia:
              current.documento_referencia != null ? String(current.documento_referencia) : null,
            observaciones: current.observaciones != null ? String(current.observaciones) : null,
            estado: 'ANULADO',
            motivo_anulacion:
              current.motivo_anulacion != null ? String(current.motivo_anulacion) : null,
            anulado_en: current.anulado_en != null ? new Date(current.anulado_en).toISOString() : null,
            creado_en: current.creado_en != null ? new Date(current.creado_en).toISOString() : '',
            actualizado_en:
              current.actualizado_en != null ? new Date(current.actualizado_en).toISOString() : '',
          },
          idempotente: true,
        };
      }

      const updateRes = await client.query<any>(
        `UPDATE public.rh_vacacion_registro
            SET estado = 'ANULADO',
                motivo_anulacion = $1,
                anulado_por = $2,
                anulado_en = NOW(),
                actualizado_por = $2,
                actualizado_en = NOW()
          WHERE id = $3
            AND persona_id = $4
          RETURNING anulado_en, actualizado_en`,
        [motivoAnulacion, rawUserId, registroId, personaId]
      );

      if (String(current.modo_registro ?? '') === 'FECHAS_DETALLADAS') {
        await client.query(
          `UPDATE public.rh_vacacion_registro_fecha
              SET activo = FALSE
            WHERE registro_id = $1
              AND persona_id = $2
              AND activo = TRUE`,
          [registroId, personaId]
        );
      }

      const updatedMeta = updateRes.rows[0] ?? {};
      const auditPayload = {
        registro_id: registroId,
        persona_id: personaId,
        anio_ciclo: Number(current.anio_ciclo),
        fecha_inicio: formatDateOnly(current.fecha_inicio) ?? '',
        fecha_fin: formatDateOnly(current.fecha_fin) ?? '',
        motivo_anulacion: motivoAnulacion,
      };

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_ANULAR_VACACION_REGISTRO',
          `rh_vacacion_registro:${registroId}`,
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify(auditPayload),
        ]
      );

      await client.query('COMMIT');

      return {
        registro: {
          id: Number(current.id),
          persona_id: Number(current.persona_id),
          adscripcion_id: current.adscripcion_id != null ? Number(current.adscripcion_id) : null,
          anio_ciclo: Number(current.anio_ciclo),
          periodo_referencia: String(current.periodo_referencia),
          fecha_inicio: formatDateOnly(current.fecha_inicio) ?? '',
          fecha_fin: formatDateOnly(current.fecha_fin) ?? '',
          dias_registrados: Number(current.dias_registrados),
          documento_referencia:
            current.documento_referencia != null ? String(current.documento_referencia) : null,
          observaciones: current.observaciones != null ? String(current.observaciones) : null,
          estado: 'ANULADO',
          motivo_anulacion: motivoAnulacion,
          anulado_en:
            updatedMeta.anulado_en != null
              ? new Date(updatedMeta.anulado_en).toISOString()
              : new Date().toISOString(),
          creado_en: current.creado_en != null ? new Date(current.creado_en).toISOString() : '',
          actualizado_en:
            updatedMeta.actualizado_en != null
              ? new Date(updatedMeta.actualizado_en).toISOString()
              : new Date().toISOString(),
        },
        idempotente: false,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async listAdscripcionesPorPersona(
    access: RhAccessContext,
    personaId: number,
    opts: {
      estado?: 'todas' | 'vigentes' | 'futuras' | 'historicas';
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<RhAdscripcionesPersonaListResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar las adscripciones laborales por trabajador'
      );
    }

    if (!Number.isInteger(personaId) || personaId <= 0) {
      throw new RhHttpError(400, 'Identificador de persona inválido');
    }

    const personaCheck = await pool.query<{ id: number }>(
      `SELECT id FROM public.persona WHERE id = $1 LIMIT 1`,
      [personaId]
    );
    if (!personaCheck.rowCount) {
      throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
    }

    const rawPageSize = Number(opts.pageSize ?? 20);
    const rawPage = Number(opts.page ?? 1);
    const pageSize = Math.min(Math.max(Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 20, 1), 100);
    const page = Math.max(Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1, 1);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['al.persona_id = $1'];
    const estado = opts.estado ?? 'todas';
    if (estado === 'vigentes') {
      conditions.push(
        'al.activo = TRUE AND al.vigente_desde <= CURRENT_DATE AND (al.vigente_hasta IS NULL OR al.vigente_hasta >= CURRENT_DATE)'
      );
    } else if (estado === 'futuras') {
      conditions.push('al.activo = TRUE AND al.vigente_desde > CURRENT_DATE');
    } else if (estado === 'historicas') {
      conditions.push('(al.activo = FALSE OR (al.vigente_hasta IS NOT NULL AND al.vigente_hasta < CURRENT_DATE))');
    }

    const sql = `
      SELECT
        al.id AS adscripcion_laboral_id,
        al.persona_id,
        al.unidad_medica_id,
        um.nombre AS unidad_nombre,
        um.cluesimb AS unidad_cluesimb,
        al.matricula,
        al.puesto,
        al.turno,
        al.jornada,
        al.horario,
        al.vigente_desde,
        al.vigente_hasta,
        al.activo,
        al.observaciones,
        CURRENT_DATE::text AS current_date_iso,
        COUNT(*) OVER() AS total
      FROM public.rh_adscripcion_laboral al
      LEFT JOIN public.unidad_medica um
        ON um.id = al.unidad_medica_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        al.activo DESC,
        al.vigente_desde DESC,
        al.id DESC
      LIMIT $2 OFFSET $3
    `;

    const { rows } = await pool.query(sql, [personaId, pageSize, offset]);
    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const fallbackToday = new Date().toISOString().slice(0, 10);

    const items: RhAdscripcionPersonaDto[] = rows.map((r: any) => {
      const desde = formatDateOnly(r.vigente_desde) ?? '';
      const hasta = formatDateOnly(r.vigente_hasta);
      const today = formatDateOnly(r.current_date_iso) ?? fallbackToday;
      const activo = Boolean(r.activo);

      let estadoVigencia: RhAdscripcionPersonaEstadoVigencia = 'VIGENTE';
      if (!activo || (hasta !== null && hasta < today)) {
        estadoVigencia = 'HISTORICA';
      } else if (desde > today) {
        estadoVigencia = 'FUTURA';
      }

      return {
        adscripcion_laboral_id: Number(r.adscripcion_laboral_id),
        persona_id: Number(r.persona_id),
        unidad_medica_id: Number(r.unidad_medica_id),
        unidad_nombre: r.unidad_nombre != null ? String(r.unidad_nombre) : null,
        unidad_cluesimb: r.unidad_cluesimb != null ? String(r.unidad_cluesimb) : null,
        matricula: r.matricula != null ? String(r.matricula) : null,
        puesto: r.puesto != null ? String(r.puesto) : null,
        turno: r.turno != null ? String(r.turno) : null,
        jornada: r.jornada != null ? String(r.jornada) : null,
        horario: r.horario != null ? String(r.horario) : null,
        vigente_desde: desde,
        vigente_hasta: hasta,
        activo,
        estado_vigencia: estadoVigencia,
        observaciones: r.observaciones != null ? String(r.observaciones) : null,
      };
    });

    return {
      persona_id: personaId,
      items,
      page,
      pageSize,
      total,
    };
  }

  private parseLoteAdscripcionesInput(rawBody: Record<string, unknown>): {
    unidadItems: Array<{
      persona_id: number;
      vigente_desde: string | null;
      vigente_hasta: string | null;
      matricula: string | null;
      puesto: string | null;
      turno: string | null;
      jornada: string | null;
      horario: string | null;
      observaciones: string | null;
      validationError: string | null;
    }>;
  } {
    const ALLOWED_DEFAULT_KEYS = new Set([
      'vigente_desde',
      'vigente_hasta',
      'matricula',
      'puesto',
      'turno',
      'jornada',
      'horario',
      'observaciones',
    ]);
    const ALLOWED_ITEM_KEYS = new Set(['persona_id', ...ALLOWED_DEFAULT_KEYS]);

    const defaultsRaw =
      rawBody.defaults !== undefined && rawBody.defaults !== null ? rawBody.defaults : {};
    if (typeof defaultsRaw !== 'object' || Array.isArray(defaultsRaw)) {
      throw new RhHttpError(400, 'La propiedad "defaults" debe ser un objeto válido');
    }
    const defaultsObj = defaultsRaw as Record<string, unknown>;
    for (const k of Object.keys(defaultsObj)) {
      if (!ALLOWED_DEFAULT_KEYS.has(k)) {
        throw new RhHttpError(400, `Propiedad no permitida en defaults: ${k}`);
      }
    }

    if (!Array.isArray(rawBody.items) || rawBody.items.length === 0) {
      throw new RhHttpError(400, 'El lote debe incluir al menos un trabajador en "items"');
    }
    if (rawBody.items.length > 100) {
      throw new RhHttpError(400, 'El lote no puede exceder 100 trabajadores por solicitud');
    }

    const seenIds = new Set<number>();
    const parsedItems: Array<{
      persona_id: number;
      vigente_desde: string | null;
      vigente_hasta: string | null;
      matricula: string | null;
      puesto: string | null;
      turno: string | null;
      jornada: string | null;
      horario: string | null;
      observaciones: string | null;
      validationError: string | null;
    }> = [];

    const hasOwn = (obj: Record<string, unknown>, k: string): boolean =>
      Object.prototype.hasOwnProperty.call(obj, k);

    for (let idx = 0; idx < rawBody.items.length; idx++) {
      const entry = rawBody.items[idx];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new RhHttpError(400, `Elemento inválido en items[${idx}]`);
      }
      const itemObj = entry as Record<string, unknown>;
      for (const k of Object.keys(itemObj)) {
        if (!ALLOWED_ITEM_KEYS.has(k)) {
          throw new RhHttpError(400, `Propiedad no permitida en items[${idx}]: ${k}`);
        }
      }

      const rawPid = itemObj.persona_id;
      if (typeof rawPid !== 'number' || !Number.isSafeInteger(rawPid) || rawPid <= 0) {
        throw new RhHttpError(400, `Identificador persona_id inválido en items[${idx}]`);
      }
      if (seenIds.has(rawPid)) {
        throw new RhHttpError(400, `Identificador persona_id duplicado en el lote: ${rawPid}`);
      }
      seenIds.add(rawPid);

      const pick = (k: string): unknown => (hasOwn(itemObj, k) ? itemObj[k] : defaultsObj[k]);

      let validationError: string | null = null;
      let vigenteDesde: string | null = null;
      let vigenteHasta: string | null = null;
      let matricula: string | null = null;
      let puesto: string | null = null;
      let turno: string | null = null;
      let jornada: string | null = null;
      let horario: string | null = null;
      let observaciones: string | null = null;

      try {
        vigenteDesde = parseStrictIsoDate(pick('vigente_desde'), 'vigente_desde');
        const rawHasta = pick('vigente_hasta');
        if (rawHasta !== null && rawHasta !== undefined && String(rawHasta).trim() !== '') {
          vigenteHasta = parseStrictIsoDate(rawHasta, 'vigente_hasta');
          if (vigenteHasta < vigenteDesde) {
            throw new RhHttpError(400, 'La fecha "vigente_hasta" no puede ser anterior a "vigente_desde"');
          }
        }
        matricula = normalizeOptionalVarchar(pick('matricula'), 'matricula', 64);
        puesto = normalizeOptionalVarchar(pick('puesto'), 'puesto', 160);
        turno = normalizeOptionalVarchar(pick('turno'), 'turno', 60);
        jornada = normalizeOptionalVarchar(pick('jornada'), 'jornada', 80);
        horario = normalizeOptionalVarchar(pick('horario'), 'horario', 120);
        observaciones = normalizeOptionalVarchar(pick('observaciones'), 'observaciones', 2000);
      } catch (err) {
        validationError = err instanceof RhHttpError ? err.message : 'Datos laborales inválidos';
      }

      parsedItems.push({
        persona_id: rawPid,
        vigente_desde: vigenteDesde,
        vigente_hasta: vigenteHasta,
        matricula,
        puesto,
        turno,
        jornada,
        horario,
        observaciones,
        validationError,
      });
    }

    return { unidadItems: parsedItems };
  }

  async validarLoteAdscripcionesPorUnidad(
    access: RhAccessContext,
    unidadId: number,
    rawBody: Record<string, unknown>
  ): Promise<RhLoteAdscripcionValidarResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para validar lotes de vinculación laboral'
      );
    }

    const { unidadItems } = this.parseLoteAdscripcionesInput(rawBody);

    const umRes = await pool.query<{ id: number; nombre: string; cluesimb: string | null }>(
      `SELECT id, nombre, cluesimb FROM public.unidad_medica WHERE id = $1 AND activo = TRUE LIMIT 1`,
      [unidadId]
    );
    if (!umRes.rowCount) {
      throw new RhHttpError(404, 'Unidad de trabajo no encontrada o inactiva');
    }

    const personaIds = unidadItems.map((i) => i.persona_id);

    const personasRes = await pool.query<{ id: number; activo: boolean }>(
      `SELECT id, activo FROM public.persona WHERE id = ANY($1::int[])`,
      [personaIds]
    );
    const personaMap = new Map<number, { id: number; activo: boolean }>();
    for (const row of personasRes.rows) {
      personaMap.set(Number(row.id), { id: Number(row.id), activo: Boolean(row.activo) });
    }

    const adsRes = await pool.query<{
      persona_id: number;
      unidad_medica_id: number;
      activo: boolean;
      vigente_desde: unknown;
      vigente_hasta: unknown;
      current_date_iso: unknown;
    }>(
      `SELECT persona_id, unidad_medica_id, activo, vigente_desde, vigente_hasta,
              CURRENT_DATE::text AS current_date_iso
         FROM public.rh_adscripcion_laboral
        WHERE persona_id = ANY($1::int[])
          AND activo = TRUE`,
      [personaIds]
    );

    const activeSameUnit = new Set<number>();
    const vigenteOtherUnit = new Set<number>();
    const fallbackToday = new Date().toISOString().slice(0, 10);

    for (const a of adsRes.rows) {
      const pid = Number(a.persona_id);
      const umId = Number(a.unidad_medica_id);
      const today = formatDateOnly(a.current_date_iso) ?? fallbackToday;
      const desde = formatDateOnly(a.vigente_desde) ?? '';
      const hasta = formatDateOnly(a.vigente_hasta);
      if (umId === unidadId) {
        activeSameUnit.add(pid);
      } else if (desde <= today && (hasta === null || hasta >= today)) {
        vigenteOtherUnit.add(pid);
      }
    }

    const resultados: RhLoteValidacionItemDto[] = [];
    let elegibles = 0;
    let yaVinculadas = 0;
    let inactivas = 0;
    let conflictos = 0;
    let invalidos = 0;

    for (const item of unidadItems) {
      const p = personaMap.get(item.persona_id);
      if (!p) {
        invalidos++;
        resultados.push({
          persona_id: item.persona_id,
          estado: 'DATOS_INVALIDOS',
          detalle: 'Persona no encontrada en el directorio institucional',
        });
        continue;
      }
      if (!p.activo) {
        inactivas++;
        resultados.push({
          persona_id: item.persona_id,
          estado: 'PERSONA_INACTIVA',
          detalle: 'La persona se encuentra inactiva en el padrón institucional',
        });
        continue;
      }
      if (item.validationError) {
        invalidos++;
        resultados.push({
          persona_id: item.persona_id,
          estado: 'DATOS_INVALIDOS',
          detalle: item.validationError,
        });
        continue;
      }
      if (activeSameUnit.has(item.persona_id)) {
        yaVinculadas++;
        resultados.push({
          persona_id: item.persona_id,
          estado: 'YA_VINCULADA',
          detalle: 'La persona ya cuenta con una adscripción activa en esta unidad',
        });
        continue;
      }
      if (vigenteOtherUnit.has(item.persona_id)) {
        conflictos++;
        resultados.push({
          persona_id: item.persona_id,
          estado: 'CONFLICTO_ADSCRIPCION',
          detalle: 'La persona tiene una adscripción vigente en otra unidad',
        });
        continue;
      }
      elegibles++;
      resultados.push({
        persona_id: item.persona_id,
        estado: 'ELEGIBLE',
        detalle: null,
      });
    }

    return {
      unidad_id: unidadId,
      total_solicitados: unidadItems.length,
      elegibles,
      ya_vinculadas: yaVinculadas,
      personas_inactivas: inactivas,
      conflictos_adscripcion: conflictos,
      datos_invalidos: invalidos,
      resultados,
    };
  }

  async createLoteAdscripcionesPorUnidad(
    access: RhAccessContext,
    unidadId: number,
    rawBody: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<RhLoteAdscripcionEjecucionResult> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para ejecutar vinculación múltiple laboral'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    const { unidadItems } = this.parseLoteAdscripcionesInput(rawBody);

    const umRes = await pool.query<{ id: number; nombre: string; cluesimb: string | null }>(
      `SELECT id, nombre, cluesimb FROM public.unidad_medica WHERE id = $1 AND activo = TRUE LIMIT 1`,
      [unidadId]
    );
    if (!umRes.rowCount) {
      throw new RhHttpError(404, 'Unidad de trabajo no encontrada o inactiva');
    }

    const loteId = crypto.randomUUID();
    // Ordenar por persona_id ASC para adquirir bloqueos en orden determinista y evitar deadlocks
    const orderedItems = [...unidadItems].sort((a, b) => a.persona_id - b.persona_id);

    const resultados: RhLoteEjecucionItemDto[] = [];
    let creadas = 0;
    let omitidas = 0;
    let errores = 0;

    for (const item of orderedItems) {
      if (item.validationError || !item.vigente_desde) {
        errores++;
        resultados.push({
          persona_id: item.persona_id,
          resultado: 'ERROR_VALIDACION',
          adscripcion_laboral_id: null,
          detalle: item.validationError || 'Datos laborales inválidos',
        });
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const pRes = await client.query<{ id: number; activo: boolean }>(
          `SELECT id, activo FROM public.persona WHERE id = $1 FOR UPDATE`,
          [item.persona_id]
        );
        if (!pRes.rowCount) {
          await client.query('ROLLBACK');
          errores++;
          resultados.push({
            persona_id: item.persona_id,
            resultado: 'ERROR_VALIDACION',
            adscripcion_laboral_id: null,
            detalle: 'Persona no encontrada en el directorio institucional',
          });
          continue;
        }
        if (pRes.rows[0].activo !== true) {
          await client.query('ROLLBACK');
          errores++;
          resultados.push({
            persona_id: item.persona_id,
            resultado: 'PERSONA_INACTIVA',
            adscripcion_laboral_id: null,
            detalle: 'No se puede vincular una persona inactiva en el padrón',
          });
          continue;
        }

        const dupRes = await client.query<{ id: number }>(
          `SELECT id
             FROM public.rh_adscripcion_laboral
            WHERE persona_id = $1
              AND unidad_medica_id = $2
              AND activo = TRUE
            LIMIT 1`,
          [item.persona_id, unidadId]
        );
        if (dupRes.rowCount) {
          await client.query('ROLLBACK');
          omitidas++;
          resultados.push({
            persona_id: item.persona_id,
            resultado: 'OMITIDA_DUPLICADO',
            adscripcion_laboral_id: Number(dupRes.rows[0].id),
            detalle: 'La persona ya tiene una adscripción activa en esta unidad',
          });
          continue;
        }

        const insertRes = await client.query<{ id: number }>(
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
             activo,
             observaciones
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
           RETURNING id`,
          [
            item.persona_id,
            unidadId,
            item.matricula,
            item.puesto,
            item.turno,
            item.jornada,
            item.horario,
            item.vigente_desde,
            item.vigente_hasta,
            item.observaciones,
          ]
        );

        const newAdscripcionId = Number(insertRes.rows[0].id);

        await client.query(
          `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            rawUserId,
            'RH_CREATE_ADSCRIPCION',
            `rh_adscripcion_laboral:${newAdscripcionId}`,
            auditMeta.ip ?? null,
            auditMeta.userAgent ?? null,
            JSON.stringify({
              lote_id: loteId,
              adscripcion_laboral_id: newAdscripcionId,
              persona_id: item.persona_id,
              unidad_medica_id: unidadId,
              vigente_desde: item.vigente_desde,
              vigente_hasta: item.vigente_hasta,
            }),
          ]
        );

        await client.query('COMMIT');
        creadas++;
        resultados.push({
          persona_id: item.persona_id,
          resultado: 'CREADA',
          adscripcion_laboral_id: newAdscripcionId,
          detalle: null,
        });
      } catch {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore rollback failure
        }
        errores++;
        resultados.push({
          persona_id: item.persona_id,
          resultado: 'ERROR_INTERNO',
          adscripcion_laboral_id: null,
          detalle: 'Error al registrar la adscripción laboral',
        });
      } finally {
        client.release();
      }
    }

    return {
      lote_id: loteId,
      unidad_id: unidadId,
      total_solicitados: orderedItems.length,
      creadas,
      omitidas,
      errores,
      resultados,
    };
  }

  // ===========================================================================
  // RH-VAC-02: Kardex vacacional institucional (periodos, bolsas, fechas discontinuas)
  // ===========================================================================

  async listVacacionPeriodos(
    access: RhAccessContext,
    filters: { anio?: number | null } = {}
  ): Promise<{ items: RhVacacionPeriodoDto[] }> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar periodos vacacionales'
      );
    }

    const params: unknown[] = [];
    let where = '';
    if (filters.anio != null) {
      params.push(filters.anio);
      where = `WHERE anio = $1`;
    }

    const res = await pool.query<any>(
      `SELECT id, anio, numero_periodo, clave, nombre, fecha_inicio, fecha_fin,
              dias_base_provisionales, activo, observaciones
         FROM public.rh_vacacion_periodo
         ${where}
        ORDER BY anio DESC, numero_periodo ASC`,
      params
    );

    return {
      items: res.rows.map((r) => ({
        id: Number(r.id),
        anio: Number(r.anio),
        numero_periodo: Number(r.numero_periodo) as 1 | 2,
        clave: String(r.clave),
        nombre: String(r.nombre),
        fecha_inicio: formatDateOnly(r.fecha_inicio) ?? '',
        fecha_fin: formatDateOnly(r.fecha_fin) ?? '',
        dias_base_provisionales: Number(r.dias_base_provisionales),
        activo: Boolean(r.activo),
        observaciones: r.observaciones != null ? String(r.observaciones) : null,
      })),
    };
  }

  async listVacacionBolsasPersona(
    access: RhAccessContext,
    personaId: number,
    filters: { anio?: number | null; periodoId?: number | null } = {}
  ): Promise<{ persona_id: number; items: RhVacacionBolsaItemDto[] }> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar bolsas vacacionales'
      );
    }

    const personaRes = await pool.query<{ id: number }>(
      `SELECT id FROM public.persona WHERE id = $1 LIMIT 1`,
      [personaId]
    );
    if (!personaRes.rowCount) {
      throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
    }

    const params: unknown[] = [personaId];
    const conds: string[] = [];
    if (filters.anio != null) {
      params.push(filters.anio);
      conds.push(`p.anio = $${params.length}`);
    }
    if (filters.periodoId != null) {
      params.push(filters.periodoId);
      conds.push(`p.id = $${params.length}`);
    }
    const whereClause = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';

    const res = await pool.query<any>(
      `SELECT
         p.id AS periodo_id,
         p.anio,
         p.numero_periodo,
         p.clave AS periodo_clave,
         p.nombre AS periodo_nombre,
         p.fecha_inicio AS periodo_fecha_inicio,
         p.fecha_fin AS periodo_fecha_fin,
         p.dias_base_provisionales,
         b.id AS bolsa_id,
         b.dias_asignados,
         b.estado_asignacion,
         b.justificacion_ajuste,
         b.calendario_laboral_codigo,
         b.actualizado_en
       FROM public.rh_vacacion_periodo p
       LEFT JOIN public.rh_vacacion_bolsa b
         ON b.periodo_id = p.id
        AND b.persona_id = $1
       ${whereClause}
       ORDER BY p.anio DESC, p.numero_periodo ASC`,
      params
    );

    return {
      persona_id: personaId,
      items: res.rows.map((r) => {
        const existe = r.bolsa_id != null;
        return {
          periodo_id: Number(r.periodo_id),
          anio: Number(r.anio),
          numero_periodo: Number(r.numero_periodo) as 1 | 2,
          periodo_clave: String(r.periodo_clave),
          periodo_nombre: String(r.periodo_nombre),
          periodo_fecha_inicio: formatDateOnly(r.periodo_fecha_inicio) ?? '',
          periodo_fecha_fin: formatDateOnly(r.periodo_fecha_fin) ?? '',
          dias_base_provisionales: Number(r.dias_base_provisionales),
          bolsa_id: existe ? Number(r.bolsa_id) : null,
          dias_asignados: existe ? Number(r.dias_asignados) : null,
          estado_asignacion: existe
            ? (String(r.estado_asignacion) as 'PROVISIONAL' | 'CONFIRMADA' | 'AJUSTADA')
            : 'INEXISTENTE',
          justificacion_ajuste: r.justificacion_ajuste != null ? String(r.justificacion_ajuste) : null,
          calendario_laboral_codigo:
            r.calendario_laboral_codigo != null ? String(r.calendario_laboral_codigo) : null,
          actualizado_en: r.actualizado_en != null ? new Date(r.actualizado_en).toISOString() : null,
        };
      }),
    };
  }

  async upsertVacacionBolsaPersona(
    access: RhAccessContext,
    personaId: number,
    periodoId: number,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<{ bolsa: RhVacacionBolsaItemDto }> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para administrar bolsas vacacionales'
      );
    }

    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    const rawDias = input.dias_asignados;
    if (typeof rawDias !== 'number' || !Number.isInteger(rawDias) || rawDias < 0 || rawDias > 60) {
      throw new RhHttpError(400, 'El campo "dias_asignados" debe ser un número entero entre 0 y 60');
    }

    const rawEstado = typeof input.estado_asignacion === 'string' ? input.estado_asignacion.trim().toUpperCase() : '';
    if (!['PROVISIONAL', 'CONFIRMADA', 'AJUSTADA'].includes(rawEstado)) {
      throw new RhHttpError(
        400,
        'El campo "estado_asignacion" debe ser PROVISIONAL, CONFIRMADA o AJUSTADA'
      );
    }

    const justificacion = normalizeOptionalVarchar(
      input.justificacion_ajuste,
      'justificacion_ajuste',
      1000
    );
    if (rawEstado === 'AJUSTADA' && !justificacion) {
      throw new RhHttpError(
        400,
        'El campo "justificacion_ajuste" es obligatorio cuando estado_asignacion es AJUSTADA'
      );
    }

    const calendarioCodigo = normalizeOptionalVarchar(
      input.calendario_laboral_codigo,
      'calendario_laboral_codigo',
      40
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const personaRes = await client.query<{ id: number }>(
        `SELECT id FROM public.persona WHERE id = $1 FOR UPDATE`,
        [personaId]
      );
      if (!personaRes.rowCount) {
        throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
      }

      const periodoRes = await client.query<any>(
        `SELECT id, anio, numero_periodo, clave, nombre, fecha_inicio, fecha_fin, dias_base_provisionales
           FROM public.rh_vacacion_periodo
          WHERE id = $1
          LIMIT 1`,
        [periodoId]
      );
      if (!periodoRes.rowCount) {
        throw new RhHttpError(404, 'Periodo vacacional institucional no encontrado');
      }
      const periodo = periodoRes.rows[0];

      const upsertRes = await client.query<any>(
        `INSERT INTO public.rh_vacacion_bolsa (
           persona_id, periodo_id, dias_asignados, estado_asignacion,
           justificacion_ajuste, calendario_laboral_codigo, creado_por, actualizado_por
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
         ON CONFLICT (persona_id, periodo_id)
         DO UPDATE SET
           dias_asignados = EXCLUDED.dias_asignados,
           estado_asignacion = EXCLUDED.estado_asignacion,
           justificacion_ajuste = EXCLUDED.justificacion_ajuste,
           calendario_laboral_codigo = EXCLUDED.calendario_laboral_codigo,
           actualizado_por = EXCLUDED.actualizado_por,
           actualizado_en = NOW()
         RETURNING id, dias_asignados, estado_asignacion, justificacion_ajuste, calendario_laboral_codigo, actualizado_en`,
        [personaId, periodoId, rawDias, rawEstado, justificacion, calendarioCodigo, rawUserId]
      );

      const saved = upsertRes.rows[0];

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_UPSERT_VACACION_BOLSA',
          'rh_vacacion_bolsa',
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify({
            bolsa_id: Number(saved.id),
            persona_id: personaId,
            periodo_id: periodoId,
            dias_asignados: Number(saved.dias_asignados),
            estado_asignacion: String(saved.estado_asignacion),
          }),
        ]
      );

      await client.query('COMMIT');

      return {
        bolsa: {
          periodo_id: Number(periodo.id),
          anio: Number(periodo.anio),
          numero_periodo: Number(periodo.numero_periodo) as 1 | 2,
          periodo_clave: String(periodo.clave),
          periodo_nombre: String(periodo.nombre),
          periodo_fecha_inicio: formatDateOnly(periodo.fecha_inicio) ?? '',
          periodo_fecha_fin: formatDateOnly(periodo.fecha_fin) ?? '',
          dias_base_provisionales: Number(periodo.dias_base_provisionales),
          bolsa_id: Number(saved.id),
          dias_asignados: Number(saved.dias_asignados),
          estado_asignacion: String(saved.estado_asignacion) as 'PROVISIONAL' | 'CONFIRMADA' | 'AJUSTADA',
          justificacion_ajuste: saved.justificacion_ajuste != null ? String(saved.justificacion_ajuste) : null,
          calendario_laboral_codigo:
            saved.calendario_laboral_codigo != null ? String(saved.calendario_laboral_codigo) : null,
          actualizado_en: saved.actualizado_en != null ? new Date(saved.actualizado_en).toISOString() : null,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async getVacacionKardexPersona(
    access: RhAccessContext,
    personaId: number,
    periodoId: number
  ): Promise<RhVacacionKardexResponse> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(
        403,
        'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar el kardex vacacional'
      );
    }

    const personaRes = await pool.query<{ id: number }>(
      `SELECT id FROM public.persona WHERE id = $1 LIMIT 1`,
      [personaId]
    );
    if (!personaRes.rowCount) {
      throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
    }

    const periodoRes = await pool.query<any>(
      `SELECT id, anio, numero_periodo, clave, nombre, fecha_inicio, fecha_fin,
              dias_base_provisionales, activo, observaciones
         FROM public.rh_vacacion_periodo
        WHERE id = $1
        LIMIT 1`,
      [periodoId]
    );
    if (!periodoRes.rowCount) {
      throw new RhHttpError(404, 'Periodo vacacional institucional no encontrado');
    }
    const per = periodoRes.rows[0];

    const bolsaRes = await pool.query<any>(
      `SELECT id, dias_asignados, estado_asignacion, justificacion_ajuste, calendario_laboral_codigo, actualizado_en
         FROM public.rh_vacacion_bolsa
        WHERE persona_id = $1
          AND periodo_id = $2
        LIMIT 1`,
      [personaId, periodoId]
    );
    const bolsaRow = bolsaRes.rows[0] ?? null;

    const movRes = await pool.query<any>(
      `SELECT id, persona_id, adscripcion_id, anio_ciclo, periodo_referencia,
              periodo_id, modo_registro, fecha_inicio, fecha_fin, dias_registrados,
              documento_referencia, observaciones, estado, motivo_anulacion,
              anulado_en, creado_en, actualizado_en
         FROM public.rh_vacacion_registro
        WHERE persona_id = $1
          AND periodo_id = $2
        ORDER BY fecha_inicio ASC, id ASC`,
      [personaId, periodoId]
    );

    const movIds = movRes.rows.map((r) => Number(r.id));
    const fechasByRegistro = new Map<number, RhVacacionFechaDto[]>();

    if (movIds.length > 0) {
      const fechasRes = await pool.query<any>(
        `SELECT id, registro_id, fecha, computable, motivo_exclusion, activo
           FROM public.rh_vacacion_registro_fecha
          WHERE registro_id = ANY($1::int[])
          ORDER BY fecha ASC, id ASC`,
        [movIds]
      );
      for (const f of fechasRes.rows) {
        const regId = Number(f.registro_id);
        const list = fechasByRegistro.get(regId) ?? [];
        list.push({
          id: Number(f.id),
          fecha: formatDateOnly(f.fecha) ?? '',
          computable: Boolean(f.computable),
          motivo_exclusion: f.motivo_exclusion != null ? String(f.motivo_exclusion) : null,
          activo: Boolean(f.activo),
        });
        fechasByRegistro.set(regId, list);
      }
    }

    let diasComputablesRegistrados = 0;
    const movimientos: RhVacacionKardexMovimientoDto[] = movRes.rows.map((r) => {
      const regId = Number(r.id);
      const estado = String(r.estado) as 'REGISTRADO' | 'ANULADO';
      const dias = Number(r.dias_registrados);
      if (estado === 'REGISTRADO') {
        diasComputablesRegistrados += dias;
      }
      return {
        id: regId,
        persona_id: Number(r.persona_id),
        adscripcion_id: r.adscripcion_id != null ? Number(r.adscripcion_id) : null,
        periodo_id: r.periodo_id != null ? Number(r.periodo_id) : null,
        modo_registro: (r.modo_registro ?? 'RANGO_HISTORICO') as 'RANGO_HISTORICO' | 'FECHAS_DETALLADAS',
        fecha_inicio: formatDateOnly(r.fecha_inicio) ?? '',
        fecha_fin: formatDateOnly(r.fecha_fin) ?? '',
        dias_registrados: dias,
        documento_referencia: r.documento_referencia != null ? String(r.documento_referencia) : null,
        observaciones: r.observaciones != null ? String(r.observaciones) : null,
        estado,
        motivo_anulacion: r.motivo_anulacion != null ? String(r.motivo_anulacion) : null,
        anulado_en: r.anulado_en != null ? new Date(r.anulado_en).toISOString() : null,
        creado_en: r.creado_en != null ? new Date(r.creado_en).toISOString() : '',
        actualizado_en: r.actualizado_en != null ? new Date(r.actualizado_en).toISOString() : '',
        fechas: fechasByRegistro.get(regId) ?? [],
      };
    });

    const diasAsignados = bolsaRow ? Number(bolsaRow.dias_asignados) : null;
    const estadoBolsa = bolsaRow
      ? (String(bolsaRow.estado_asignacion) as 'PROVISIONAL' | 'CONFIRMADA' | 'AJUSTADA')
      : 'INEXISTENTE';

    return {
      persona_id: personaId,
      periodo: {
        id: Number(per.id),
        anio: Number(per.anio),
        numero_periodo: Number(per.numero_periodo) as 1 | 2,
        clave: String(per.clave),
        nombre: String(per.nombre),
        fecha_inicio: formatDateOnly(per.fecha_inicio) ?? '',
        fecha_fin: formatDateOnly(per.fecha_fin) ?? '',
        dias_base_provisionales: Number(per.dias_base_provisionales),
        activo: Boolean(per.activo),
        observaciones: per.observaciones != null ? String(per.observaciones) : null,
      },
      resumen: {
        estado_bolsa: estadoBolsa,
        es_provisional: estadoBolsa === 'PROVISIONAL',
        dias_asignados: diasAsignados,
        dias_computables_registrados: diasComputablesRegistrados,
        saldo_administrativo: diasAsignados !== null ? diasAsignados - diasComputablesRegistrados : null,
        justificacion_ajuste: bolsaRow?.justificacion_ajuste != null ? String(bolsaRow.justificacion_ajuste) : null,
      },
      movimientos,
    };
  }

  private async createVacacionRegistroFechasDetalladas(
    access: RhAccessContext,
    personaId: number,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<RhCreateVacacionResult> {
    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';

    const rawPeriodoId = input.periodo_id;
    if (typeof rawPeriodoId !== 'number' || !Number.isInteger(rawPeriodoId) || rawPeriodoId <= 0) {
      throw new RhHttpError(400, 'El campo "periodo_id" es obligatorio y debe ser un entero positivo');
    }

    if (!Array.isArray(input.fechas) || input.fechas.length === 0) {
      throw new RhHttpError(400, 'El campo "fechas" debe ser un arreglo con al menos una fecha');
    }

    const parsedFechas: Array<{ fecha: string; computable: boolean; motivo_exclusion: string | null }> = [];
    const seenDates = new Set<string>();
    let computablesCount = 0;

    for (const rawItem of input.fechas) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
        throw new RhHttpError(400, 'Cada elemento de "fechas" debe ser un objeto válido');
      }
      const itemObj = rawItem as Record<string, unknown>;
      const fechaIso = parseStrictIsoDate(itemObj.fecha, 'fechas[].fecha');
      if (seenDates.has(fechaIso)) {
        throw new RhHttpError(400, `La fecha "${fechaIso}" está duplicada dentro del mismo movimiento`);
      }
      seenDates.add(fechaIso);

      const computable = itemObj.computable === undefined ? true : itemObj.computable;
      if (typeof computable !== 'boolean') {
        throw new RhHttpError(400, 'El campo "fechas[].computable" debe ser booleano');
      }

      const motivoExclusion = normalizeOptionalVarchar(
        itemObj.motivo_exclusion,
        'fechas[].motivo_exclusion',
        200
      );
      if (!computable && !motivoExclusion) {
        throw new RhHttpError(
          400,
          `La fecha excluida "${fechaIso}" requiere un "motivo_exclusion" obligatorio`
        );
      }
      if (computable) {
        computablesCount += 1;
      }
      parsedFechas.push({
        fecha: fechaIso,
        computable,
        motivo_exclusion: computable ? null : motivoExclusion,
      });
    }

    if (computablesCount <= 0) {
      throw new RhHttpError(
        400,
        'El movimiento debe incluir al menos una fecha computable (dias_registrados > 0)'
      );
    }

    parsedFechas.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const fechaInicio = parsedFechas[0].fecha;
    const fechaFin = parsedFechas[parsedFechas.length - 1].fecha;

    let adscripcionId: number | null = null;
    if (input.adscripcion_id !== undefined && input.adscripcion_id !== null) {
      if (typeof input.adscripcion_id !== 'number' || !Number.isInteger(input.adscripcion_id) || input.adscripcion_id <= 0) {
        throw new RhHttpError(400, 'El campo "adscripcion_id" debe ser un entero positivo o nulo');
      }
      adscripcionId = input.adscripcion_id;
    }

    const documentoReferencia = normalizeOptionalVarchar(
      input.documento_referencia,
      'documento_referencia',
      120
    );
    const observacionesBase = normalizeOptionalVarchar(input.observaciones, 'observaciones', 1500);

    const esExcepcion = input.es_excepcion_fuera_periodo === true;
    if (
      input.es_excepcion_fuera_periodo !== undefined &&
      typeof input.es_excepcion_fuera_periodo !== 'boolean'
    ) {
      throw new RhHttpError(400, 'El campo "es_excepcion_fuera_periodo" debe ser booleano');
    }

    const justificacionExcepcion = normalizeOptionalVarchar(
      input.justificacion_excepcion,
      'justificacion_excepcion',
      500
    );
    if (esExcepcion && !justificacionExcepcion) {
      throw new RhHttpError(
        400,
        'El campo "justificacion_excepcion" es obligatorio cuando se registran vacaciones fuera del periodo de origen'
      );
    }

    const observaciones = esExcepcion
      ? [observacionesBase, `[EXCEPCIÓN FUERA DE PERIODO]: ${justificacionExcepcion}`]
          .filter((s): s is string => Boolean(s))
          .join(' | ')
      : observacionesBase;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const personaRes = await client.query<{ id: number }>(
        `SELECT id FROM public.persona WHERE id = $1 FOR UPDATE`,
        [personaId]
      );
      if (!personaRes.rowCount) {
        throw new RhHttpError(404, 'Persona no encontrada en el directorio institucional');
      }

      if (adscripcionId !== null) {
        const adsRes = await client.query<{ id: number }>(
          `SELECT id FROM public.rh_adscripcion_laboral WHERE id = $1 AND persona_id = $2 LIMIT 1`,
          [adscripcionId, personaId]
        );
        if (!adsRes.rowCount) {
          throw new RhHttpError(400, 'La adscripción especificada no pertenece a la persona');
        }
      }

      const periodoRes = await client.query<any>(
        `SELECT id, anio, numero_periodo, clave, nombre, fecha_inicio, fecha_fin
           FROM public.rh_vacacion_periodo
          WHERE id = $1
          LIMIT 1`,
        [rawPeriodoId]
      );
      if (!periodoRes.rowCount) {
        throw new RhHttpError(404, 'Periodo vacacional institucional no encontrado');
      }
      const periodo = periodoRes.rows[0];
      const perInicio = formatDateOnly(periodo.fecha_inicio) ?? '';
      const perFin = formatDateOnly(periodo.fecha_fin) ?? '';

      for (const f of parsedFechas) {
        if (f.fecha < perInicio) {
          throw new RhHttpError(
            400,
            `La fecha "${f.fecha}" es anterior al inicio del periodo institucional ${periodo.clave} (${perInicio})`
          );
        }
        if (f.fecha > perFin && !esExcepcion) {
          throw new RhHttpError(
            400,
            `La fecha "${f.fecha}" está fuera del periodo institucional ${periodo.clave} (${perInicio} a ${perFin})`
          );
        }
      }

      const bolsaRes = await client.query<any>(
        `SELECT id, dias_asignados, estado_asignacion
           FROM public.rh_vacacion_bolsa
          WHERE persona_id = $1
            AND periodo_id = $2
          FOR UPDATE`,
        [personaId, rawPeriodoId]
      );
      if (!bolsaRes.rowCount) {
        throw new RhHttpError(
          409,
          'La persona no cuenta con una bolsa vacacional asignada para este periodo institucional'
        );
      }
      const bolsa = bolsaRes.rows[0];
      const diasAsignados = Number(bolsa.dias_asignados);

      const consumidosRes = await client.query<{ consumidos: string | number }>(
        `SELECT COALESCE(SUM(dias_registrados), 0)::int AS consumidos
           FROM public.rh_vacacion_registro
          WHERE persona_id = $1
            AND periodo_id = $2
            AND estado = 'REGISTRADO'`,
        [personaId, rawPeriodoId]
      );
      const diasConsumidos = Number(consumidosRes.rows[0]?.consumidos ?? 0);
      const saldoDisponible = diasAsignados - diasConsumidos;

      if (computablesCount > saldoDisponible) {
        throw new RhHttpError(
          409,
          `Saldo insuficiente en la bolsa del periodo ${periodo.clave}: disponibles ${saldoDisponible} día(s), solicitados ${computablesCount}`
        );
      }

      const computablesDates = parsedFechas.filter((f) => f.computable).map((f) => f.fecha);
      const dupRes = await client.query<{ fecha: unknown }>(
        `SELECT fecha
           FROM public.rh_vacacion_registro_fecha
          WHERE persona_id = $1
            AND activo = TRUE
            AND computable = TRUE
            AND fecha = ANY($2::date[])
          LIMIT 1`,
        [personaId, computablesDates]
      );
      if (dupRes.rowCount) {
        const dupDate = formatDateOnly(dupRes.rows[0].fecha) ?? '';
        throw new RhHttpError(
          409,
          `La fecha computable "${dupDate}" ya está registrada en otro movimiento activo para esta persona`
        );
      }

      const insertRegRes = await client.query<any>(
        `INSERT INTO public.rh_vacacion_registro (
           persona_id, adscripcion_id, anio_ciclo, periodo_referencia,
           periodo_id, modo_registro, fecha_inicio, fecha_fin,
           dias_registrados, documento_referencia, observaciones,
           estado, creado_por, actualizado_por
         )
         VALUES ($1, $2, $3, $4, $5, 'FECHAS_DETALLADAS', $6, $7, $8, $9, $10, 'REGISTRADO', $11, $11)
         RETURNING id, persona_id, adscripcion_id, anio_ciclo, periodo_referencia,
                   fecha_inicio, fecha_fin, dias_registrados, documento_referencia,
                   observaciones, estado, motivo_anulacion, anulado_en, creado_en, actualizado_en`,
        [
          personaId,
          adscripcionId,
          Number(periodo.anio),
          String(periodo.nombre),
          rawPeriodoId,
          fechaInicio,
          fechaFin,
          computablesCount,
          documentoReferencia,
          observaciones,
          rawUserId,
        ]
      );
      const createdRow = insertRegRes.rows[0];
      const registroId = Number(createdRow.id);

      for (const f of parsedFechas) {
        await client.query(
          `INSERT INTO public.rh_vacacion_registro_fecha (
             registro_id, persona_id, periodo_id, fecha, computable, motivo_exclusion, activo
           )
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
          [registroId, personaId, rawPeriodoId, f.fecha, f.computable, f.motivo_exclusion]
        );
      }

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_CREATE_VACACION_DETALLADA',
          'rh_vacacion_registro',
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify({
            registro_id: registroId,
            persona_id: personaId,
            periodo_id: rawPeriodoId,
            dias_computables: computablesCount,
            total_fechas: parsedFechas.length,
            es_excepcion_fuera_periodo: esExcepcion,
            justificacion_excepcion: esExcepcion ? justificacionExcepcion : null,
          }),
        ]
      );

      await client.query('COMMIT');

      return {
        registro: {
          id: registroId,
          persona_id: Number(createdRow.persona_id),
          adscripcion_id: createdRow.adscripcion_id != null ? Number(createdRow.adscripcion_id) : null,
          anio_ciclo: Number(createdRow.anio_ciclo),
          periodo_referencia: String(createdRow.periodo_referencia),
          fecha_inicio: formatDateOnly(createdRow.fecha_inicio) ?? fechaInicio,
          fecha_fin: formatDateOnly(createdRow.fecha_fin) ?? fechaFin,
          dias_registrados: Number(createdRow.dias_registrados),
          documento_referencia:
            createdRow.documento_referencia != null ? String(createdRow.documento_referencia) : null,
          observaciones: createdRow.observaciones != null ? String(createdRow.observaciones) : null,
          estado: 'REGISTRADO',
          motivo_anulacion: null,
          anulado_en: null,
          creado_en: createdRow.creado_en != null ? new Date(createdRow.creado_en).toISOString() : '',
          actualizado_en:
            createdRow.actualizado_en != null ? new Date(createdRow.actualizado_en).toISOString() : '',
        },
        tiene_superposicion: false,
        registros_superpuestos_ids: [],
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Consulta personal de solo lectura de vacaciones del empleado autenticado (`GET /api/rh/mi-vacaciones`).
   * Resuelve identidad canónicamente vía `app_users.id -> app_users.persona_id -> public.persona.id`
   * y reutiliza el cálculo de `getVacacionKardexPersona` sin duplicar lógica.
   */
  async getMisVacacionesEmpleado(
    rawUserId: unknown,
    requestedPeriodoId: number | null = null
  ): Promise<{
    periodos: RhVacacionPeriodoDto[];
    kardex: RhVacacionKardexResponse | null;
  }> {
    const userId = typeof rawUserId === 'string' ? rawUserId.trim() : '';
    if (!UUID_REGEX.test(userId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    const identityRes = await pool.query<{
      user_status: string;
      persona_id: number | null;
      persona_activo: boolean | null;
    }>(
      `SELECT
         u.status AS user_status,
         u.persona_id,
         p.activo AS persona_activo
       FROM public.app_users u
       LEFT JOIN public.persona p ON p.id = u.persona_id
       WHERE u.id = $1
       LIMIT 1`,
      [userId]
    );

    if (!identityRes.rowCount) {
      throw new RhHttpError(401, 'Unauthorized');
    }
    const row = identityRes.rows[0];
    if (String(row.user_status ?? '').trim().toUpperCase() !== 'ACTIVE') {
      throw new RhHttpError(403, 'Tu cuenta de usuario no se encuentra activa');
    }
    if (row.persona_id == null || row.persona_activo !== true) {
      throw new RhHttpError(
        403,
        'Tu cuenta no está vinculada a una persona institucional activa para consultar vacaciones'
      );
    }

    const personaId = Number(row.persona_id);
    const selfReadAccess: RhAccessContext = {
      grantedBy: 'RECURSOS_HUMANOS',
      scope: 'GLOBAL',
      clues: [],
    };

    const { items: periodos } = await this.listVacacionPeriodos(selfReadAccess);
    if (periodos.length === 0) {
      return { periodos: [], kardex: null };
    }

    const targetPeriodoId =
      requestedPeriodoId !== null
        ? requestedPeriodoId
        : periodos[0].id;

    const kardex = await this.getVacacionKardexPersona(selfReadAccess, personaId, targetPeriodoId);
    return { periodos, kardex };
  }

  // ===========================================================================
  // RH-ORG-04: Administración visual del organigrama institucional
  // ===========================================================================

  async listOrganigramaPuestos(access: RhAccessContext): Promise<{
    version: { id: number; clave: string; nombre: string; estado: string };
    items: RhOrgPuestoDto[];
  }> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(403, 'Solo RECURSOS_HUMANOS GLOBAL está autorizado para consultar el organigrama');
    }

    const verRes = await pool.query<any>(
      `SELECT id, clave, nombre, estado
         FROM public.rh_org_version
        WHERE clave = 'ORG-COORDINACION-ESTATAL'
          AND activo = TRUE
        LIMIT 1`
    );
    if (!verRes.rowCount) {
      throw new RhHttpError(404, 'La estructura organizacional ORG-COORDINACION-ESTATAL no se encuentra inicializada');
    }
    const ver = verRes.rows[0];

    const res = await pool.query<any>(
      `SELECT id, version_id, puesto_padre_id, denominacion, codigo_nivel,
              nivel_jerarquico, siglas_area, orden_visual, observaciones, activo
         FROM public.rh_org_puesto
        WHERE version_id = $1
        ORDER BY nivel_jerarquico ASC, orden_visual ASC, id ASC`,
      [ver.id]
    );

    return {
      version: {
        id: Number(ver.id),
        clave: String(ver.clave),
        nombre: String(ver.nombre),
        estado: String(ver.estado),
      },
      items: res.rows.map((r) => this.mapOrgPuestoRow(r)),
    };
  }

  async createOrganigramaPuesto(
    access: RhAccessContext,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<{ puesto: RhOrgPuestoDto }> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(403, 'Solo RECURSOS_HUMANOS GLOBAL está autorizado');
    }
    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    const denominacion = normalizeOptionalVarchar(input.denominacion, 'denominacion', 200);
    if (!denominacion) {
      throw new RhHttpError(400, 'El campo "denominacion" es obligatorio');
    }

    const rawPadreId = input.puesto_padre_id;
    if (typeof rawPadreId !== 'number' || !Number.isInteger(rawPadreId) || rawPadreId <= 0) {
      throw new RhHttpError(400, 'El campo "puesto_padre_id" es obligatorio y debe ser un entero positivo (solo existe una raíz)');
    }

    const codigoNivel = normalizeOptionalVarchar(input.codigo_nivel, 'codigo_nivel', 40);
    const siglasArea = normalizeOptionalVarchar(input.siglas_area, 'siglas_area', 30);
    const observaciones = normalizeOptionalVarchar(input.observaciones, 'observaciones', 1000);
    const ordenVisual =
      typeof input.orden_visual === 'number' && Number.isInteger(input.orden_visual) && input.orden_visual >= 0
        ? input.orden_visual
        : 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const verRes = await client.query<{ id: number }>(
        `SELECT id FROM public.rh_org_version WHERE clave = 'ORG-COORDINACION-ESTATAL' AND activo = TRUE LIMIT 1`
      );
      if (!verRes.rowCount) {
        throw new RhHttpError(404, 'Estructura ORG-COORDINACION-ESTATAL no encontrada');
      }
      const versionId = Number(verRes.rows[0].id);

      const padreRes = await client.query<{ id: number; nivel_jerarquico: number }>(
        `SELECT id, nivel_jerarquico FROM public.rh_org_puesto WHERE id = $1 AND version_id = $2 FOR UPDATE`,
        [rawPadreId, versionId]
      );
      if (!padreRes.rowCount) {
        throw new RhHttpError(404, 'El puesto padre especificado no existe en ORG-COORDINACION-ESTATAL');
      }
      const nivelHijo = Number(padreRes.rows[0].nivel_jerarquico) + 1;
      if (nivelHijo > 10) {
        throw new RhHttpError(400, 'Se excede el nivel jerárquico máximo permitido (10)');
      }

      const dupRes = await client.query<{ id: number }>(
        `SELECT id FROM public.rh_org_puesto
          WHERE version_id = $1 AND puesto_padre_id = $2 AND LOWER(BTRIM(denominacion)) = LOWER($3)
          LIMIT 1`,
        [versionId, rawPadreId, denominacion]
      );
      if (dupRes.rowCount) {
        throw new RhHttpError(409, 'Ya existe un puesto con la misma denominación bajo este superior');
      }

      const insRes = await client.query<any>(
        `INSERT INTO public.rh_org_puesto (
           version_id, puesto_padre_id, denominacion, codigo_nivel,
           nivel_jerarquico, siglas_area, orden_visual, observaciones, activo
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
         RETURNING id, version_id, puesto_padre_id, denominacion, codigo_nivel,
                   nivel_jerarquico, siglas_area, orden_visual, observaciones, activo`,
        [versionId, rawPadreId, denominacion, codigoNivel, nivelHijo, siglasArea, ordenVisual, observaciones]
      );
      const created = this.mapOrgPuestoRow(insRes.rows[0]);

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_ORG_CREATE_PUESTO',
          'rh_org_puesto',
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify({ puesto_id: created.id, version_id: versionId, puesto_padre_id: rawPadreId, denominacion }),
        ]
      );

      await client.query('COMMIT');
      return { puesto: created };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async updateOrganigramaPuesto(
    access: RhAccessContext,
    puestoId: number,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<{ puesto: RhOrgPuestoDto }> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(403, 'Solo RECURSOS_HUMANOS GLOBAL está autorizado');
    }
    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const curRes = await client.query<any>(
        `SELECT p.id, p.version_id, p.puesto_padre_id, p.denominacion, p.codigo_nivel,
                p.nivel_jerarquico, p.siglas_area, p.orden_visual, p.observaciones, p.activo
           FROM public.rh_org_puesto p
           INNER JOIN public.rh_org_version v ON v.id = p.version_id
          WHERE p.id = $1 AND v.clave = 'ORG-COORDINACION-ESTATAL'
          FOR UPDATE`,
        [puestoId]
      );
      if (!curRes.rowCount) {
        throw new RhHttpError(404, 'Puesto organizacional no encontrado');
      }
      const cur = curRes.rows[0];

      const hasOwn = (k: string) => Object.prototype.hasOwnProperty.call(input, k);
      const nextDenom = hasOwn('denominacion')
        ? normalizeOptionalVarchar(input.denominacion, 'denominacion', 200)
        : String(cur.denominacion);
      if (!nextDenom) {
        throw new RhHttpError(400, 'El campo "denominacion" no puede estar vacío');
      }
      const nextCodigo = hasOwn('codigo_nivel')
        ? normalizeOptionalVarchar(input.codigo_nivel, 'codigo_nivel', 40)
        : cur.codigo_nivel;
      const nextSiglas = hasOwn('siglas_area')
        ? normalizeOptionalVarchar(input.siglas_area, 'siglas_area', 30)
        : cur.siglas_area;
      const nextObs = hasOwn('observaciones')
        ? normalizeOptionalVarchar(input.observaciones, 'observaciones', 1000)
        : cur.observaciones;
      const nextOrden = hasOwn('orden_visual')
        ? (typeof input.orden_visual === 'number' && Number.isInteger(input.orden_visual) && input.orden_visual >= 0
            ? input.orden_visual
            : (() => { throw new RhHttpError(400, 'orden_visual inválido'); })())
        : Number(cur.orden_visual);

      if (cur.puesto_padre_id != null && nextDenom.toLowerCase() !== String(cur.denominacion).toLowerCase()) {
        const dupRes = await client.query<{ id: number }>(
          `SELECT id FROM public.rh_org_puesto
            WHERE version_id = $1 AND puesto_padre_id = $2 AND id <> $3 AND LOWER(BTRIM(denominacion)) = LOWER($4)
            LIMIT 1`,
          [cur.version_id, cur.puesto_padre_id, puestoId, nextDenom]
        );
        if (dupRes.rowCount) {
          throw new RhHttpError(409, 'Ya existe otro puesto con la misma denominación bajo el mismo superior');
        }
      }

      const updRes = await client.query<any>(
        `UPDATE public.rh_org_puesto
            SET denominacion = $1,
                codigo_nivel = $2,
                siglas_area = $3,
                orden_visual = $4,
                observaciones = $5,
                actualizado_en = NOW()
          WHERE id = $6
          RETURNING id, version_id, puesto_padre_id, denominacion, codigo_nivel,
                    nivel_jerarquico, siglas_area, orden_visual, observaciones, activo`,
        [nextDenom, nextCodigo, nextSiglas, nextOrden, nextObs, puestoId]
      );
      const updated = this.mapOrgPuestoRow(updRes.rows[0]);

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_ORG_UPDATE_PUESTO',
          'rh_org_puesto',
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify({ puesto_id: puestoId, version_id: Number(cur.version_id), denominacion: nextDenom }),
        ]
      );

      await client.query('COMMIT');
      return { puesto: updated };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async changeOrganigramaDependencia(
    access: RhAccessContext,
    puestoId: number,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<{ puesto: RhOrgPuestoDto }> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(403, 'Solo RECURSOS_HUMANOS GLOBAL está autorizado');
    }
    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }

    const newPadreId = input.puesto_padre_id;
    if (typeof newPadreId !== 'number' || !Number.isInteger(newPadreId) || newPadreId <= 0) {
      throw new RhHttpError(400, 'El campo "puesto_padre_id" debe ser un entero positivo');
    }
    if (newPadreId === puestoId) {
      throw new RhHttpError(400, 'Un puesto no puede depender de sí mismo');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const curRes = await client.query<any>(
        `SELECT p.id, p.version_id, p.puesto_padre_id, p.denominacion, p.nivel_jerarquico
           FROM public.rh_org_puesto p
           INNER JOIN public.rh_org_version v ON v.id = p.version_id
          WHERE p.id = $1 AND v.clave = 'ORG-COORDINACION-ESTATAL'
          FOR UPDATE`,
        [puestoId]
      );
      if (!curRes.rowCount) {
        throw new RhHttpError(404, 'Puesto organizacional no encontrado');
      }
      const cur = curRes.rows[0];
      if (cur.puesto_padre_id == null) {
        throw new RhHttpError(409, 'No se puede cambiar la dependencia del puesto raíz institucional');
      }
      const versionId = Number(cur.version_id);

      const newPadreRes = await client.query<{ id: number; nivel_jerarquico: number }>(
        `SELECT id, nivel_jerarquico FROM public.rh_org_puesto WHERE id = $1 AND version_id = $2 FOR UPDATE`,
        [newPadreId, versionId]
      );
      if (!newPadreRes.rowCount) {
        throw new RhHttpError(404, 'El nuevo superior no existe en ORG-COORDINACION-ESTATAL');
      }
      const nextNivel = Number(newPadreRes.rows[0].nivel_jerarquico) + 1;

      // Verificar que no exista ciclo
      const cicloRes = await client.query<{ hay_ciclo: boolean }>(
        `WITH RECURSIVE ancestros AS (
           SELECT id, puesto_padre_id, 1 AS prof
             FROM public.rh_org_puesto
            WHERE id = $1 AND version_id = $2
           UNION ALL
           SELECT p.id, p.puesto_padre_id, a.prof + 1
             FROM public.rh_org_puesto p
             INNER JOIN ancestros a ON a.puesto_padre_id = p.id
            WHERE p.version_id = $2 AND a.prof < 32
         )
         SELECT EXISTS (SELECT 1 FROM ancestros WHERE id = $3) AS hay_ciclo`,
        [newPadreId, versionId, puestoId]
      );
      if (cicloRes.rows[0]?.hay_ciclo) {
        throw new RhHttpError(409, 'El cambio de dependencia genera un ciclo jerárquico');
      }

      // Si cambia el nivel jerárquico y existen puestos hijos, rechazar explícitamente sin mover descendientes silenciosamente
      if (nextNivel !== Number(cur.nivel_jerarquico)) {
        const hijosRes = await client.query<{ cnt: number }>(
          `SELECT COUNT(*)::int AS cnt FROM public.rh_org_puesto WHERE puesto_padre_id = $1 AND version_id = $2`,
          [puestoId, versionId]
        );
        if (Number(hijosRes.rows[0]?.cnt ?? 0) > 0) {
          throw new RhHttpError(
            409,
            'No se puede cambiar el nivel jerárquico de un puesto que tiene puestos dependientes sin reubicar primero sus descendientes'
          );
        }
      }

      const dupRes = await client.query<{ id: number }>(
        `SELECT id FROM public.rh_org_puesto
          WHERE version_id = $1 AND puesto_padre_id = $2 AND id <> $3 AND LOWER(BTRIM(denominacion)) = LOWER($4)
          LIMIT 1`,
        [versionId, newPadreId, puestoId, cur.denominacion]
      );
      if (dupRes.rowCount) {
        throw new RhHttpError(409, 'Ya existe un puesto con la misma denominación bajo el nuevo superior');
      }

      const updRes = await client.query<any>(
        `UPDATE public.rh_org_puesto
            SET puesto_padre_id = $1,
                nivel_jerarquico = $2,
                actualizado_en = NOW()
          WHERE id = $3
          RETURNING id, version_id, puesto_padre_id, denominacion, codigo_nivel,
                    nivel_jerarquico, siglas_area, orden_visual, observaciones, activo`,
        [newPadreId, nextNivel, puestoId]
      );
      const updated = this.mapOrgPuestoRow(updRes.rows[0]);

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_ORG_CHANGE_DEPENDENCIA',
          'rh_org_puesto',
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify({
            puesto_id: puestoId,
            version_id: versionId,
            puesto_padre_anterior: Number(cur.puesto_padre_id),
            puesto_padre_nuevo: newPadreId,
          }),
        ]
      );

      await client.query('COMMIT');
      return { puesto: updated };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async updateOrganigramaPuestoEstado(
    access: RhAccessContext,
    puestoId: number,
    input: Record<string, unknown>,
    auditMeta: RhAuditMeta
  ): Promise<{ puesto: RhOrgPuestoDto }> {
    if (access.grantedBy !== 'RECURSOS_HUMANOS' || access.scope !== 'GLOBAL') {
      throw new RhHttpError(403, 'Solo RECURSOS_HUMANOS GLOBAL está autorizado');
    }
    const rawUserId = typeof auditMeta?.userId === 'string' ? auditMeta.userId.trim() : '';
    if (!UUID_REGEX.test(rawUserId)) {
      throw new RhHttpError(401, 'Unauthorized');
    }
    if (typeof input.activo !== 'boolean') {
      throw new RhHttpError(400, 'El campo "activo" debe ser booleano');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const curRes = await client.query<any>(
        `SELECT p.id, p.version_id, p.puesto_padre_id, p.activo
           FROM public.rh_org_puesto p
           INNER JOIN public.rh_org_version v ON v.id = p.version_id
          WHERE p.id = $1 AND v.clave = 'ORG-COORDINACION-ESTATAL'
          FOR UPDATE`,
        [puestoId]
      );
      if (!curRes.rowCount) {
        throw new RhHttpError(404, 'Puesto organizacional no encontrado');
      }
      const cur = curRes.rows[0];
      if (cur.puesto_padre_id == null && input.activo === false) {
        throw new RhHttpError(409, 'No se puede deshabilitar el puesto raíz institucional');
      }

      const updRes = await client.query<any>(
        `UPDATE public.rh_org_puesto
            SET activo = $1,
                actualizado_en = NOW()
          WHERE id = $2
          RETURNING id, version_id, puesto_padre_id, denominacion, codigo_nivel,
                    nivel_jerarquico, siglas_area, orden_visual, observaciones, activo`,
        [input.activo, puestoId]
      );
      const updated = this.mapOrgPuestoRow(updRes.rows[0]);

      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          rawUserId,
          'RH_ORG_UPDATE_ESTADO',
          'rh_org_puesto',
          auditMeta.ip ?? null,
          auditMeta.userAgent ?? null,
          JSON.stringify({ puesto_id: puestoId, version_id: Number(cur.version_id), activo: input.activo }),
        ]
      );

      await client.query('COMMIT');
      return { puesto: updated };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  private mapOrgPuestoRow(r: any): RhOrgPuestoDto {
    return {
      id: Number(r.id),
      version_id: Number(r.version_id),
      puesto_padre_id: r.puesto_padre_id != null ? Number(r.puesto_padre_id) : null,
      denominacion: String(r.denominacion),
      codigo_nivel: r.codigo_nivel != null ? String(r.codigo_nivel) : null,
      nivel_jerarquico: Number(r.nivel_jerarquico),
      siglas_area: r.siglas_area != null ? String(r.siglas_area) : null,
      orden_visual: Number(r.orden_visual ?? 0),
      observaciones: r.observaciones != null ? String(r.observaciones) : null,
      activo: Boolean(r.activo),
    };
  }
}

export interface RhOrgPuestoDto {
  id: number;
  version_id: number;
  puesto_padre_id: number | null;
  denominacion: string;
  codigo_nivel: string | null;
  nivel_jerarquico: number;
  siglas_area: string | null;
  orden_visual: number;
  observaciones: string | null;
  activo: boolean;
}

export interface RhVacacionPeriodoDto {
  id: number;
  anio: number;
  numero_periodo: 1 | 2;
  clave: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_base_provisionales: number;
  activo: boolean;
  observaciones: string | null;
}

export interface RhVacacionBolsaItemDto {
  periodo_id: number;
  anio: number;
  numero_periodo: 1 | 2;
  periodo_clave: string;
  periodo_nombre: string;
  periodo_fecha_inicio: string;
  periodo_fecha_fin: string;
  dias_base_provisionales: number;
  bolsa_id: number | null;
  dias_asignados: number | null;
  estado_asignacion: 'INEXISTENTE' | 'PROVISIONAL' | 'CONFIRMADA' | 'AJUSTADA';
  justificacion_ajuste: string | null;
  calendario_laboral_codigo: string | null;
  actualizado_en: string | null;
}

export interface RhVacacionFechaDto {
  id: number;
  fecha: string;
  computable: boolean;
  motivo_exclusion: string | null;
  activo: boolean;
}

export interface RhVacacionKardexMovimientoDto {
  id: number;
  persona_id: number;
  adscripcion_id: number | null;
  periodo_id: number | null;
  modo_registro: 'RANGO_HISTORICO' | 'FECHAS_DETALLADAS';
  fecha_inicio: string;
  fecha_fin: string;
  dias_registrados: number;
  documento_referencia: string | null;
  observaciones: string | null;
  estado: 'REGISTRADO' | 'ANULADO';
  motivo_anulacion: string | null;
  anulado_en: string | null;
  creado_en: string;
  actualizado_en: string;
  fechas: RhVacacionFechaDto[];
}

export interface RhVacacionKardexResponse {
  persona_id: number;
  periodo: RhVacacionPeriodoDto;
  resumen: {
    estado_bolsa: 'INEXISTENTE' | 'PROVISIONAL' | 'CONFIRMADA' | 'AJUSTADA';
    es_provisional: boolean;
    dias_asignados: number | null;
    dias_computables_registrados: number;
    saldo_administrativo: number | null;
    justificacion_ajuste: string | null;
  };
  movimientos: RhVacacionKardexMovimientoDto[];
}

export type RhLoteValidacionEstado =
  | 'ELEGIBLE'
  | 'YA_VINCULADA'
  | 'PERSONA_INACTIVA'
  | 'CONFLICTO_ADSCRIPCION'
  | 'DATOS_INVALIDOS';

export interface RhLoteValidacionItemDto {
  persona_id: number;
  estado: RhLoteValidacionEstado;
  detalle: string | null;
}

export interface RhLoteAdscripcionValidarResult {
  unidad_id: number;
  total_solicitados: number;
  elegibles: number;
  ya_vinculadas: number;
  personas_inactivas: number;
  conflictos_adscripcion: number;
  datos_invalidos: number;
  resultados: RhLoteValidacionItemDto[];
}

export type RhLoteEjecucionEstado =
  | 'CREADA'
  | 'OMITIDA_DUPLICADO'
  | 'PERSONA_INACTIVA'
  | 'ERROR_VALIDACION'
  | 'ERROR_INTERNO';

export interface RhLoteEjecucionItemDto {
  persona_id: number;
  resultado: RhLoteEjecucionEstado;
  adscripcion_laboral_id: number | null;
  detalle: string | null;
}

export interface RhLoteAdscripcionEjecucionResult {
  lote_id: string;
  unidad_id: number;
  total_solicitados: number;
  creadas: number;
  omitidas: number;
  errores: number;
  resultados: RhLoteEjecucionItemDto[];
}

export type RhAdscripcionPersonaEstadoVigencia = 'VIGENTE' | 'FUTURA' | 'HISTORICA';

export interface RhAdscripcionPersonaDto {
  adscripcion_laboral_id: number;
  persona_id: number;
  unidad_medica_id: number;
  unidad_nombre: string | null;
  unidad_cluesimb: string | null;
  matricula: string | null;
  puesto: string | null;
  turno: string | null;
  jornada: string | null;
  horario: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  estado_vigencia: RhAdscripcionPersonaEstadoVigencia;
  observaciones: string | null;
}

export interface RhAdscripcionesPersonaListResult {
  persona_id: number;
  items: RhAdscripcionPersonaDto[];
  page: number;
  pageSize: number;
  total: number;
}

export type RhVacacionEstado = 'REGISTRADO' | 'ANULADO';

export interface RhVacacionRegistroDto {
  id: number;
  persona_id: number;
  adscripcion_id: number | null;
  anio_ciclo: number;
  periodo_referencia: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_registrados: number;
  documento_referencia: string | null;
  observaciones: string | null;
  estado: RhVacacionEstado;
  motivo_anulacion: string | null;
  anulado_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface RhVacacionesListResult {
  persona_id: number;
  items: RhVacacionRegistroDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RhCreateVacacionResult {
  registro: RhVacacionRegistroDto;
  tiene_superposicion: boolean;
  registros_superpuestos_ids: number[];
}

export interface RhAnularVacacionResult {
  registro: RhVacacionRegistroDto;
  idempotente: boolean;
}
