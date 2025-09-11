export type BatchRow = {
  clave_cnis: string;
  existencia: number;
  // uno de los tres puede venir
  alias_sas?: string | null;
  cluessa?: string | null;
  cluesimb?: string | null;
};

export type BatchPayload = {
  fuente: 'SAS' | 'SALUS';
  fecha_corte: string; // 'YYYY-MM-DD'
  rows: BatchRow[];
};

export type TemporalExistenciaRow = {
  fuente: 'SAS'|'SALUS';
  alias_sas?: string | null;
  cluessa?: string | null;
  cluesimb?: string | null;
  clave_cnis: string;
  lote?: string | null;
  fecha_caducidad?: string | null; // 'YYYY-MM-DD' o null
  existencia: number;
};

export type ExistenciaUnidadRow = {
  clave_cnis: string;
  existencia_total: number;
};