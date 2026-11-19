import {
  ContextoNecesidadFuente,
  DetalleNecesidadFuente,
  NecesidadClasificada,
  ProgramaCatalogo,
  ResultadoClasificacionNecesidades,
} from '../models/solicitudes/primer-nivel/AbastoProgramasNecesidades';

type CatalogosClasificacion = {
  clavesAps: Set<string>;
  programasPorClave: Map<string, ProgramaCatalogo[]>;
  nombresProgramas: Map<string, string>;
};

export function clasificarNecesidadesProgramaticas(
  detalles: DetalleNecesidadFuente[],
  contextos: ContextoNecesidadFuente[],
  catalogos: CatalogosClasificacion,
): ResultadoClasificacionNecesidades {
  const solicitudesConContexto = new Set(contextos.map(item => item.solicitudId));
  const contextoPorSolicitudClave = new Map<string, ContextoNecesidadFuente[]>();
  for (const contexto of contextos) {
    const key = `${contexto.solicitudId}|${contexto.clave}`;
    const items = contextoPorSolicitudClave.get(key) ?? [];
    items.push(contexto);
    contextoPorSolicitudClave.set(key, items);
  }

  const clasificadas: NecesidadClasificada[] = [];
  let totalGeneral = 0;
  let cantidadClaveRegistrada = 0;
  let cantidadAmbigua = 0;
  let cantidadSinCoincidencia = 0;
  let diferenciasContexto = 0;

  for (const detalle of detalles) {
    totalGeneral += detalle.cantidad;
    const key = `${detalle.solicitudId}|${detalle.clave}`;
    const desglose = contextoPorSolicitudClave.get(key) ?? [];

    if (solicitudesConContexto.has(detalle.solicitudId)) {
      const totalContexto = desglose.reduce((sum, item) => sum + item.cantidad, 0);
      if (Math.abs(totalContexto - detalle.cantidad) > 0.000001) diferenciasContexto += 1;
      if (totalContexto < detalle.cantidad) cantidadSinCoincidencia += detalle.cantidad - totalContexto;

      for (const contexto of desglose) {
        if (contexto.origen === 'CLAVE') {
          cantidadClaveRegistrada += contexto.cantidad;
          continue;
        }
        if (contexto.origen === 'APS') {
          clasificadas.push({
            solicitudId: detalle.solicitudId,
            clave: detalle.clave,
            cantidad: contexto.cantidad,
            vertiente: 'APS',
            programa: null,
            programaNombre: null,
            evidencia: 'REGISTRADA',
          });
          continue;
        }
        const programa = contexto.referencia?.trim().toUpperCase() || null;
        clasificadas.push({
          solicitudId: detalle.solicitudId,
          clave: detalle.clave,
          cantidad: contexto.cantidad,
          vertiente: 'PROGRAMAS_PREVENTIVOS',
          programa,
          programaNombre: programa ? catalogos.nombresProgramas.get(programa) ?? programa : null,
          evidencia: 'REGISTRADA',
        });
      }
      continue;
    }

    const programas = new Map<string, ProgramaCatalogo>();
    for (const programa of catalogos.programasPorClave.get(detalle.clave) ?? []) {
      programas.set(programa.codigo, programa);
    }
    const perteneceAps = catalogos.clavesAps.has(detalle.clave);
    const candidaturas = (perteneceAps ? 1 : 0) + programas.size;

    if (candidaturas === 0) {
      cantidadSinCoincidencia += detalle.cantidad;
    } else if (candidaturas > 1) {
      cantidadAmbigua += detalle.cantidad;
    } else if (perteneceAps) {
      clasificadas.push({
        solicitudId: detalle.solicitudId,
        clave: detalle.clave,
        cantidad: detalle.cantidad,
        vertiente: 'APS',
        programa: null,
        programaNombre: null,
        evidencia: 'INFERIDA',
      });
    } else {
      const programa = Array.from(programas.values())[0];
      clasificadas.push({
        solicitudId: detalle.solicitudId,
        clave: detalle.clave,
        cantidad: detalle.cantidad,
        vertiente: 'PROGRAMAS_PREVENTIVOS',
        programa: programa.codigo,
        programaNombre: programa.nombre,
        evidencia: 'INFERIDA',
      });
    }
  }

  return {
    clasificadas,
    totalGeneral,
    cantidadProgramatica: clasificadas.reduce((sum, item) => sum + item.cantidad, 0),
    cantidadClaveRegistrada,
    cantidadAmbigua,
    cantidadSinCoincidencia,
    diferenciasContexto,
  };
}
