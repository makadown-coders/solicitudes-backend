
export interface ResumenBalanceo {
    clave_cnis: string;
    jurisdiccion_almacen: string;
    jurisdiccion_destino: string;
    total_unidades: number;
    total_piezas: number;
    instrucciones_detalladas: string | null;
}
