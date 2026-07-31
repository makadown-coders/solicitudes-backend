export type RadarGlobalClaveRiesgoRow = {
  cluesimb: string;
  nombre_de_unidad: string | null;
  clave: string;
  descripcion: string | null;
  solicitado_acumulado: number;
  solicitado_promedio: number;
  solicitado_periodo: number;
  renglones_solicitados: number;
  existencia_actual: number;
  consumo_promedio: number;
  dias_cobertura: number | null;
  entradas_30d: number;
  salidas_30d: number;
  ultima_solicitud: string | null;
  puntaje_desabasto: number;
  nivel_desabasto: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAJO';
  puntaje_sobreabasto: number;
  nivel_sobreabasto: 'ALTO' | 'MEDIO' | 'BAJO';
};

