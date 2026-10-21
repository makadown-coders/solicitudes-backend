import { ApsVariante } from './ApsMedicamentoDetalle';

export type ResolverNecesidadesApsInput = {
  medicamentos: Array<{
    codigo: string;
    cantidad: number;
    claveSeleccionada?: string | null;
  }>;
};

export type NecesidadApsResuelta = {
  codigoMedicamento: string;
  etiqueta: string;
  clave: string;
  cantidad: number;
};

export type NecesidadApsPendiente = {
  codigoMedicamento: string;
  etiqueta: string;
  motivo: 'REQUIERE_VARIANTE';
  opciones: ApsVariante[];
};

export type ResolverNecesidadesApsResult = {
  resueltos: NecesidadApsResuelta[];
  pendientes: NecesidadApsPendiente[];
  listoParaEnviar: boolean;
};
