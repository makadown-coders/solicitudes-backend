export type RadarGlobalV2OrdenEstado = 'PENDIENTE' | 'POR_VENCER' | 'VENCIDA' | 'CUMPLIDA_RECIENTE';

export type RadarGlobalV2OrdenRow = {
  orden_de_suministro: string | null;
  proveedor: string | null;
  fecha_emision: string | null;
  fecha_limite_de_entrega: string | null;
  fecha_recepcion: string | null;
  piezas_emitidas: number;
  piezas_recibidas: number;
  piezas_pendientes: number;
  estado_radar: RadarGlobalV2OrdenEstado;
};
