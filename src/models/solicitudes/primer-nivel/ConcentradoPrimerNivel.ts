import { OrigenCapturaPrimerNivel } from './ContextoCapturaPrimerNivel';
import { JurisdiccionDistribucion } from '../../../config/rutas-primer-nivel.provisional';

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

export type MatrizDistribucionPrimerNivelUnidad = {
  jurisdiccion: JurisdiccionDistribucion;
  cluesimb: string;
  unidad: string;
  ruta: string;
  ordenRuta: number;
  ordenUnidad: number;
  esRutaProvisional: boolean;
};

export type MatrizDistribucionPrimerNivelRow = {
  jurisdiccion: JurisdiccionDistribucion;
  cluesimb: string;
  clave: string;
  descripcion: string | null;
  piezas: number;
};

export type MatrizDistribucionPrimerNivelResponse = {
  mode: 'matriz-distribucion-primer-nivel';
  window: { months: number };
  generadoEn: string;
  unidades: MatrizDistribucionPrimerNivelUnidad[];
  data: MatrizDistribucionPrimerNivelRow[];
};
