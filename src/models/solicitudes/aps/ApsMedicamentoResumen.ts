export type ApsGrupo = {
  numero: number;
  nombre: string;
};

export type ApsEje = {
  codigo: string;
  nombre: string;
};

export type ApsMedicamentoResumen = {
  codigo: string;
  etiqueta: string;
  grupo: ApsGrupo;
  eje: ApsEje | null;
  numeroClavesPrincipales: number;
  numeroClavesCoincidentes: number;
  requiereSeleccionDeVariante: boolean;
};

export type ApsMedicamentosPaginados = {
  items: ApsMedicamentoResumen[];
  page: number;
  pageSize: number;
  total: number;
};
