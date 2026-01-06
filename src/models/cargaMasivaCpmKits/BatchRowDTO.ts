
export type BatchRowDTO = {
    rowNumber: number;
    clues: string;
    clave_cnis: string;
    cpm: number | null;
    kits: Record<string, 0 | 1>; // keys = kitHeaders, values 0/1
};

