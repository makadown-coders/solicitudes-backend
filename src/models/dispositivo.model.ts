// src/models/dispositivo.model.ts

export interface Dispositivo {
  id?: number;
  unidad_medica_id: number | null;
  tipo_dispositivo_id: number;
  ip?: string | null;
  conexion?: string | null;
  serial?: string | null;
  marca?: string | null;
  modelo?: string | null;
  observaciones?: string | null;
  creado_en?: string;
  actualizado_en?: string;
}
export interface DispositivoRow extends Dispositivo {
  tipo?: string;
  unidad_medica?: string;
}
