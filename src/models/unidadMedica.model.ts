// src/models/unidadMedica.model.ts
export interface UnidadMedica {
  id?: number;
  cluessa: string | null;
  cluesimb: string | null;
  nombre: string;
  alias_sas: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  estrato_unidad: string | null;
  nivel_atencion: string | null;
  tipo_unidad_id: number;
  localidad_id: number;
}

/**
 * Proyección de la vista public.v_unidad_medica_detalle
 * (solo lectura, útil para listados/detalles en API)
 */
export interface UnidadMedicaDetalle {
  id: number;
  cluessa: string | null;
  cluesimb: string | null;
  nombre_municipio: string | null;
  nombre_localidad: string | null;
  nombre_tipologia: string | null;
  es_segundo_nivel: boolean;
  nombre_de_unidad: string;
  tipo_unidad: string | null;        // nombre_tipo
  alias_sas: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  estrato_unidad: string | null;
  nivel_atencion: string | null;
}