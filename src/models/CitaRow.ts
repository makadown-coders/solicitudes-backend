// Define una interfaz para la estructura de una fila del Excel
export interface CitaRow {
    [key: string]: string | number | Date | null | undefined;
    0?: string; // ejercicio
    1?: string; // ordenSuministro
    2?: string; // institucion
    3?: string; // tipoEntrega
    4?: string; // cluesDestino
    5?: string; // unidad
    6?: string; // fuenteFormato
    7?: string; // proveedor
    8?: string; // claveCNIS
    9?: string; // descripcion
    10?: string; // compra
    11?: string; // tipoRed
    12?: string; // tipoInsumo
    13?: string; // grupoTerapeutico
    14?: string | number | null; // precioUnitario
    15?: string | number | null; // piezasEmitidas
    16?: string | Date; // fechaLimiteEntrega
    17?: string | number | null; // piezasRecibidas
    18?: string | Date | null; // fechaRecepcionAlmacen
    19?: string; // numeroRemision
    20?: string; // lote
    21?: string | Date | null; // caducidad
    22?: string; // estatus
    23?: string; // folioAbasto
    24?: string; // almacenHospital
    25?: string; // evidencia
    26?: string; // carga
    27?: string | Date | null; // fechaCita
    28?: string; // observacion
}
