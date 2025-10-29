export type PersonaLite = {
  id: number;
  nombre_completo: string;
  unidad_medica?: string | null;
  unidad_medica_id?: number | null;
  email_principal?: string | null;
  n_correos?: number | null;
};