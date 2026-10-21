export type ProgramaPreventivoResumen = {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  totalInsumos: number;
};

export type ProgramasPreventivosResponse = {
  items: ProgramaPreventivoResumen[];
};
