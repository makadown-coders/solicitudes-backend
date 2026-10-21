export type OrigenCapturaPrimerNivel = 'APS' | 'PROGRAMA_PREVENTIVO' | 'CLAVE';

export type ContextoCapturaPrimerNivel = {
  clave: string;
  cantidad: number;
  origenCaptura: OrigenCapturaPrimerNivel;
  referenciaCaptura: string | null;
  etiquetaCaptura?: string | null;
};
