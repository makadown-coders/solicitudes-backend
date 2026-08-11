export type RadarGlobalV2Segmento =
  | 'CRITICA_CPM'
  | 'ATENCION_CPM'
  | 'DEMANDA_SIN_CPM'
  | 'CPM_SIN_SOLICITUD'
  | 'CUBIERTA'
  | 'OBSERVAR';

export type RadarGlobalV2Input = {
  search?: string;
  clues?: string;
  segmento?: RadarGlobalV2Segmento | '';
  months?: number;
  page?: number;
  pageSize?: number;
};
