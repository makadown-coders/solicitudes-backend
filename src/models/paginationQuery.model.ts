export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;

  ejercicio?: number;
  orden_de_suministro?: string;
  institucion?: string;
  tipo_de_entrega?: string;
  clues_destino?: string;
  unidad?: string;
  fte_fmto?: string;
  proveedor?: string;
  clave_cnis?: string;
  descripcion?: string;
  compra?: string;
  tipo_de_red?: string;
  tipo_de_insumo?: string;
  grupo_terapeutico?: string;
  precio_unitario?: number;
  no_de_piezas_emitidas?: number;
  fecha_limite_de_entrega?: string;
  pzas_recibidas_por_la_entidad?: number;
  fecha_recepcion_almacen?: string;
  numero_de_remision?: string;
  lote?: string;
  caducidad?: string;
  estatus?: string;
  folio_abasto?: string;
  almacen_hospital_que_recibio?: string;
  evidencia?: string;
  carga?: string;
  fecha_de_cita?: string;
  observacion?: string;
}
