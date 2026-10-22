export type ResolverProgramaPreventivoInput = {
  cluesimb?: string | null;
  programa: string;
  insumos: Array<{
    clave: string;
    cantidad: number;
  }>;
};

export type ResolverProgramaPreventivoResult = {
  programa: {
    codigo: string;
    nombre: string;
  };
  articulos: Array<{
    clave: string;
    cantidad: number;
  }>;
  totalArticulos: number;
  listoParaEnviar: true;
};
