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

export type DispositivoRowEx = {
  id: number;
  serial: string | null;
  marca: string | null;
  modelo: string | null;
  ip: string | null;
  conexion: string | null;
  tipo: string;                  // nombre tipo_dispositivo
  unidad_medica_id: number;
  unidad_medica: string;         // nombre unidad

  // asignación/estado vigentes (si existen)
  asignacion_dispositivo_id?: number | null;
  persona_id?: number | null;
  persona_nombre_completo?: string | null;
  lugar_especifico?: string | null;
  estado_dispositivo_id?: number | null;
  estado_dispositivo?: string | null;
  fecha_asignacion?: string | null;
  fecha_retiro?: string | null;
};

export interface DispositivoRow extends Dispositivo {
  tipo?: string;
  unidad_medica?: string;
}
