import type { HomologoEdgeRow } from '../models/homologos/HomologoEdgeRow';

type Fila = { clues: string; clave: string; cantidad: number; pendiente: number; surtido: number; solicitudIds: string[] };
const par = (a: string, b: string) => JSON.stringify([a, b]);

export function detectarCandidatos(filas: Fila[], relaciones: HomologoEdgeRow[]) {
  const salidas = new Map(filas.filter(f => f.solicitudIds.length === 0 && f.surtido > 0)
    .map(f => [par(f.clues, f.clave), f]));
  const porOriginal = new Map<string, Map<string, string[]>>();
  for (const r of relaciones) {
    if (r.direccion !== 'FORWARD' || !r.candidato || r.claveConsultada === r.candidato) continue;
    const pares = porOriginal.get(r.claveConsultada) ?? new Map<string, string[]>();
    const factores = pares.get(r.candidato) ?? [];
    factores.push(r.factor);
    pares.set(r.candidato, factores);
    porOriginal.set(r.claveConsultada, pares);
  }
  const candidatos = filas.filter(f => f.cantidad > 0 && f.pendiente > 0).flatMap(f =>
    [...(porOriginal.get(f.clave) ?? [])].flatMap(([sustituta, factores]) => {
      const salida = salidas.get(par(f.clues, sustituta));
      return salida ? [{ f, salida, factores }] : [];
    }),
  );
  const contar = (clave: (c: typeof candidatos[number]) => string) => {
    const conteo = new Map<string, number>();
    for (const c of candidatos) {
      const id = clave(c);
      conteo.set(id, (conteo.get(id) ?? 0) + 1);
    }
    return conteo;
  };
  const alternativas = contar(c => par(c.f.clues, c.f.clave));
  const compartidas = contar(c => par(c.f.clues, c.salida.clave));
  return candidatos.map(({ f, salida, factores }) => {
    // El texto proviene de numeric en PostgreSQL. Se conserva su precisión para detectar conflictos.
    const distintos = new Set(factores.map(v => v.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')));
    const valor = Number(factores[0]);
    const equivalente = salida.surtido / valor;
    const valido = distintos.size === 1 && Number.isFinite(valor) && valor > 0 && Number.isFinite(equivalente);
    const avisos = [];
    if (factores.length > 1) avisos.push('Par repetido');
    if (distintos.size > 1) avisos.push('Factores contradictorios: ' + [...distintos].join(', '));
    else if (!valido) avisos.push('Factor inválido');
    if ((alternativas.get(par(f.clues, f.clave)) ?? 0) > 1) avisos.push('Múltiples alternativas');
    if ((compartidas.get(par(f.clues, salida.clave)) ?? 0) > 1) avisos.push('Sustituta compartida');
    return {
      clues: f.clues, original: f.clave, sustituta: salida.clave, factor: valido ? valor : null,
      equivalente: valido ? equivalente : null, potencial: valido ? Math.min(f.pendiente, equivalente) : null,
      estado: avisos.join(' · ') || 'Relación única',
    };
  });
}

type Grupo = { numero: number; nombre: string };
export type InsumoGrupo = { clave: string; medicamento: boolean; grupos: Grupo[] };
export function clasificarInsumos(insumos: (InsumoGrupo & { categoria: string })[]) {
  const porClave = new Map<string, typeof insumos>();
  for (const i of insumos) {
    const coincidencias = porClave.get(i.clave) ?? [];
    coincidencias.push(i);
    porClave.set(i.clave, coincidencias);
  }
  return [...porClave].map(([clave, coincidencias]) => {
    const categorias = coincidencias.map(i => i.categoria.trim().replace(/\s+/g, ' '));
    const identificadores = new Set(categorias.map(c => c.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()));
    const categoria = categorias[0];
    const medicamento = coincidencias[0].medicamento;
    const gruposUnicos = (i: InsumoGrupo) => [...new Map(i.grupos.map(g => [JSON.stringify([g.numero, g.nombre]), g])).values()]
      .sort((a, b) => a.numero - b.numero || a.nombre.localeCompare(b.nombre, 'es'));
    const grupos = medicamento ? gruposUnicos(coincidencias[0]) : [];
    const ambigua = identificadores.size > 1 || (medicamento && coincidencias.some(i =>
      JSON.stringify(gruposUnicos(i)) !== JSON.stringify(grupos)));
    const tipo = ambigua || !categoria ? 'Sin clasificar' : medicamento ? 'Medicamento'
      : identificadores.has('CATEGORIA II. MATERIAL DE CURACION') ? 'Material de curación' : categoria;
    return { clave, tipo, medicamento, ambigua, grupos: ambigua ? [] : grupos };
  });
}
export function clasificarGrupos(insumos: InsumoGrupo[]) {
  const porClave = new Map<string, InsumoGrupo[]>();
  for (const i of insumos) {
    const encontrados = porClave.get(i.clave) ?? [];
    encontrados.push(i);
    porClave.set(i.clave, encontrados);
  }
  return [...porClave].flatMap(([clave, encontrados]) => {
    if (!encontrados.some(i => i.medicamento)) return [];
    const [primero] = encontrados;
    const firma = (i: InsumoGrupo) => JSON.stringify(i.grupos.map(g => g.numero).sort((a, b) => a - b));
    const ambigua = encontrados.some(i => !i.medicamento || firma(i) !== firma(primero));
    return [{ clave, ambigua, grupos: ambigua ? [] : primero.grupos }];
  });
}
