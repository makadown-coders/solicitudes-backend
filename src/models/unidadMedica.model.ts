export interface UnidadMedica {
  id?: number;
  cluessa: string | null;
  cluesimb: string | null;
  nombre: string;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  estrato_unidad: string | null;
  nivel_atencion: string | null;
  tipo_unidad_id: number;
  localidad_id: number;
}
