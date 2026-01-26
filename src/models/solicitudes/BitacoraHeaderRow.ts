
export type BitacoraHeaderRow = {
    id: string;
    created_day: string;
    created_at?: string;
    cluesimb: string;
    tipo_pedido: 'Ordinario' | 'Extraordinario';
    tipos_insumo: string[];
    periodo_texto: string | null;
    total_renglones: number;
    total_piezas: number;
};
