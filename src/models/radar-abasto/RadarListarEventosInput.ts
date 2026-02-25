import { RadarRiesgoNivel } from './RadarRiesgoNivel';

export type RadarListarEventosInput = {
  desde?: string;
  hasta?: string;
  clues?: string;
  estado?: 'abierto' | 'en_seguimiento' | 'cerrado' | '';
  riesgoMin?: RadarRiesgoNivel | '';
  page?: number;
  pageSize?: number;
};

