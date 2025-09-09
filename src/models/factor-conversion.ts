export interface FactorConversion {
    clave: string;
    en_dispensacion: boolean;
    cantidad_fc: number;
    cluesimb?: string; // opcional, solo informativo si vino por unidad
}