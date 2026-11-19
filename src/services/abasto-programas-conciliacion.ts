import {
  ConciliacionProgramatica,
  EvidenciaClasificacion,
  NecesidadGeneralUnidadClave,
  NecesidadProgramaticaUnidad,
  SalidaSasUnidadClave,
} from '../models/solicitudes/primer-nivel/AbastoProgramasNecesidades';

const EPSILON = 0.000001;

function key(clues: string, clave: string): string {
  return JSON.stringify([clues, clave]);
}

function owner(item: NecesidadProgramaticaUnidad): string {
  return item.vertiente === 'APS' ? 'APS' : `PP:${item.programa ?? 'SIN_REFERENCIA'}`;
}

export function conciliarNecesidadesConSas(
  generales: NecesidadGeneralUnidadClave[],
  programaticas: NecesidadProgramaticaUnidad[],
  salidas: SalidaSasUnidadClave[],
): ConciliacionProgramatica {
  const generalPorClave = new Map<string, number>();
  for (const item of generales) {
    const id = key(item.clues, item.clave);
    generalPorClave.set(id, (generalPorClave.get(id) ?? 0) + item.cantidad);
  }
  const salidaPorClave = new Map<string, number>();
  const salidaMuestra = new Map<string, SalidaSasUnidadClave>();
  for (const item of salidas) {
    const id = key(item.clues, item.clave);
    salidaPorClave.set(id, (salidaPorClave.get(id) ?? 0) + item.cantidad);
    salidaMuestra.set(id, item);
  }

  type Grupo = {
    muestra: NecesidadProgramaticaUnidad;
    cantidad: number;
    evidencias: Set<EvidenciaClasificacion>;
  };
  const gruposPorClave = new Map<string, Map<string, Grupo>>();
  for (const item of programaticas) {
    const id = key(item.clues, item.clave);
    const grupos = gruposPorClave.get(id) ?? new Map<string, Grupo>();
    const propietario = owner(item);
    const grupo = grupos.get(propietario) ?? {
      muestra: item, cantidad: 0, evidencias: new Set<EvidenciaClasificacion>(),
    };
    grupo.cantidad += item.cantidad;
    grupo.evidencias.add(item.evidencia);
    grupos.set(propietario, grupo);
    gruposPorClave.set(id, grupos);
  }

  const filas: ConciliacionProgramatica['filas'] = [];
  const compartidas: ConciliacionProgramatica['compartidas'] = [];
  for (const [id, grupos] of gruposPorClave) {
    const general = generalPorClave.get(id) ?? 0;
    const clasificada = Array.from(grupos.values()).reduce((sum, item) => sum + item.cantidad, 0);
    const noClasificada = Math.max(0, general - clasificada);
    const exclusiva = grupos.size === 1 && noClasificada <= EPSILON && Math.abs(general - clasificada) <= EPSILON;
    const salida = salidaPorClave.get(id) ?? 0;

    for (const grupo of grupos.values()) {
      const evidencia: EvidenciaClasificacion = grupo.evidencias.size === 1
        ? Array.from(grupo.evidencias)[0] : 'MIXTA';
      filas.push({
        clues: grupo.muestra.clues,
        clave: grupo.muestra.clave,
        vertiente: grupo.muestra.vertiente,
        programa: grupo.muestra.programa,
        programaNombre: grupo.muestra.programaNombre,
        cantidad: grupo.cantidad,
        evidencia,
        surtidoSas: exclusiva ? salida : null,
        pendiente: exclusiva ? Math.max(grupo.cantidad - salida, 0) : null,
        excedente: exclusiva ? Math.max(salida - grupo.cantidad, 0) : null,
        cobertura: exclusiva && grupo.cantidad > 0
          ? 100 * Math.min(Math.max(salida, 0), grupo.cantidad) / grupo.cantidad : null,
        relacionSurtidoSolicitado: exclusiva && grupo.cantidad > 0 ? 100 * salida / grupo.cantidad : null,
        atribucionSas: exclusiva ? 'EXCLUSIVA' : 'COMPARTIDA',
      });
    }

    if (!exclusiva) {
      const muestra = Array.from(grupos.values())[0].muestra;
      compartidas.push({
        clues: muestra.clues,
        clave: muestra.clave,
        necesidadTotal: general,
        surtidoSas: salida,
        cantidadNoClasificada: noClasificada,
        destinos: Array.from(grupos.values()).map(grupo => ({
          vertiente: grupo.muestra.vertiente,
          programa: grupo.muestra.programa,
          programaNombre: grupo.muestra.programaNombre,
          cantidad: grupo.cantidad,
        })),
      });
    }
  }

  const salidasSinNecesidad = Array.from(salidaPorClave.entries()).flatMap(([id, cantidad]) => {
    const muestra = salidaMuestra.get(id);
    return muestra && !generalPorClave.has(id) ? [{ ...muestra, cantidad }] : [];
  });
  return { filas, compartidas, salidasSinNecesidad };
}
