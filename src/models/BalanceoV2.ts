export interface BalanceoV2Ejecucion {
  id: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: string;
  total_claves: number | null;
  claves_procesadas: number | null;
}

export interface BalanceoV2ResumenJurisdiccional {
  ejecucion_id: number;
  clave_cnis: string;
  jurisdiccion: string;
  [key: string]: any;
}

export interface BalanceoV2Detalle {
  ejecucion_id: number;
  fecha_ejecucion: string | null;
  clave_cnis: string;
  jurisdiccion_almacen: string;
  jurisdiccion_destino: string;
  clues_destino: string;
  nombre_unidad_destino: string;
  necesidad_original: number;
  cantidad_sugerida: number;
  prioridad: number;
}

export interface BalanceoV2Apartado {
  id: number;
  ejecucion_id: number;
  fecha_ejecucion: string | null;
  clave_cnis: string;
  clues_almacen: string;
  nombre_almacen: string;
  jurisdiccion: string;
  existencia_original: number;
  cpm_jurisdiccion: number;
  cantidad_apartada: number;
  existencia_disponible_balanceo: number;
  observaciones: string | null;
}

export interface BalanceoV2Resultado {
  ejecucion_id: number;
  fecha_ejecucion: string | null;
  clave_cnis: string;
  jurisdiccion_origen: string;
  jurisdiccion_destino: string;
  cantidad_transferir: number;
  existencia_original: number;
  necesidad_destino: number;
}

export interface BalanceoV2DetalleParams {
  ejecucionId: number;
  clave_cnis?: string;
  jurisdiccion_almacen?: string;
  jurisdiccion_destino?: string;
}

export interface BalanceoV2ApartadoParams {
  ejecucionId: number;
  clave_cnis?: string;
  jurisdiccion?: string;
}
