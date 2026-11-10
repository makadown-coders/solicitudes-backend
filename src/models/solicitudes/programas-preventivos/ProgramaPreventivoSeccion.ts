import { ProgramaPreventivoInsumo } from './ProgramaPreventivoInsumo';

export type ProgramaPreventivoSeccion = {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  insumos: ProgramaPreventivoInsumo[];
};
