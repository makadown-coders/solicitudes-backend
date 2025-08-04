export interface TraspasoDTO {
  fecha_recepcion: string;
  folio?: string | null;
  unidad_origen_id?: number | null;
  unidad_origen_texto?: string | null;
  clave_cnis: string;
  descripcion: string;
  cantidad: number;
  total?: number | null;
  unidad_destino_id?: number | null;
  unidad_destino_texto?: string | null;
  lote?: string | null;
  fecha_caducidad?: string | null;
  partida?: string | null;
}
