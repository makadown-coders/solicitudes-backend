import { RadarRiesgoNivel } from './RadarRiesgoNivel';

export type RadarEventoHeaderRow = {
  id: number;
  fecha_evento: string;
  clues: string;
  unidad_nombre: string | null;
  tipo_insumo: string | null;
  fecha_referencia: string | null;
  motivo: string;
  observaciones: string | null;
  estado: 'abierto' | 'en_seguimiento' | 'cerrado';
  creado_por: string | null;
  created_at: string;
  total_claves: number;
  riesgo_maximo: RadarRiesgoNivel | null;
};

