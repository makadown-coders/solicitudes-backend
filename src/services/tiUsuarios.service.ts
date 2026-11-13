import { pool } from '../db/pool';
import {
  TiRoleItem,
  TiUsuarioItem,
  TiUsuarioRoleAssignment,
  TiUsuariosListParams,
  TiUsuariosPagedResponse,
} from '../models/tiUsuarios.model';

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
}
