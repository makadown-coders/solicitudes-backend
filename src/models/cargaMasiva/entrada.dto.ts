export interface EntradaDTO {
  unidad_destino_id?: number | null;
  unidad_destino_texto?: string | null;
  clave_cnis: string;
  descripcion: string;
  num_factura?: string | null;
  folio?: string | null;
  proveedor?: string | null;
  cantidad: number;
  costo?: number | null;
  fecha: string; // formato ISO YYYY-MM-DD
  tipo_documento?: number | null;
  num_remision?: string | null;
  observaciones?: string | null;
  anio?: number | null;
  lote?: string | null;
  fecha_caducidad?: string | null;
  cantidad_existencia?: number | null;
  descripcion_extra?: string | null;
}
