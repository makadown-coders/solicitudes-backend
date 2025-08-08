// src/models/trazabilidad.dto.ts

export interface MovimientoTrazabilidadDTO {
  tipo_movimiento: 'entrada' | 'traspaso' | 'salida';
  fecha: string;                 // ISO yyyy-mm-dd
  clave_cnis: string;
  descripcion: string | null;
  cantidad: number;

  // Datos de la unidad (ya resueltos con JOIN/COALESCE)
  cluesimb: string | null;       // puede ser null si solo hay texto destino
  nombre_unidad: string;         // nombre o unidad_destino_texto
  alias_unidad: string | null;

  // Campos opcionales (pueden venir null según el origen)
  proveedor?: string | null;
  folio?: string | null;
  lote?: string | null;
  fecha_caducidad?: string | null;
  observaciones?: string | null;
}

