export interface CnisGrupoTerapeutico {
  numero: number;
  nombre: string;
}

export interface CnisArticuloGrupoTerapeutico {
  clave: string;
  grupo: number;
  grupoNombre: string;
}

export interface CnisArticuloGrupoTerapeuticoDetalle {
  clave: string;
  descripcion: string | null;
  presentacion: string | null;
}
