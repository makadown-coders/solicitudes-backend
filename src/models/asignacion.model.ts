// src/models/asignacion.model.ts
export interface Asignacion {
  id?: number;
  dispositivo_id: number;
  persona_id?: number | null;
  lugar_especifico?: string | null;
  estado_dispositivo_id: number;
  fecha_asignacion?: string;
  fecha_retiro?: string | null;
  observaciones?: string | null;
  creado_por?: string | null;
}
