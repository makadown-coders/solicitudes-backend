import { ArticuloMin } from "./ArticuloMin";


export type CrearBitacoraInput = {
  cluesimb: string;
  tipoPedido: 'Ordinario' | 'Extraordinario';
  tipoInsumo: string; // viene como string con '-'
  periodo?: string | null;
  articulos: ArticuloMin[];
};
