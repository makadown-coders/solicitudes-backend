export type RadarGlobalV2Segmento =
  | 'CRITICA_CPM'
  | 'ATENCION_CPM'
  | 'DEMANDA_SIN_CPM'
  | 'CPM_SIN_SOLICITUD'
  | 'CUBIERTA'
  | 'OBSERVAR';

export type RadarGlobalV2EstadoOperativo =
  | 'VIGENTE_EN_PROCESO'
  | 'VIGENTE_CON_SALIDA'
  | 'FUERA_UMBRAL_SIN_SALIDA'
  | 'HISTORICA_CON_SALIDA'
  | 'SIN_SOLICITUD_OBSERVADA';

export type RadarGlobalV2Input = {
  search?: string;
  clues?: string;
  segmento?: RadarGlobalV2Segmento | '';
  estado_operativo?: RadarGlobalV2EstadoOperativo | '';
  months?: number;
  page?: number;
  pageSize?: number;
  export?: boolean;
};
