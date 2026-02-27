import { RadarRiesgoNivel } from './RadarRiesgoNivel';

export type RadarEventoClaveRow = {
  id: number;
  evento_id: number;
  clave_cnis: string;
  descripcion: string | null;
  existencia_actual: number;
  consumo_promedio: number;
  dias_cobertura: number | null;
  citas_pendientes: number;
  entradas_30d: number;
  salidas_30d: number;
  traspasos_30d: number;
  solicitado_30d: number;
  movimientos_recientes: number;
  nivel_riesgo: RadarRiesgoNivel;
  flags: string[];
  created_at: string;
  recalculated_at: string | null;
};

