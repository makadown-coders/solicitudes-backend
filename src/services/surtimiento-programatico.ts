import type { PoolClient } from 'pg';
import type { ContextoNecesidadFuente } from '../models/solicitudes/primer-nivel/AbastoProgramasNecesidades';
import type { Cabecera, Detalle, Informe } from '../models/solicitudes/primer-nivel/Surtimiento';
import { clasificarNecesidadesProgramaticas } from './abasto-programas-clasificacion';
import { conciliarNecesidadesConSas } from './abasto-programas-conciliacion';

type Contexto = ContextoNecesidadFuente & { invalido: boolean };
type Catalogo = { clave: string; codigo: string | null; nombre: string; seccion: string | null };
const par = (a: string, b: string) => JSON.stringify([a, b]);

export function construirDesglose(
  filas: Informe['filas'], cabeceras: Cabecera[], detalle: Detalle[],
  contextos: Contexto[], catalogo: Catalogo[],
) {
  const clavesAps = new Set<string>();
  const programasPorClave = new Map<string, Map<string, { codigo: string; nombre: string }>>();
  const nombresProgramas = new Map<string, string>();
  const secciones = new Map<string, Set<string>>();
  for (const item of catalogo) {
    if (item.codigo === null) clavesAps.add(item.clave);
    else {
      nombresProgramas.set(item.codigo, item.nombre);
      const programas = programasPorClave.get(item.clave) ?? new Map();
      programas.set(item.codigo, { codigo: item.codigo, nombre: item.nombre });
      programasPorClave.set(item.clave, programas);
    }
    if (item.seccion) {
      const id = par(item.codigo ?? '', item.clave);
      const nombres = secciones.get(id) ?? new Set<string>();
      nombres.add(item.seccion);
      secciones.set(id, nombres);
    }
  }
  const porDetalle = new Map<string, Contexto[]>();
  const conContexto = new Set(contextos.map(c => c.solicitudId));
  const cluesPorId = new Map(cabeceras.map(c => [c.id, c.clues]));
  for (const contexto of contextos) {
    const id = par(contexto.solicitudId, contexto.clave);
    const grupo = porDetalle.get(id) ?? [];
    grupo.push(contexto);
    porDetalle.set(id, grupo);
  }
  const fuentes = detalle.filter(d => cluesPorId.has(d.id));
  const clasificables = fuentes.filter(d => {
    if (!d.clave || d.invalido || !Number.isFinite(d.cantidad) || d.cantidad <= 0) return false;
    if (!conContexto.has(d.id)) return true;
    const grupo = porDetalle.get(par(d.id, d.clave)) ?? [];
    return grupo.length > 0 &&
      grupo.every(c => !c.invalido && Number.isFinite(c.cantidad) && c.cantidad >= 0) &&
      grupo.reduce((sum, c) => sum + c.cantidad, 0) === d.cantidad;
  });
  const { clasificadas } = clasificarNecesidadesProgramaticas(
    clasificables.map(d => ({ solicitudId: d.id, clave: d.clave, cantidad: d.cantidad })),
    contextos,
    { clavesAps, nombresProgramas, programasPorClave: new Map(
      [...programasPorClave].map(([clave, programas]) => [clave, [...programas.values()]]),
    ) },
  );
  const atribuidas = clasificadas.filter(c => c.cantidad > 0 && (c.vertiente === 'APS' || c.programa !== null));
  const cantidadPorDetalle = new Map<string, number>();
  for (const c of atribuidas) {
    const id = par(c.solicitudId, c.clave);
    cantidadPorDetalle.set(id, (cantidadPorDetalle.get(id) ?? 0) + c.cantidad);
  }
  const conCompetencia = new Set(fuentes.filter(d =>
    d.cantidad > (cantidadPorDetalle.get(par(d.id, d.clave)) ?? 0),
  ).map(d => par(cluesPorId.get(d.id)!, d.clave)));
  const conciliacion = conciliarNecesidadesConSas(
    fuentes.map(d => ({ clues: cluesPorId.get(d.id)!, clave: d.clave, cantidad: d.cantidad })),
    atribuidas.map(c => ({ ...c, clues: cluesPorId.get(c.solicitudId)! })),
    filas.map(f => ({ clues: f.clues, clave: f.clave, cantidad: f.surtido })),
  );
  const informePorClave = new Map(filas.map(f => [par(f.clues, f.clave), f]));
  return conciliacion.filas.map(f => {
    const id = par(f.clues, f.clave);
    const general = informePorClave.get(id)!;
    const condicion = f.atribucionSas === 'COMPARTIDA' || conCompetencia.has(id) ? 'COMPARTIDO'
      : general.cobertura === null ? 'POR VALIDAR' : 'EXCLUSIVO';
    const evaluable = condicion === 'EXCLUSIVO';
    return {
      clues: f.clues, clave: f.clave, vertiente: f.vertiente, programa: f.programa,
      programaNombre: f.programaNombre, cantidad: f.cantidad, evidencia: f.evidencia, condicion,
      ramificaciones: [...(secciones.get(par(f.programa ?? '', f.clave)) ?? [])]
        .sort((a, b) => a.localeCompare(b, 'es')),
      surtido: evaluable ? f.surtidoSas : null,
      pendiente: evaluable ? f.pendiente : null,
      excedente: evaluable ? f.excedente : null,
      cobertura: evaluable ? f.cobertura : null,
      relacion: evaluable ? f.relacionSurtidoSolicitado : null,
    } as const;
  });
}

