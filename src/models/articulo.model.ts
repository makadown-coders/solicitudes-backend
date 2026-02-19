// Tipar el resultado esperado
export interface Articulo {
  clave: string;
  descripcion: string;
  presentacion: string;
}

export interface ArticuloCrud {
  id: number;
  clave: string | null;
  descripcion: string | null;
  presentacion: string | null;
}

export interface ArticuloCrudCreateInput {
  clave: string;
  descripcion: string;
  presentacion?: string | null;
}

export interface ArticuloCrudUpdateInput {
  clave?: string;
  descripcion?: string;
  presentacion?: string | null;
}
