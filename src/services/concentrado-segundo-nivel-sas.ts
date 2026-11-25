import type { Unidad } from './concentrado-segundo-nivel-calculo';

export const fuentes = ['AZM', 'AZT', 'AZE', 'HOSPITAL'] as const;
export type Fuente = typeof fuentes[number];
export type Ventana = { fuente: Fuente; desde: string; hasta: string };
export type Identidad = {
  id: number; clues: string; nombre?: string; almacen: boolean; hospital: boolean; aliasSas: string[]; aliasDash: string[];
};
export type Movimiento = {
  id: number; dia: string; origen: number | null; destino: number | null;
  origenTexto: string | null; destinoTexto: string | null; clave: string; cantidad: string | null;
  lote: string | null; folio: string | null; folioExtra: string | null;
};
const zonasPorClues = new Map<string, Fuente>([
  ['BCIMB001405', 'AZM'], ['BCIMB001335', 'AZT'], ['BCIMB001340', 'AZE'],
]);
const normalizar = (s: string | null) => (s ?? '').trim().toUpperCase();
const llave = (clues: string, clave: string) => JSON.stringify([clues, clave]);

export function ventanasEfectivas(ventanas: Ventana[] | undefined, desde: string, hasta: string, corte: string) {
  const valida = (s: unknown): s is string => {
    if (typeof s !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  };
  if (ventanas !== undefined && (!Array.isArray(ventanas) || ventanas.length !== fuentes.length ||
    new Set(ventanas.map(v => v?.fuente)).size !== fuentes.length ||
    ventanas.some(v => !v || !fuentes.includes(v.fuente) || !valida(v.desde) || !valida(v.hasta) || v.desde > v.hasta))) {
    throw new RangeError('Revise las cuatro ventanas de salidas SAS.');
  }
  return (ventanas ?? fuentes.map(fuente => ({ fuente, desde, hasta })))
    .map(v => ({ fuente: v.fuente, desde: v.desde, hasta: v.hasta <= corte ? v.hasta : corte }));
}

export function resolverIdentidades(catalogo: Identidad[], unidades: Unidad[]) {
  const porId = new Map(catalogo.map(u => [u.id, u]));
  const alias = new Map<string, Set<number>>();
  const zonas = new Map<Fuente, Set<number>>();
  const zonasPorId = new Map<number, Set<Fuente>>();
  const cluesDestino = new Set(unidades.map(u => u.clues));
  const idsPorClues = new Map<string, number[]>();
  for (const u of catalogo) {
    if (cluesDestino.has(u.clues)) idsPorClues.set(u.clues, [...(idsPorClues.get(u.clues) ?? []), u.id]);
  }
  const destinos = new Set([...idsPorClues.values()].filter(ids => ids.length === 1).flat());
  for (const u of catalogo) {
    for (const valor of u.aliasSas.map(normalizar).filter(Boolean)) {
      const ids = alias.get(valor) ?? new Set<number>();
      ids.add(u.id);
      alias.set(valor, ids);
    }
    if (!u.almacen) continue;
    const candidatos = new Set([zonasPorClues.get(u.clues), ...[...u.aliasSas, ...u.aliasDash]
      .map(normalizar).filter((z): z is Fuente => z === 'AZM' || z === 'AZT' || z === 'AZE')]);
    candidatos.delete(undefined);
    const confirmados = new Set([...candidatos].filter((z): z is Fuente => z !== undefined));
    zonasPorId.set(u.id, confirmados);
    for (const zona of confirmados) {
      const ids = zonas.get(zona) ?? new Set<number>();
      ids.add(u.id);
      zonas.set(zona, ids);
    }
  }
  const aliasUnicos = new Map<string, number>();
  for (const [texto, ids] of alias) if (ids.size === 1) aliasUnicos.set(texto, [...ids][0]);
  const resolver = (id: number | null, texto: string | null) =>
    porId.get(id ?? -1) ?? porId.get(aliasUnicos.get(normalizar(texto)) ?? -1);
  const origenes = new Map<number, Fuente>();
  for (const u of catalogo) {
    if (u.almacen) {
      const candidatas = zonasPorId.get(u.id);
      const zona = candidatas?.size === 1 ? [...candidatas][0] : undefined;
      if (zona && zonas.get(zona)?.size === 1) origenes.set(u.id, zona);
    } else if (u.hospital) origenes.set(u.id, 'HOSPITAL');
  }
  return {
    resolver, destinos, origenes,
    aliasDestino: [...aliasUnicos].filter(([, id]) => destinos.has(id)).map(([clave]) => clave),
    almacenesPorValidar: fuentes.filter(f => f !== 'HOSPITAL' && ![...origenes.values()].includes(f)),
  };
}

export function conciliarSalidas<T extends Unidad & { clave: string; cantidad: number; descripcion: string; solicitudIds: string[] }>(
  necesidades: T[], unidades: Unidad[], movimientos: Movimiento[],
  identidades: ReturnType<typeof resolverIdentidades>, ventanas: Ventana[],
  incluirTransferenciasHospitalarias = true,
) {
  const porFuente = new Map(ventanas.map(v => [v.fuente, v]));
  const unidadesPorClues = new Map(unidades.map(u => [u.clues, u]));
  const diarios = new Map<string, { clues: string; clave: string; cantidad: number; fuente: Fuente; origen: Identidad; movimientos: Movimiento[] }>();
  const incidencias = { origenNoElegible: 0, destinoNoElegible: 0, mismaUnidad: 0, datosInvalidos: 0 };
  for (const m of movimientos) {
    const destino = identidades.resolver(m.destino, m.destinoTexto);
    if (!destino || !identidades.destinos.has(destino.id)) { incidencias.destinoNoElegible++; continue; }
    const origen = identidades.resolver(m.origen, m.origenTexto);
    const fuente = origen && identidades.origenes.get(origen.id);
    if (!origen || !fuente) { incidencias.origenNoElegible++; continue; }
    if (fuente === 'HOSPITAL' && !incluirTransferenciasHospitalarias) continue;
    const ventana = porFuente.get(fuente);
    if (!ventana || m.dia < ventana.desde || m.dia > ventana.hasta) continue;
    if (origen.id === destino.id) { incidencias.mismaUnidad++; continue; }
    const clave = normalizar(m.clave);
    const cantidad = m.cantidad === null ? NaN : Number(m.cantidad);
    if (!clave || !Number.isFinite(cantidad)) { incidencias.datosInvalidos++; continue; }
    const id = JSON.stringify([m.dia, origen.id, destino.id, clave]);
    const diario = diarios.get(id) ?? { clues: destino.clues, clave, cantidad: 0, fuente, origen, movimientos: [] };
    diario.cantidad += cantidad;
    diario.movimientos.push(m);
    diarios.set(id, diario);
  }
  const comparadas = new Map<string, Unidad & { clave: string; cantidad: number; descripcion: string;
    solicitudIds: string[]; surtidoAlmacenes: number; surtidoHospitales: number }>();
  const fechasPorClave = new Map<string, Set<string>>();
  const origenesPorClave = new Map<string, Map<number, {
    fuente: Fuente; nombre: string; surtido: number; ultimaSalida: string;
  }>>();
  for (const n of necesidades) comparadas.set(llave(n.clues, n.clave), { ...n, surtidoAlmacenes: 0, surtidoHospitales: 0 });
  for (const d of diarios.values()) {
    const id = llave(d.clues, d.clave);
    const dia = d.movimientos[0].dia;
    const fechas = fechasPorClave.get(id) ?? new Set<string>();
    fechas.add(dia);
    fechasPorClave.set(id, fechas);
    const origenes = origenesPorClave.get(id) ?? new Map();
    const origen = origenes.get(d.origen.id) ?? {
      fuente: d.fuente, nombre: d.origen.nombre || d.origen.clues, surtido: 0, ultimaSalida: dia,
    };
    origen.surtido += d.cantidad;
    if (dia > origen.ultimaSalida) origen.ultimaSalida = dia;
    origenes.set(d.origen.id, origen);
    origenesPorClave.set(id, origenes);
    const f = comparadas.get(id) ?? {
      ...unidadesPorClues.get(d.clues)!, clave: d.clave, cantidad: 0, descripcion: '', solicitudIds: [],
      surtidoAlmacenes: 0, surtidoHospitales: 0,
    };
    if (d.fuente === 'HOSPITAL') f.surtidoHospitales += d.cantidad;
    else f.surtidoAlmacenes += d.cantidad;
    comparadas.set(id, f);
  }
  return {
    incidencias, diarios,
    filas: [...comparadas.values()].map(f => {
      const surtido = f.surtidoAlmacenes + f.surtidoHospitales;
      const fechas = [...(fechasPorClave.get(llave(f.clues, f.clave)) ?? [])].sort();
      const cubierto = Math.min(Math.max(surtido, 0), Math.max(f.cantidad, 0));
      return {
        ...f, surtido, cubierto, pendiente: Math.max(f.cantidad - Math.max(surtido, 0), 0),
        primeraSalida: fechas[0] ?? null, ultimaSalida: fechas.at(-1) ?? null, fechasConSalida: fechas.length,
        origenes: [...(origenesPorClave.get(llave(f.clues, f.clave))?.values() ?? [])],
        excedente: Math.max(surtido - f.cantidad, 0), cobertura: f.cantidad > 0 ? 100 * cubierto / f.cantidad : null,
        relacion: f.cantidad > 0 ? 100 * surtido / f.cantidad : null,
      };
    }),
  };
}
