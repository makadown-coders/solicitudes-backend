export interface SolicitudArchivo {
  nombreArchivo: string;
  contenidoBase64: string;
  nombre: string; // persona que genera
  unidad: string;
  clues: string;
  periodo: string;
  tipoMime: string; // opcional, pero lo mandamos
}
