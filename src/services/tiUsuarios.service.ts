import * as argon2 from 'argon2';
import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import {
  TiRoleCreateInput,
  TiRoleItem,
  TiUsuarioItem,
  TiUsuarioCreateInput,
  TiUsuarioCreateResult,
  TiUsuarioPasswordResetResult,
  TiUsuarioRoleAssignment,
  TiUsuarioRolesUpdateResult,
  TiUsuarioStatus,
  TiUsuarioStatusUpdateResult,
  TiUsuariosListParams,
  TiUsuariosPagedResponse,
} from '../models/tiUsuarios.model';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES: ReadonlySet<string> = new Set(['ACTIVE', 'SUSPENDED', 'INACTIVE']);

export class TiUsuarioHttpError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message);
  }
}

export default class TiUsuariosService {
  /**
   * Consulta todos los roles registrados en `public.app_roles` ordenados determinísticamente por `code`.
   * Solo lectura; no crea ni asume códigos no verificados.
   */
  async listRoles(): Promise<TiRoleItem[]> {
    const sql = `
      SELECT
        r.id,
        r.code,
        r.description
      FROM public.app_roles r
      ORDER BY r.code ASC, r.id ASC
    `;

    const { rows } = await pool.query(sql);
    return rows.map((row: any) => ({
      id: String(row.id),
      code: String(row.code),
      description: row.description != null ? String(row.description) : null,
    }));
  }

