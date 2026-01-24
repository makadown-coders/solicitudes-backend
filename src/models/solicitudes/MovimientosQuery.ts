
export type MovimientosQuery = {
  cluesimb: string;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  clave?: string;
  tipo?: 'SALIDA' | 'TRASPASO';
};
