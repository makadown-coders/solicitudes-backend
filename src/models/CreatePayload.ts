export type CreatePayload = {
  nombre_completo: string;
  unidad_medica_id?: number | null;
  correos?: string[]; // orden importa: índice 0 = principal
};