  /**
   * Consulta paginada de cuentas SSO en `public.app_users` junto con la persona vinculada
   * (cuando exista), su unidad médica de adscripción (cuando exista) y su colección de roles
   * asignados en `public.app_user_roles` ordenada determinísticamente.
   *
   * Seguridad:
   * - Nunca selecciona ni proyecta `password_hash`, refresh tokens ni material criptográfico.
   * - Utiliza `LEFT JOIN` para preservar usuarios sin `persona_id` y personas sin `unidad_medica_id`.
   * - Obtiene los roles mediante `LEFT JOIN LATERAL` con `json_agg` para evitar multiplicación
   *   de filas cuando un usuario tiene múltiples roles o alcances.
   */
  async listUsuariosPaged(opts: TiUsuariosListParams): Promise<TiUsuariosPagedResponse> {
    const rawPageSize = Number(opts.pageSize ?? 20);
    const rawPage = Number(opts.page ?? 1);

    const pageSize = Math.min(Math.max(Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 20, 1), 100);
    const page = Math.max(Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1, 1);
    const offset = (page - 1) * pageSize;

    const params: unknown[] = [];
    const conditions: string[] = [];

    const q = typeof opts.q === 'string' ? opts.q.trim() : '';
    if (q.length > 0) {
      params.push(q.toLowerCase());
      const qParam = `$${params.length}`;
      conditions.push(`(
        LOWER(COALESCE(u.email, '')) LIKE '%' || ${qParam} || '%' OR
        LOWER(COALESCE(u.name, '')) LIKE '%' || ${qParam} || '%' OR
        LOWER(COALESCE(p.nombre_completo, '')) LIKE '%' || ${qParam} || '%'
      )`);
    }

    const status = typeof opts.status === 'string' ? opts.status.trim() : '';
    if (status.length > 0) {
      params.push(status.toUpperCase());
      const statusParam = `$${params.length}`;
      conditions.push(`UPPER(TRIM(u.status)) = ${statusParam}`);
    }

    params.push(pageSize);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        u.id,
        u.email,
        u.name,
        u.status,
        u.persona_id,
        p.nombre_completo,
        p.unidad_medica_id,
        um.nombre AS unidad_medica,
        COALESCE(ur_agg.roles, '[]'::json) AS roles,
        COUNT(*) OVER() AS total
      FROM public.app_users u
      LEFT JOIN public.persona p
        ON p.id = u.persona_id
      LEFT JOIN public.unidad_medica um
        ON um.id = p.unidad_medica_id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'code', r.code,
            'scope_type', ur.scope_type::text,
            'scope_id', ur.scope_id
          )
          ORDER BY r.code ASC, ur.scope_type::text ASC, ur.scope_id ASC
        ) AS roles
        FROM public.app_user_roles ur
        JOIN public.app_roles r
          ON r.id = ur.role_id
        WHERE ur.user_id = u.id
      ) ur_agg ON TRUE
      ${whereClause}
      ORDER BY LOWER(COALESCE(u.email, '')) ASC, u.id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const { rows } = await pool.query(sql, params);
    const total = rows.length > 0 ? Number(rows[0].total) : 0;

    const items: TiUsuarioItem[] = rows.map((row: any) => {
      const rawRoles = Array.isArray(row.roles) ? row.roles : [];
      const roles: TiUsuarioRoleAssignment[] = rawRoles.map((r: any) => ({
        code: String(r.code),
        scope_type: String(r.scope_type),
        scope_id: String(r.scope_id),
      }));

      return {
        id: String(row.id),
        email: String(row.email),
        name: row.name != null ? String(row.name) : '',
        status: String(row.status),
        persona_id: row.persona_id != null ? Number(row.persona_id) : null,
        nombre_completo: row.nombre_completo != null ? String(row.nombre_completo) : null,
        unidad_medica_id: row.unidad_medica_id != null ? Number(row.unidad_medica_id) : null,
        unidad_medica: row.unidad_medica != null ? String(row.unidad_medica) : null,
        roles,
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
   * Bloquea el rol `ADMIN_TIC` y obtiene los IDs de administradores globales activos (`FOR UPDATE OF u`)
   * para serializar operaciones concurrentes que puedan reducir el conjunto de administradores globales.
   *
   * Reutilizable en TI-2D.2B al modificar asignaciones en `public.app_user_roles`.
   */
  async lockAndListActiveGlobalAdminIds(client: PoolClient): Promise<string[]> {
    await client.query(
      `SELECT id FROM public.app_roles WHERE code = 'ADMIN_TIC' FOR UPDATE`
    );

    const { rows } = await client.query(
      `SELECT u.id
         FROM public.app_users u
         JOIN public.app_user_roles ur
           ON ur.user_id = u.id
         JOIN public.app_roles r
           ON r.id = ur.role_id
        WHERE r.code = 'ADMIN_TIC'
          AND ur.scope_type = 'GLOBAL'
          AND ur.scope_id = '*'
          AND UPPER(TRIM(u.status)) = 'ACTIVE'
          FOR UPDATE OF u`
    );

    return rows.map((r: any) => String(r.id));
  }

  /**
   * Cambia el estado de una cuenta SSO (`ACTIVE`, `SUSPENDED`, `INACTIVE`).
   * - Protege contra la suspensión/desactivación del último `ADMIN_TIC GLOBAL` activo (HTTP 409).
   * - Al suspender o desactivar, revoca todos los refresh tokens vigentes en `public.app_refresh_tokens`.
   * - No modifica `persona_id`, correos, contraseñas ni roles.
   * - No reactiva sesiones al volver a `ACTIVE`.
   */
  async updateUsuarioStatus(userId: string, rawStatus: string): Promise<TiUsuarioStatusUpdateResult> {
    if (!UUID_REGEX.test(userId)) {
      throw new TiUsuarioHttpError(400, 'Identificador de usuario inválido');
    }

    const nextStatus = String(rawStatus ?? '').trim().toUpperCase();
    if (!ALLOWED_STATUSES.has(nextStatus)) {
      throw new TiUsuarioHttpError(400, 'Estado de cuenta inválido. Valores permitidos: ACTIVE, SUSPENDED, INACTIVE');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        `SELECT id, status FROM public.app_users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      if (!userRes.rowCount) {
        throw new TiUsuarioHttpError(404, 'Cuenta SSO no encontrada');
      }

      if (nextStatus !== 'ACTIVE') {
        const activeGlobalAdminIds = await this.lockAndListActiveGlobalAdminIds(client);
        const isTargetActiveGlobalAdmin = activeGlobalAdminIds.includes(userId);
        if (isTargetActiveGlobalAdmin && activeGlobalAdminIds.length <= 1) {
          throw new TiUsuarioHttpError(
            409,
            'No es posible suspender o desactivar al último administrador global activo (ADMIN_TIC GLOBAL).'
          );
        }
      }

      await client.query(
        `UPDATE public.app_users
            SET status = $2
          WHERE id = $1`,
        [userId, nextStatus]
      );

      let revokedSessions = 0;
      if (nextStatus !== 'ACTIVE') {
        const revRes = await client.query(
          `UPDATE public.app_refresh_tokens
              SET revoked_at = COALESCE(revoked_at, now())
            WHERE user_id = $1
              AND revoked_at IS NULL`,
          [userId]
        );
        revokedSessions = revRes.rowCount ?? 0;
      }

      await client.query('COMMIT');
      return {
        ok: true,
        id: userId,
        status: nextStatus as TiUsuarioStatus,
        revoked_sessions: revokedSessions,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Restablecimiento administrativo de contraseña usando `argon2.hash` (mecanismo vigente de `LocalAuthService`)
   * y revocación inmediata de todos los refresh tokens vigentes en `public.app_refresh_tokens`.
   */
  async resetUsuarioPassword(userId: string, password: string): Promise<TiUsuarioPasswordResetResult> {
    if (!UUID_REGEX.test(userId)) {
      throw new TiUsuarioHttpError(400, 'Identificador de usuario inválido');
    }

    if (typeof password !== 'string' || password.trim().length < 10) {
      throw new TiUsuarioHttpError(400, 'La contraseña debe tener al menos 10 caracteres');
    }

    const passwordHash = await argon2.hash(password);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        `SELECT id FROM public.app_users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      if (!userRes.rowCount) {
        throw new TiUsuarioHttpError(404, 'Cuenta SSO no encontrada');
      }

      await client.query(
        `UPDATE public.app_users
            SET password_hash = $2
          WHERE id = $1`,
        [userId, passwordHash]
      );

      const revRes = await client.query(
        `UPDATE public.app_refresh_tokens
            SET revoked_at = COALESCE(revoked_at, now())
          WHERE user_id = $1
            AND revoked_at IS NULL`,
        [userId]
      );

      await client.query('COMMIT');
      return {
        ok: true,
        id: userId,
        revoked_sessions: revRes.rowCount ?? 0,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Reemplaza atómicamente las asignaciones de roles de una cuenta SSO existente.
   * - Valida roles contra `public.app_roles` y CLUES contra `public.unidad_medica`.
   * - Bloquea `DEPTO` al no existir un catálogo verificable en el backend.
   * - Protege al último `ADMIN_TIC GLOBAL` activo (HTTP 409).
   * - Revoca refresh tokens vigentes en `public.app_refresh_tokens`.
   */
  async updateUsuarioRoles(userId: string, rawRoles: unknown): Promise<TiUsuarioRolesUpdateResult> {
    if (!UUID_REGEX.test(userId)) {
      throw new TiUsuarioHttpError(400, 'Identificador de usuario inválido');
    }

    if (!Array.isArray(rawRoles)) {
      throw new TiUsuarioHttpError(400, 'La propiedad "roles" debe ser un arreglo');
    }

    const normalizedRoles: TiUsuarioRoleAssignment[] = [];
    const seenKeys = new Set<string>();
    const ALLOWED_SCOPE_TYPES = new Set(['GLOBAL', 'CLUES', 'DEPTO']);

    for (const entry of rawRoles) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new TiUsuarioHttpError(400, 'Cada asignación de rol debe ser un objeto válido');
      }
      const entryKeys = Object.keys(entry);
      if (
        entryKeys.length !== 3 ||
        !entryKeys.includes('code') ||
        !entryKeys.includes('scope_type') ||
        !entryKeys.includes('scope_id')
      ) {
        throw new TiUsuarioHttpError(400, 'Cada rol debe contener exclusivamente las propiedades code, scope_type y scope_id');
      }

      const rawCode = (entry as Record<string, unknown>).code;
      const rawScopeType = (entry as Record<string, unknown>).scope_type;
      const rawScopeId = (entry as Record<string, unknown>).scope_id;

      if (typeof rawCode !== 'string' || typeof rawScopeType !== 'string' || typeof rawScopeId !== 'string') {
        throw new TiUsuarioHttpError(400, 'Las propiedades code, scope_type y scope_id deben ser cadenas de texto');
      }

      const code = rawCode.trim().toUpperCase();
      const scopeType = rawScopeType.trim().toUpperCase();
      const scopeIdRaw = rawScopeId.trim();

      if (!code) {
        throw new TiUsuarioHttpError(400, 'El código de rol es obligatorio');
      }
      if (!ALLOWED_SCOPE_TYPES.has(scopeType)) {
        throw new TiUsuarioHttpError(400, `Tipo de alcance inválido: ${scopeType}`);
      }
      if (scopeType === 'DEPTO') {
        throw new TiUsuarioHttpError(
          400,
          'El alcance DEPTO no cuenta con un catálogo verificable en el backend para validar asignaciones'
        );
      }
      if (code === 'ADMIN_TIC' && scopeType !== 'GLOBAL') {
        throw new TiUsuarioHttpError(
          400,
          'El rol administrativo ADMIN_TIC solo admite alcance GLOBAL'
        );
      }

      let scopeId: string;
      if (scopeType === 'GLOBAL') {
        if (scopeIdRaw !== '*') {
          throw new TiUsuarioHttpError(400, "El alcance GLOBAL exige scope_id = '*'");
        }
        scopeId = '*';
      } else {
        if (!scopeIdRaw) {
          throw new TiUsuarioHttpError(400, 'El alcance CLUES exige un identificador de unidad válido');
        }
        scopeId = scopeIdRaw.toUpperCase();
      }

      const dedupKey = `${code}::${scopeType}::${scopeId}`;
      if (seenKeys.has(dedupKey)) {
        throw new TiUsuarioHttpError(400, `Asignación de rol duplicada: ${code} (${scopeType}:${scopeId})`);
      }
      seenKeys.add(dedupKey);

      normalizedRoles.push({ code, scope_type: scopeType, scope_id: scopeId });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        `SELECT id, status FROM public.app_users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      if (!userRes.rowCount) {
        throw new TiUsuarioHttpError(404, 'Cuenta SSO no encontrada');
      }

      const roleIdByCode = new Map<string, string>();
      if (normalizedRoles.length > 0) {
        const distinctCodes = Array.from(new Set(normalizedRoles.map((r) => r.code)));
        const rolesRes = await client.query(
          `SELECT id, code FROM public.app_roles WHERE code = ANY($1::text[])`,
          [distinctCodes]
        );
        for (const row of rolesRes.rows as Array<{ id: string; code: string }>) {
          roleIdByCode.set(String(row.code), String(row.id));
        }
        for (const code of distinctCodes) {
          if (!roleIdByCode.has(code)) {
            throw new TiUsuarioHttpError(400, `Rol inexistente en el catálogo: ${code}`);
          }
        }

        const distinctClues = Array.from(
          new Set(normalizedRoles.filter((r) => r.scope_type === 'CLUES').map((r) => r.scope_id))
        );
        if (distinctClues.length > 0) {
          const cluesRes = await client.query(
            `SELECT UPPER(TRIM(cluesimb)) AS clues FROM public.unidad_medica WHERE UPPER(TRIM(cluesimb)) = ANY($1::text[])`,
            [distinctClues]
          );
          const validClues = new Set((cluesRes.rows as Array<{ clues: string }>).map((r) => String(r.clues)));
          for (const clues of distinctClues) {
            if (!validClues.has(clues)) {
              throw new TiUsuarioHttpError(400, `CLUES inexistente en el catálogo institucional: ${clues}`);
            }
          }
        }
      }

      const activeGlobalAdminIds = await this.lockAndListActiveGlobalAdminIds(client);
      const isTargetActiveGlobalAdmin = activeGlobalAdminIds.includes(userId);
      const keepsGlobalAdmin = normalizedRoles.some(
        (r) => r.code === 'ADMIN_TIC' && r.scope_type === 'GLOBAL' && r.scope_id === '*'
      );
      if (isTargetActiveGlobalAdmin && activeGlobalAdminIds.length <= 1 && !keepsGlobalAdmin) {
        throw new TiUsuarioHttpError(
          409,
          'No es posible retirar el rol ADMIN_TIC GLOBAL al último administrador global activo.'
        );
      }

      await client.query(`DELETE FROM public.app_user_roles WHERE user_id = $1`, [userId]);

      for (const role of normalizedRoles) {
        const roleId = roleIdByCode.get(role.code)!;
        await client.query(
          `INSERT INTO public.app_user_roles (user_id, role_id, scope_type, scope_id)
           VALUES ($1, $2, $3, $4)`,
          [userId, roleId, role.scope_type, role.scope_id]
        );
      }

      const persistedRes = await client.query(
        `SELECT r.code, ur.scope_type, ur.scope_id
           FROM public.app_user_roles ur
           JOIN public.app_roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1
          ORDER BY r.code ASC, ur.scope_type ASC, ur.scope_id ASC`,
        [userId]
      );

      await client.query(
        `UPDATE public.app_refresh_tokens
            SET revoked_at = COALESCE(revoked_at, now())
          WHERE user_id = $1
            AND revoked_at IS NULL`,
        [userId]
      );

      await client.query('COMMIT');

      const persistedRoles: TiUsuarioRoleAssignment[] = (
        persistedRes.rows as Array<{ code: string; scope_type: string; scope_id: string }>
      ).map((r) => ({
        code: String(r.code),
        scope_type: String(r.scope_type),
        scope_id: String(r.scope_id),
      }));

      return {
        ok: true,
        id: userId,
        roles: persistedRoles,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Crea una nueva cuenta SSO vinculada explícitamente a una persona existente y activa.
   * - Bloquea la fila de `public.persona` con `FOR UPDATE` antes de validar vinculación.
   * - No crea personas ni asigna roles.
   * - Convierte conflictos de unicidad (23505) en HTTP 409 sin exponer detalles SQL.
   */
  async createUsuario(input: TiUsuarioCreateInput): Promise<TiUsuarioCreateResult> {
    if (typeof input.persona_id !== 'number' || !Number.isInteger(input.persona_id) || input.persona_id <= 0) {
      throw new TiUsuarioHttpError(400, 'Identificador de persona inválido');
    }

    if (typeof input.email !== 'string') {
      throw new TiUsuarioHttpError(400, 'El correo electrónico es obligatorio');
    }
    const email = input.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new TiUsuarioHttpError(400, 'El formato del correo electrónico es inválido');
    }

    if (typeof input.password !== 'string' || input.password.trim().length < 8) {
      throw new TiUsuarioHttpError(400, 'La contraseña debe tener al menos 8 caracteres válidos');
    }

    let status: TiUsuarioStatus = 'ACTIVE';
    if (input.status !== undefined) {
      if (typeof input.status !== 'string') {
        throw new TiUsuarioHttpError(400, 'Estado de cuenta inválido');
      }
      const normalizedStatus = input.status.trim().toUpperCase();
      if (!ALLOWED_STATUSES.has(normalizedStatus)) {
        throw new TiUsuarioHttpError(400, 'Estado de cuenta inválido. Valores permitidos: ACTIVE, SUSPENDED, INACTIVE');
      }
      status = normalizedStatus as TiUsuarioStatus;
    }

    let providedName = '';
    if (input.name !== undefined) {
      if (typeof input.name !== 'string') {
        throw new TiUsuarioHttpError(400, 'El nombre debe ser una cadena de texto');
      }
      providedName = input.name.trim();
    }

    const passwordHash = await argon2.hash(input.password);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const personaRes = await client.query(
        `SELECT id, nombre_completo, activo FROM public.persona WHERE id = $1 FOR UPDATE`,
        [input.persona_id]
      );
      if (!personaRes.rowCount) {
        throw new TiUsuarioHttpError(404, 'Persona no encontrada');
      }
      const personaRow = personaRes.rows[0] as { id: number; nombre_completo: string | null; activo: boolean };
      if (personaRow.activo !== true) {
        throw new TiUsuarioHttpError(404, 'La persona se encuentra inactiva');
      }

      const existingLinkRes = await client.query(
        `SELECT id FROM public.app_users WHERE persona_id = $1 LIMIT 1`,
        [input.persona_id]
      );
      if (existingLinkRes.rowCount && existingLinkRes.rowCount > 0) {
        throw new TiUsuarioHttpError(409, 'La persona ya cuenta con una cuenta SSO vinculada');
      }

      const existingEmailRes = await client.query(
        `SELECT id FROM public.app_users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
        [email]
      );
      if (existingEmailRes.rowCount && existingEmailRes.rowCount > 0) {
        throw new TiUsuarioHttpError(409, 'Ya existe una cuenta SSO con ese correo electrónico');
      }

      const finalName = providedName || String(personaRow.nombre_completo ?? '').trim() || email;

      let insertedRow: { id: string; email: string; name: string; status: TiUsuarioStatus; persona_id: number };
      try {
        const insertRes = await client.query(
          `INSERT INTO public.app_users (email, name, password_hash, status, persona_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, name, status, persona_id`,
          [email, finalName, passwordHash, status, input.persona_id]
        );
        insertedRow = insertRes.rows[0];
      } catch (insertErr: unknown) {
        if (insertErr && typeof insertErr === 'object' && (insertErr as { code?: string }).code === '23505') {
          throw new TiUsuarioHttpError(409, 'Conflicto de unicidad al crear la cuenta SSO');
        }
        throw insertErr;
      }

      await client.query('COMMIT');
      return {
        id: String(insertedRow.id),
        email: String(insertedRow.email),
        name: String(insertedRow.name),
        status: insertedRow.status,
        persona_id: Number(insertedRow.persona_id),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Crea un nuevo rol en `public.app_roles` sin asignarlo a ningún usuario.
   */
  async createRole(input: TiRoleCreateInput): Promise<TiRoleItem> {
    if (typeof input.code !== 'string') {
      throw new TiUsuarioHttpError(400, 'El código de rol es obligatorio');
    }
    const code = input.code.trim().toUpperCase();
    if (!code || !/^[A-Z0-9_]{2,64}$/.test(code)) {
      throw new TiUsuarioHttpError(
        400,
        'El código de rol debe tener entre 2 y 64 caracteres (solo letras A-Z, números 0-9 y guion bajo _)'
      );
    }

    if (typeof input.description !== 'string' || !input.description.trim()) {
      throw new TiUsuarioHttpError(400, 'La descripción del rol es obligatoria');
    }
    const description = input.description.trim();
    if (description.length > 255) {
      throw new TiUsuarioHttpError(400, 'La descripción del rol no puede exceder 255 caracteres');
    }

    if (code === 'ADMIN_TIC') {
      throw new TiUsuarioHttpError(409, 'El rol administrativo ADMIN_TIC ya existe y está reservado');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT id FROM public.app_roles WHERE UPPER(TRIM(code)) = $1 LIMIT 1`,
        [code]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new TiUsuarioHttpError(409, `El rol "${code}" ya existe en el catálogo`);
      }

      let inserted: { id: string; code: string; description: string | null };
      try {
        const res = await client.query(
          `INSERT INTO public.app_roles (code, description)
           VALUES ($1, $2)
           RETURNING id, code, description`,
          [code, description]
        );
        inserted = res.rows[0];
      } catch (insertErr: unknown) {
        if (insertErr && typeof insertErr === 'object' && (insertErr as { code?: string }).code === '23505') {
          throw new TiUsuarioHttpError(409, `El rol "${code}" ya existe en el catálogo`);
        }
        throw insertErr;
      }

      await client.query('COMMIT');
      return {
        id: String(inserted.id),
        code: String(inserted.code),
        description: inserted.description != null ? String(inserted.description) : null,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
