// src/models/UpdatePayload.ts
export type UpdatePayload = {
    id: number;
    nombre_completo?: string | undefined;
    unidad_medica_id?: number | null | undefined;
    correo_principal?: string | null | undefined;
    correos?: string[] | undefined; // si viene undefined: no tocar correos; si []: dejar sin correos
};
