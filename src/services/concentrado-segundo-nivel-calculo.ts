import { mesPedido, rangoUltimos30 } from './surtimiento-calculo';

export const cluesAutorizadas = [
  'BCIMB000010', 'BCIMB000355', 'BCIMB001702', 'BCIMB001726', 'BCIMB001422',
  'BCIMB000623', 'BCIMB000676', 'BCIMB000734', 'BCIMB001796', 'BCIMB001352',
] as const;

export type Unidad = { clues: string; nombre: string; municipio: string; jurisdiccion: string };
export type Cabecera = {
  id: string; clues: string; fecha: string; creada: string; periodo: string | null; tipo: string;
  insumos: string[]; hash: string; clase: string;
};
export type Detalle = { id: string; clave: string; cantidad: string; descripcion?: string };
export type Consulta = { modalidad: 'MES_CALENDARIO' | 'ULTIMOS_30_DIAS'; mes?: string; desde?: string };

export function seleccionarPeriodo(q: Consulta, corte: string) {
  if (q.modalidad === 'MES_CALENDARIO') {
    const mes = q.mes ?? '';
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(mes)) throw new RangeError('Seleccione un mes válido.');
    const [anio, numero] = mes.split('-').map(Number);
    const hasta = new Date(Date.UTC(anio, numero, 0)).toISOString().slice(0, 10);
    return { desde: mes + '-01', hasta, incluye: (c: Cabecera) => mesPedido(c.periodo ?? '') === mes };
  }
  const base = rangoUltimos30(corte);
  const desde = q.desde ?? base.desde;
  const fecha = new Date(desde + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !Number.isFinite(fecha.valueOf()) ||
      fecha.toISOString().slice(0, 10) !== desde || desde > base.desde) {
    throw new RangeError('La ventana debe abarcar al menos 30 días. Amplíela hacia atrás.');
  }
  return { desde, hasta: corte, incluye: (c: Cabecera) => c.fecha >= desde && c.fecha <= corte };
}

type Trazabilidad = Pick<Cabecera, 'id' | 'clues' | 'fecha' | 'periodo' | 'tipo'>;
type Fila = Unidad & { clave: string; descripcion: string; cantidad: number; solicitudIds: string[] };

export function consolidar(unidades: Unidad[], cabeceras: Cabecera[], detalles: Detalle[]) {
  const unidadPorClues = new Map(unidades.map(u => [u.clues, u]));
  const porId = new Map<string, Detalle[]>();
  for (const d of detalles) {
    const grupo = porId.get(d.id) ?? [];
    grupo.push(d);
    porId.set(d.id, grupo);
  }
  const ids = new Set<string>();
  const firmas = new Map<string, string>();
  const filas = new Map<string, Fila>();
  const incluidas: Trazabilidad[] = [];
  const excluidas: (Trazabilidad & { equivalenteA: string })[] = [];
  const sinDetalle: Trazabilidad[] = [];
  for (const c of [...cabeceras].sort((a, b) => a.creada.localeCompare(b.creada) || a.id.localeCompare(b.id))) {
    const unidad = unidadPorClues.get(c.clues);
    if (!unidad || ids.has(c.id)) continue;
    ids.add(c.id);
    const traza = { id: c.id, clues: c.clues, fecha: c.fecha, periodo: c.periodo, tipo: c.tipo };
    const detalle = porId.get(c.id) ?? [];
    if (!detalle.length) { sinDetalle.push(traza); continue; }
    const firma = c.clase === 'raw' && c.periodo?.trim() && /^[a-f0-9]{64}$/i.test(c.hash)
      ? JSON.stringify([c.clues, c.periodo, c.tipo, [...c.insumos].sort(), c.hash.toLowerCase(),
          detalle.map(d => JSON.stringify([d.clave, d.cantidad])).sort()])
      : null;
    const equivalenteA = firma ? firmas.get(firma) : undefined;
    if (equivalenteA) { excluidas.push({ ...traza, equivalenteA }); continue; }
    if (firma) firmas.set(firma, c.id);
    incluidas.push(traza);
    for (const d of detalle) {
      const id = JSON.stringify([c.clues, d.clave]);
      const fila = filas.get(id) ?? { ...unidad, clave: d.clave, descripcion: d.descripcion ?? '', cantidad: 0, solicitudIds: [] };
      fila.cantidad += Number(d.cantidad);
      if (fila.solicitudIds.at(-1) !== c.id) fila.solicitudIds.push(c.id);
      filas.set(id, fila);
    }
  }
  return { filas: [...filas.values()], incluidas, excluidas, sinDetalle };
}