export async function cargarDesgloseProgramatico(
  client: PoolClient, filas: Informe['filas'], cabeceras: Cabecera[], detalle: Detalle[],
) {
  if (!detalle.length) return [];
  const ids = cabeceras.map(c => c.id);
  const claves = [...new Set(detalle.map(d => d.clave))];
  const { rows: contextos } = await client.query<Contexto>(`
    SELECT solicitud_id::text AS "solicitudId", upper(trim(clave)) AS clave,
      origen_captura AS origen, nullif(upper(trim(referencia_captura)), '') AS referencia,
      sum(cantidad_capturada)::float8 AS cantidad,
      bool_or(cantidad_capturada IS NULL OR cantidad_capturada < 0
        OR cantidad_capturada::text IN ('NaN', 'Infinity', '-Infinity')
        OR origen_captura IS NULL OR origen_captura NOT IN ('APS', 'PROGRAMA_PREVENTIVO', 'CLAVE')) AS invalido
    FROM public.solicitud_primer_nivel_contexto WHERE solicitud_id = ANY($1::uuid[])
    GROUP BY 1, 2, 3, 4`, [ids]);
  const referencias = [...new Set(contextos.filter(c => c.origen === 'PROGRAMA_PREVENTIVO')
    .map(c => c.referencia).filter(Boolean))];
  const { rows: catalogo } = await client.query<Catalogo>(`
    SELECT upper(trim(mc.clave)) AS clave, NULL::text AS codigo, 'APS' AS nombre, ea.nombre AS seccion
    FROM aps.medicamento_clave mc
    JOIN aps.medicamento m ON m.id = mc.medicamento_id AND m.activo
    LEFT JOIN aps.grupo g ON g.id = m.grupo_id AND g.activo
    LEFT JOIN aps.eje_atencion ea ON ea.id = g.eje_id AND ea.activo
    WHERE mc.activo AND upper(trim(mc.clave)) = ANY($1::text[])
    UNION
    SELECT upper(trim(pc.clave)), upper(trim(p.codigo)), p.nombre, ps.nombre
    FROM preventivos.programa_clave pc
    JOIN preventivos.programa p ON p.id = pc.programa_id AND p.activo
    LEFT JOIN preventivos.programa_clave_seccion pcs
      ON pcs.programa_id = p.id AND upper(trim(pcs.clave)) = upper(trim(pc.clave))
    LEFT JOIN preventivos.programa_seccion ps
      ON ps.programa_id = p.id AND upper(trim(ps.codigo)) = upper(trim(pcs.seccion_codigo)) AND ps.activo
    WHERE pc.activo AND upper(trim(pc.clave)) = ANY($1::text[])
    UNION
    SELECT '', upper(trim(p.codigo)), p.nombre, NULL::text
    FROM preventivos.programa p
    WHERE upper(trim(p.codigo)) = ANY($2::text[])
      AND NOT EXISTS (SELECT 1 FROM preventivos.programa p2
        WHERE p2.activo AND upper(trim(p2.codigo)) = upper(trim(p.codigo)) AND NOT p.activo)
  `, [claves, referencias]);
  return construirDesglose(filas, cabeceras, detalle, contextos, catalogo);
}
