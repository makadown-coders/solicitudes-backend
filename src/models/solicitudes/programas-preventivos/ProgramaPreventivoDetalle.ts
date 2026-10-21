import { ProgramaPreventivoInsumo } from './ProgramaPreventivoInsumo';

export type ProgramaPreventivoDetalle = {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  insumos: ProgramaPreventivoInsumo[];
};
