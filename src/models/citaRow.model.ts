// Define una interfaz para la estructura de una fila del Excel


// Define una interfaz para la estructura de una fila del Excel
export interface CitaRow {
    [key: string]: string | number | Date | null | undefined;
    0?: string; // ejercicio
    1?: string; // ordenSuministro
    2?: string; // institucion
    3?: string; // contrato
    4?: string; // procedimiento
    5?: string; // tipoEntrega
    6?: string; // cluesDestino
    7?: string; // unidad
    8?: string; // fuenteFormato
    9?: string; // proveedor
    10?: string; // claveCNIS
    11?: string; // descripcion
    12?: string; // compra
    13?: string; // tipoRed
    14?: string; // tipoInsumo
    15?: string; // grupoTerapeutico
    16?: string | number | null; // precioUnitario
    17?: string | number | null; // piezasEmitidas
    18?: string | Date; // fechaEmision
    19?: string | Date; // fechaLimiteEntrega
    20?: string | number | null; // piezasRecibidas
    21?: string | Date | null; // fechaRecepcionAlmacen
    22?: string; // numeroRemision
    23?: string; // lote
    24?: string | Date | null; // caducidad
    25?: string; // estatus
    26?: string; // folioAbasto
    27?: string; // almacenHospital
    28?: string; // evidencia
    29?: string; // carga
    30?: string | Date | null; // fechaCita
    // 31?: string; // observacion
}

