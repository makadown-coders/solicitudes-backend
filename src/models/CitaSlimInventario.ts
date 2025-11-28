export interface CitaSlimInventario {
  clave_cnis: string;
  lote: string;
  precio_unitario: number | null;
  orden_de_suministro: string | null;
  fte_fmto: string | null;
  proveedor: string | null;
}
