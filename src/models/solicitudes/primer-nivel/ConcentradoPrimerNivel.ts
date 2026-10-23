import { OrigenCapturaPrimerNivel } from './ContextoCapturaPrimerNivel';

export type ConcentradoPrimerNivelInput = {
  months?: unknown;
  jurisdiccion?: unknown;
  clues?: unknown;
  origen?: unknown;
  referencia?: unknown;
  search?: unknown;
  page?: unknown;
  pageSize?: unknown;
  export?: boolean;
};

export type ConcentradoPrimerNivelRow = {
  cluesimb: string;
  unidad: string;
  jurisdiccion: string | null;
  clave: string;
  nombre: string | null;
  descripcion: string | null;
  origen: OrigenCapturaPrimerNivel;
  referencia: string | null;
  etiquetaReferencia: string;
  solicitudes: number;
  piezas: number;
  primeraSolicitud: string;
  ultimaSolicitud: string;
};
