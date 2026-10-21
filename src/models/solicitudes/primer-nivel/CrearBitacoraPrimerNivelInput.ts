import { ArticuloMin } from '../ArticuloMin';
import { ContextoCapturaPrimerNivel } from './ContextoCapturaPrimerNivel';

export type CrearBitacoraPrimerNivelInput = {
  cluesimb: string;
  periodo?: string | null;
  articulos: ArticuloMin[];
  contextosCaptura: ContextoCapturaPrimerNivel[];
};
