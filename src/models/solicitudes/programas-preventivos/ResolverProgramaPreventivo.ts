export type ResolverProgramaPreventivoInput = {
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
