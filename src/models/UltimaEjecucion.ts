export interface UltimaEjecucion {
  id: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: string;
  total_claves: number | null;
  claves_procesadas: number | null;
}

