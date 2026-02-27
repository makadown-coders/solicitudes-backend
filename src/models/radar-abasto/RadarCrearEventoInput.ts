export type RadarCrearEventoClaveInput = {
  clave_cnis: string;
  descripcion?: string | null;
};

export type RadarCrearEventoInput = {
  fecha_evento?: string;
  clues: string;
  unidad_nombre?: string | null;
  tipo_insumo?: string | null;
  fecha_referencia?: string | null;
  motivo: string;
  observaciones?: string | null;
  estado?: 'abierto' | 'en_seguimiento' | 'cerrado';
  creado_por?: string | null;
  claves: RadarCrearEventoClaveInput[];
};

