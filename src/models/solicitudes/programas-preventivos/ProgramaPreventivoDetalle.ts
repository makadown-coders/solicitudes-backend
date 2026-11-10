import { ProgramaPreventivoInsumo } from './ProgramaPreventivoInsumo';
import { ProgramaPreventivoSeccion } from './ProgramaPreventivoSeccion';

export type ProgramaPreventivoDetalle = {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  insumos: ProgramaPreventivoInsumo[];
  secciones?: ProgramaPreventivoSeccion[];
};
