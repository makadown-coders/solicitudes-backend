export interface Cita {
    ejercicio: number | null;
    orden_de_suministro: string;
    institucion: string;
    tipo_de_entrega: string;
    clues_destino: string;
    unidad: string;
    fte_fmto: string;
    proveedor: string;
    clave_cnis: string;
    descripcion: string;
    compra: string;
    tipo_de_red: string;
    tipo_de_insumo: string;
    grupo_terapeutico: string;
    precio_unitario: number | null;
    no_de_piezas_emitidas: number | null;
    fecha_limite_de_entrega: Date;
    pzas_recibidas_por_la_entidad: number | null;
    fecha_recepcion_almacen: string | null;
    numero_de_remision: string;
    lote: string;
    caducidad: string | null;
    estatus: string;
    folio_abasto: string;
    almacen_hospital_que_recibio: string;
    evidencia: string;
    carga: string;
    fecha_de_cita: Date | null;
    observacion: string;
  }
  