export interface SalidaDTO {
  unidad_origen_id?: number | null;
  unidad_origen_texto?: string | null;
  unidad_destino_id?: number | null;
  unidad_destino_texto?: string | null;
  folio?: string | null;
  clave_cnis: string;
  cantidad: number;
  total?: number | null;
  programa?: string | null;
  fecha_entregado: string;
  tipo?: string | null;
  folio_extra?: string | null;
  movto?: string | null;
  descripcion: string;
  programa_extra?: string | null;
  lote?: string | null;
  fecha_caducidad?: string | null;
}
