export type VertienteProgramatica = 'APS' | 'PROGRAMAS_PREVENTIVOS';
export type EvidenciaClasificacion = 'REGISTRADA' | 'INFERIDA' | 'MIXTA';
export type ModalidadNecesidades = 'MES_CALENDARIO' | 'ULTIMOS_30_DIAS';
export type AtribucionSas = 'EXCLUSIVA' | 'COMPARTIDA';
export type ZonaSas = 'AZM' | 'AZT' | 'AZE';

export type VentanaSasProgramas = { zona: ZonaSas; desde: string; hasta: string; almacenId?: number };

export type AbastoProgramasNecesidadesInput = {
  modalidad?: unknown;
  mes?: unknown;
  desde?: unknown;
  jurisdiccion?: unknown;
  municipio?: unknown;
  clues?: unknown;
  vertiente?: unknown;
  programa?: unknown;
  azmDesde?: unknown;
  azmHasta?: unknown;
  aztDesde?: unknown;
  aztHasta?: unknown;
  azeDesde?: unknown;
  azeHasta?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

export type DetalleNecesidadFuente = {
  solicitudId: string;
  clave: string;
  cantidad: number;
};

export type ContextoNecesidadFuente = {
  solicitudId: string;
  clave: string;
  cantidad: number;
  origen: 'APS' | 'PROGRAMA_PREVENTIVO' | 'CLAVE';
  referencia: string | null;
};

export type ProgramaCatalogo = { codigo: string; nombre: string };

export type NecesidadClasificada = {
  solicitudId: string;
  clave: string;
  cantidad: number;
  vertiente: VertienteProgramatica;
  programa: string | null;
  programaNombre: string | null;
  evidencia: EvidenciaClasificacion;
};

export type ResultadoClasificacionNecesidades = {
  clasificadas: NecesidadClasificada[];
  totalGeneral: number;
  cantidadProgramatica: number;
  cantidadClaveRegistrada: number;
  cantidadAmbigua: number;
  cantidadSinCoincidencia: number;
  diferenciasContexto: number;
};

export type AbastoProgramasNecesidadRow = {
  jurisdiccion: string;
  municipio: string;
  unidad: string;
  clues: string;
  vertiente: VertienteProgramatica;
  programa: string | null;
  programaNombre: string | null;
  clave: string;
  descripcion: string | null;
  cantidad: number;
  evidencia: EvidenciaClasificacion;
  solicitudes: number;
  surtidoSas: number | null;
  pendiente: number | null;
  excedente: number | null;
  cobertura: number | null;
  relacionSurtidoSolicitado: number | null;
  atribucionSas: AtribucionSas;
};

export type NecesidadGeneralUnidadClave = { clues: string; clave: string; cantidad: number };
export type NecesidadProgramaticaUnidad = NecesidadClasificada & { clues: string };
export type SalidaSasUnidadClave = { clues: string; clave: string; cantidad: number };

export type ConciliacionProgramatica = {
  filas: Array<{
    clues: string; clave: string; vertiente: VertienteProgramatica; programa: string | null;
    programaNombre: string | null; cantidad: number; evidencia: EvidenciaClasificacion;
    surtidoSas: number | null; pendiente: number | null; excedente: number | null;
    cobertura: number | null; relacionSurtidoSolicitado: number | null; atribucionSas: AtribucionSas;
  }>;
  compartidas: Array<{
    clues: string; clave: string; necesidadTotal: number; surtidoSas: number;
    cantidadNoClasificada: number;
    destinos: Array<{ vertiente: VertienteProgramatica; programa: string | null; programaNombre: string | null; cantidad: number }>;
  }>;
  salidasSinNecesidad: SalidaSasUnidadClave[];
};
