export type CreatePayload = {
  nombre_completo: string;
  unidad_medica_id?: number | null;
  correo_principal?: string | null;
  correos?: string[]; // orden importa: índice 0 = principal
};
