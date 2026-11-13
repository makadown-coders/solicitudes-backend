export interface TiRoleItem {
  id: string;
  code: string;
  description: string | null;
}

export interface TiRoleCreateInput {
  code: string;
  description: string;
}

export interface TiUsuarioRoleAssignment {
  code: string;
  scope_type: string;
  scope_id: string;
}

export interface TiUsuarioItem {
  id: string;
  email: string;
  name: string;
  status: string;
  persona_id: number | null;
  nombre_completo: string | null;
  unidad_medica_id: number | null;
  unidad_medica: string | null;
  roles: TiUsuarioRoleAssignment[];
}

export interface TiUsuariosListParams {
  q?: string | null;
  status?: string | null;
  page?: number;
  pageSize?: number;
}

export interface TiUsuariosPagedResponse {
  items: TiUsuarioItem[];
  page: number;
  pageSize: number;
  total: number;
}

export type TiUsuarioStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

export interface TiUsuarioStatusUpdateResult {
  ok: true;
  id: string;
  status: TiUsuarioStatus;
  revoked_sessions: number;
}

export interface TiUsuarioPasswordResetResult {
  ok: true;
  id: string;
  revoked_sessions: number;
}

export interface TiUsuarioRolesUpdateResult {
  ok: true;
  id: string;
  roles: TiUsuarioRoleAssignment[];
}

export interface TiUsuarioCreateInput {
  persona_id: number;
  email: string;
  name?: string;
  password: string;
  status?: TiUsuarioStatus;
}

export interface TiUsuarioCreateResult {
  id: string;
  email: string;
  name: string;
  status: TiUsuarioStatus;
  persona_id: number;
}
