import { RadarGlobalV2Segmento } from './RadarGlobalV2Input';

export type RadarGlobalV2Row = {
  cluesimb: string;
  nombre_de_unidad: string | null;
  clave: string;
  descripcion: string | null;
  cpm: number;
  en_cpm: boolean;
  existencia_actual: number;
  snapshot_existencias: string | null;
  cobertura_cpm: number | null;
  cobertura_dias: number | null;
  solicitado_periodo: number;
  ciclos_con_clave: number;
  ciclos_unidad: number;
  frecuencia_solicitud: number;
  primera_solicitud: string | null;
  ultima_solicitud: string | null;
  homologos_disponibles: number;
  existencia_homologos_equivalente: number;
  mejor_homologo: string | null;
  segmento: RadarGlobalV2Segmento;
  prioridad: number;
  razones: string[];
};
