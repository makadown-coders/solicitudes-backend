
export type MovimientoRow = {
  tipo_movimiento: 'SALIDA' | 'TRASPASO';
  clues_destino: string;
  unidad_destino_texto: string;
  unidad_origen_texto: string;
  clave_cnis: string;
  cantidad: number;
  lote: string;
  total: number | null;
  programa: string | null;
  fecha_movimiento: string; // date -> text
  fecha_caducidad: string | null;
};
