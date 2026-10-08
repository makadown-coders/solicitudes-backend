export type EnviarNecesidadesPrimerNivelInput = {
  cluesimb: string;
  responsable?: string | null;
  periodo?: string | null;
  articulos: Array<{ clave: string; cantidad: number }>;
};

export type EnviarNecesidadesPrimerNivelResult = {
  solicitudId: string;
  folio: string;
  cluesimb: string;
  unidad: string;
  periodo: string | null;
  totalInsumos: number;
  totalPiezas: number;
  recibidoEn: string;
};
