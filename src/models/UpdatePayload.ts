// src/models/UpdatePayload.ts
export type UpdatePayload = {
    id: number;
    nombre_completo?: string | undefined;
    unidad_medica_id?: number | null | undefined;
    correo_principal?: string | null | undefined;
    correos_complementarios?: string[] | undefined;
    correos?: string[] | undefined; // contrato heredado: si viene undefined no tocar; si [] dejar sin correos
};
