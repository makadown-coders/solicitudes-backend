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
}
