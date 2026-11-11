export type UniversoClavesQuery = {
  page: number;
  pageSize: number;
  search?: string;
  tipoInsumo?: string;
  activo?: boolean;
};

export type UniversoUnidadRow = {
  id: number;
  nombre: string;
  cluesimb: string | null;
  cluessa: string | null;
  totalClaves: number;
};

export type UniversoClaveRow = {
  clave: string;
  descripcion: string | null;
  presentacion: string | null;
  tipoInsumo: string;
  cpm: number;
  cpmRegistrado: boolean;
  activo: boolean;
  correspondenciaArticulo: boolean;
};

export type CatalogoClaveCandidataRow = {
  clave: string;
  descripcion: string | null;
  presentacion: string | null;
  cpm: number;
  perteneceUniverso: boolean;
  clasificacionEstado: 'AUTOMATICA' | 'MANUAL_160' | 'NO_DISPONIBLE' | 'INCOMPATIBLE' | 'AMBIGUA';
  tipoInsumo: 'Medicamento' | 'Material de curación' | null;
  clasificacionMensaje: string;
};

export type IncorporarClaveInput = {
  clave: string;
  tipoInsumoManual?: string;
};

export type ActualizarActivoResult = {
  clave: string;
  activo: boolean;
  actualizado: boolean;
};
