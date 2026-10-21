import { ApsEje, ApsGrupo } from './ApsMedicamentoResumen';

export type ApsVariante = {
  id: string;
  clave: string;
  nombre: string | null;
  descripcion: string | null;
  origenCatalogo: string;
};

export type ApsMedicamentoDetalle = {
  codigo: string;
  etiqueta: string;
  grupo: ApsGrupo;
  eje: ApsEje | null;
  requiereSeleccionDeVariante: boolean;
  variantes: ApsVariante[];
};
