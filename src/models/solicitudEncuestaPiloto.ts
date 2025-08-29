// src/models/solicitudEncuestaPiloto.model.ts
export interface SolicitudEncuestaPiloto {
  timestamp: string;               // ISO 8601
  cluesimb: string;
  pilot_site: string;
  evento: string;                  // p.ej. "export_success"
  facilidad_1_5: number;          // 1..5
  termino_sin_trabas: boolean;
  csat_1_5: number;               // 1..5
  comentario?: string;            // <=500
  app_version?: string;
}
