export interface TiRoleItem {
  id: string;
  code: string;
  description: string | null;
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
