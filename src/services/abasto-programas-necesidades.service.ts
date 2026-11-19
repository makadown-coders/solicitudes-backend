import { pool } from '../db/pool';
import { parseIntSafe } from '../helpers/helper';
import {
  AbastoProgramasNecesidadRow,
  AbastoProgramasNecesidadesInput,
  ContextoNecesidadFuente,
  DetalleNecesidadFuente,
  EvidenciaClasificacion,
  ModalidadNecesidades,
  ProgramaCatalogo,
  VentanaSasProgramas,
  VertienteProgramatica,
} from '../models/solicitudes/primer-nivel/AbastoProgramasNecesidades';
import { mesPedido, rangoUltimos30 } from './surtimiento-calculo';
import { clasificarNecesidadesProgramaticas } from './abasto-programas-clasificacion';
import { conciliarNecesidadesConSas } from './abasto-programas-conciliacion';

type Unidad = {
  id: number;
  clues: string;
  unidad: string;
  municipio: string;
  jurisdiccion: string;
  unico: boolean;
};

type Almacen = { id: number; nombre: string; zonas: string[] };

type Cabecera = {
  id: string;
  clues: string;
  fecha: string;
  periodo: string;
};

function texto(value: unknown, max = 120): string {
  return String(value ?? '').trim().slice(0, max);
}

function fechaValida(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function normalizarClaveSql(alias: string): string {
  return `CASE
    WHEN UPPER(TRIM(${alias})) ~ '^311\\.[0-9]{3}\\.[0-9]{4}\\.[0-9]{2}$'
      THEN REGEXP_REPLACE(UPPER(TRIM(${alias})), '\\.[0-9]{2}$', '')
    ELSE UPPER(TRIM(${alias}))
  END`;
}

export default class AbastoProgramasNecesidadesService {
  async consultar(input: AbastoProgramasNecesidadesInput) {
    const modalidadInput = texto(input.modalidad, 30).toUpperCase();
    const modalidad: ModalidadNecesidades = modalidadInput === 'ULTIMOS_30_DIAS'
      ? 'ULTIMOS_30_DIAS' : 'MES_CALENDARIO';
    const vertienteInput = texto(input.vertiente, 40).toUpperCase();
    const vertiente: VertienteProgramatica = vertienteInput === 'PROGRAMAS_PREVENTIVOS'
      ? 'PROGRAMAS_PREVENTIVOS' : 'APS';
    const jurisdiccion = texto(input.jurisdiccion, 50).toUpperCase();
    const municipio = texto(input.municipio, 100).toUpperCase();
    const clues = texto(input.clues, 30).toUpperCase();
    const programa = vertiente === 'PROGRAMAS_PREVENTIVOS'
      ? texto(input.programa, 80).toUpperCase() : '';
    const page = Math.max(1, parseIntSafe(input.page, 1));
    const pageSize = Math.min(100, Math.max(1, parseIntSafe(input.pageSize, 10)));

    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const { rows: corteRows } = await client.query<{ corte: string }>(
        "SELECT (now() AT TIME ZONE 'America/Tijuana')::date::text AS corte"
      );
      const corte = corteRows[0].corte;
      const mesActual = corte.slice(0, 7);
      const mes = texto(input.mes, 7) || mesActual;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new RangeError('El mes seleccionado no es válido.');

      const rangoBase = rangoUltimos30(corte);
      let desde = modalidad === 'ULTIMOS_30_DIAS' ? texto(input.desde, 10) || rangoBase.desde : `${mes}-01`;
      const hasta = modalidad === 'ULTIMOS_30_DIAS'
        ? corte
        : new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
      if (!fechaValida(desde) || desde > hasta) throw new RangeError('El rango de fechas no es válido.');
      if (modalidad === 'ULTIMOS_30_DIAS' && desde > rangoBase.desde) {
        throw new RangeError('La fecha inicial puede conservarse o moverse hacia atrás para ampliar el análisis.');
      }

      const ventanaInput = (zona: 'AZM' | 'AZT' | 'AZE'): VentanaSasProgramas => {
        const prefijo = zona.toLowerCase() as 'azm' | 'azt' | 'aze';
        const desdeVentana = texto(input[`${prefijo}Desde`], 10) || desde;
        const hastaVentana = texto(input[`${prefijo}Hasta`], 10) || hasta;
        if (!fechaValida(desdeVentana) || !fechaValida(hastaVentana) || desdeVentana > hastaVentana) {
          throw new RangeError(`La ventana SAS ${zona} no es válida.`);
        }
        if (modalidad === 'ULTIMOS_30_DIAS' && desdeVentana > rangoBase.desde) {
          throw new RangeError(`La fecha inicial de ${zona} puede conservarse o moverse hacia atrás.`);
        }
        return { zona, desde: desdeVentana, hasta: hastaVentana };
      };
      const ventanasBase = (['AZM', 'AZT', 'AZE'] as const).map(ventanaInput);
      const { rows: almacenesRows } = await client.query<Almacen>(`
        WITH zonas_institucionales(zona, cluesimb) AS (
          VALUES ('AZM','BCIMB001405'), ('AZT','BCIMB001335'), ('AZE','BCIMB001340')
        )
        SELECT u.id, u.nombre, ARRAY(
          SELECT z.zona FROM zonas_institucionales z WHERE z.cluesimb = UPPER(TRIM(u.cluesimb))
          UNION SELECT UPPER(TRIM(a.alias_dash)) FROM public.unidad_medica_alias a
            WHERE a.unidad_medica_id = u.id AND UPPER(TRIM(a.alias_dash)) IN ('AZM','AZT','AZE')
          UNION SELECT UPPER(TRIM(a.alias_sas)) FROM public.unidad_medica_alias a
            WHERE a.unidad_medica_id = u.id AND UPPER(TRIM(a.alias_sas)) IN ('AZM','AZT','AZE')
        ) zonas
        FROM public.unidad_medica u
        WHERE EXISTS (
          SELECT 1 FROM public.v_unidad_medica_detalle v
          WHERE v.id = u.id AND UPPER(TRIM(v.tipo_unidad)) = 'ALMACENES'
        )
        ORDER BY u.nombre, u.id
      `);
      for (const ventana of ventanasBase) {
        const candidatos = almacenesRows.filter(almacen => almacen.zonas.includes(ventana.zona));
        if (candidatos.length !== 1 || candidatos[0].zonas.length !== 1) {
          throw new RangeError(`Revise la configuración institucional del almacén ${ventana.zona}.`);
        }
      }
      const ventanas = ventanasBase.map(ventana => ({
        ...ventana,
        almacenId: almacenesRows.find(almacen => almacen.zonas.includes(ventana.zona))!.id,
      }));

      const { rows: unidadesRows } = await client.query(`
        SELECT um.id, UPPER(TRIM(um.cluesimb)) AS clues,
               (SELECT COUNT(*) = 1 FROM public.unidad_medica otra
                WHERE UPPER(TRIM(otra.cluesimb)) = UPPER(TRIM(um.cluesimb))) AS unico,
               COALESCE(NULLIF(TRIM(MAX(v.nombre_de_unidad)), ''), MAX(um.nombre)) AS unidad,
               COALESCE(NULLIF(TRIM(MAX(v.nombre_municipio)), ''), 'N/D') AS municipio,
               CASE
                 WHEN UPPER(TRIM(um.cluesimb)) = 'BCIMB000133' THEN 'MEXICALI'
                 WHEN UPPER(TRIM(MAX(v.nombre_municipio))) IN ('TIJUANA','TECATE','PLAYAS DE ROSARITO') THEN 'TIJUANA'
                 WHEN UPPER(TRIM(MAX(v.nombre_municipio))) IN ('MEXICALI','SAN FELIPE') THEN 'MEXICALI'
                 WHEN UPPER(TRIM(MAX(v.nombre_municipio))) IN ('ENSENADA','SAN QUINTIN','SAN QUINTÍN') THEN 'ENSENADA'
                 ELSE COALESCE(NULLIF(UPPER(TRIM(MAX(v.nombre_municipio))), ''), 'N/D')
               END AS jurisdiccion
        FROM public.unidad_medica um
        JOIN public.v_unidad_medica_detalle v ON v.id = um.id
        WHERE um.activo = true AND NULLIF(UPPER(TRIM(um.cluesimb)), '') IS NOT NULL
        GROUP BY um.id, UPPER(TRIM(um.cluesimb))
        HAVING UPPER(TRIM(MAX(v.tipo_unidad))) = 'CENTRO DE SALUD'
        ORDER BY jurisdiccion, municipio, unidad, clues
      `);
      const catalogoUnidades: Unidad[] = unidadesRows.map((row: any) => ({
        id: Number(row.id), clues: String(row.clues), unidad: String(row.unidad), municipio: String(row.municipio),
        jurisdiccion: String(row.jurisdiccion), unico: Boolean(row.unico),
      }));
      const unidades = catalogoUnidades.filter(unidad =>
        (!jurisdiccion || unidad.jurisdiccion === jurisdiccion)
        && (!municipio || unidad.municipio.toUpperCase() === municipio)
        && (!clues || unidad.clues === clues)
      );

      const cluesElegibles = unidades.map(item => item.clues);
      const { rows: cabecerasRows } = cluesElegibles.length ? await client.query(`
        SELECT b.id::text, UPPER(TRIM(b.cluesimb)) AS clues,
               (b.created_at AT TIME ZONE 'America/Tijuana')::date::text AS fecha,
               COALESCE(b.periodo_texto, '') AS periodo
        FROM public.solicitud_bitacora b
        WHERE UPPER(TRIM(b.cluesimb)) = ANY($1::text[])
          AND ($2::text <> 'ULTIMOS_30_DIAS'
               OR (b.created_at AT TIME ZONE 'America/Tijuana')::date BETWEEN $3::date AND $4::date)
        ORDER BY b.created_at, b.id
      `, [cluesElegibles, modalidad, desde, hasta]) : { rows: [] };
      const cabeceras: Cabecera[] = cabecerasRows.map((row: any) => ({
        id: String(row.id), clues: String(row.clues), fecha: String(row.fecha), periodo: String(row.periodo),
      }));
      const elegibles = cabeceras.filter(cabecera => modalidad === 'ULTIMOS_30_DIAS'
        ? cabecera.fecha >= desde && cabecera.fecha <= hasta
        : mesPedido(cabecera.periodo) === mes);
      const ids = elegibles.map(item => item.id);

      const [detalleResult, contextoResult, apsResult, programasResult, programaClavesResult] = await Promise.all([
        ids.length ? client.query(`
          SELECT solicitud_id::text AS solicitud_id, ${normalizarClaveSql('clave')} AS clave,
                 SUM(cantidad)::float8 AS cantidad
          FROM public.solicitud_bitacora_detalle
          WHERE solicitud_id = ANY($1::uuid[])
          GROUP BY solicitud_id, ${normalizarClaveSql('clave')}
        `, [ids]) : Promise.resolve({ rows: [] }),
        ids.length ? client.query(`
          SELECT solicitud_id::text AS solicitud_id, ${normalizarClaveSql('clave')} AS clave,
                 origen_captura AS origen, NULLIF(UPPER(TRIM(referencia_captura)), '') AS referencia,
                 SUM(cantidad_capturada)::float8 AS cantidad
          FROM public.solicitud_primer_nivel_contexto
          WHERE solicitud_id = ANY($1::uuid[])
          GROUP BY solicitud_id, ${normalizarClaveSql('clave')}, origen_captura,
                   NULLIF(UPPER(TRIM(referencia_captura)), '')
        `, [ids]) : Promise.resolve({ rows: [] }),
        client.query(`
          SELECT DISTINCT ${normalizarClaveSql('mc.clave')} AS clave
          FROM aps.medicamento_clave mc
          JOIN aps.medicamento m ON m.id = mc.medicamento_id
          WHERE mc.activo = true AND m.activo = true
        `),
        client.query(`
          SELECT UPPER(TRIM(codigo)) AS codigo, nombre
          FROM preventivos.programa WHERE activo = true ORDER BY orden, nombre
        `),
        client.query(`
          SELECT DISTINCT ${normalizarClaveSql('pc.clave')} AS clave,
                 UPPER(TRIM(p.codigo)) AS codigo, p.nombre
          FROM preventivos.programa_clave pc
          JOIN preventivos.programa p ON p.id = pc.programa_id
          WHERE pc.activo = true AND p.activo = true
        `),
      ]);

      const detalles: DetalleNecesidadFuente[] = detalleResult.rows.map((row: any) => ({
        solicitudId: String(row.solicitud_id), clave: String(row.clave), cantidad: Number(row.cantidad ?? 0),
      }));
      const clavesDetalle = Array.from(new Set(detalles.map(item => item.clave)));
      const { rows: descripcionesRows } = clavesDetalle.length ? await client.query(`
        SELECT DISTINCT ON (${normalizarClaveSql('i.clave')})
               ${normalizarClaveSql('i.clave')} AS clave,
               COALESCE(NULLIF(TRIM(i.nombre), ''),
                        NULLIF(REGEXP_REPLACE(TRIM(i.descripcion), '[[:space:]]+', ' ', 'g'), '')) AS descripcion
        FROM cnis.insumo i
        WHERE ${normalizarClaveSql('i.clave')} = ANY($1::text[])
        ORDER BY ${normalizarClaveSql('i.clave')}, i.activo DESC, i.id DESC
      `, [clavesDetalle]) : { rows: [] };
      const descripciones = new Map<string, string | null>(descripcionesRows.map((row: any) => [
        String(row.clave), row.descripcion ? String(row.descripcion) : null,
      ]));
      const contextos: ContextoNecesidadFuente[] = contextoResult.rows.map((row: any) => ({
        solicitudId: String(row.solicitud_id), clave: String(row.clave), cantidad: Number(row.cantidad ?? 0),
        origen: row.origen, referencia: row.referencia ? String(row.referencia) : null,
      }));
      const programasCatalogo: ProgramaCatalogo[] = programasResult.rows.map((row: any) => ({
        codigo: String(row.codigo), nombre: String(row.nombre),
      }));
      const nombresProgramas = new Map(programasCatalogo.map(item => [item.codigo, item.nombre]));
      const programasPorClave = new Map<string, ProgramaCatalogo[]>();
      for (const row of programaClavesResult.rows) {
        const key = String(row.clave);
        const lista = programasPorClave.get(key) ?? [];
        lista.push({ codigo: String(row.codigo), nombre: String(row.nombre) });
        programasPorClave.set(key, lista);
      }

      const clasificacion = clasificarNecesidadesProgramaticas(detalles, contextos, {
        clavesAps: new Set(apsResult.rows.map((row: any) => String(row.clave))),
        programasPorClave,
        nombresProgramas,
      });
      const cabeceraPorId = new Map(elegibles.map(item => [item.id, item]));
      const unidadPorClues = new Map(unidades.map(item => [item.clues, item]));

      const necesidadesGenerales = detalles.flatMap(detalle => {
        const cabecera = cabeceraPorId.get(detalle.solicitudId);
        return cabecera ? [{ clues: cabecera.clues, clave: detalle.clave, cantidad: detalle.cantidad }] : [];
      });
      const necesidadesProgramaticas = clasificacion.clasificadas.flatMap(item => {
        const cabecera = cabeceraPorId.get(item.solicitudId);
        return cabecera ? [{ ...item, clues: cabecera.clues }] : [];
      });
      const unidadesPorId = new Map(unidades.map(item => [item.id, item]));
      const idsUnidad = unidades.filter(item => item.unico).map(item => item.id);
      const salidaResult = idsUnidad.length ? await client.query(`
        WITH ventanas AS (
          SELECT * FROM JSONB_TO_RECORDSET($1::jsonb)
          AS v("almacenId" int, desde date, hasta date)
        ),
        diario AS (
          SELECT s.fecha_entregado::date AS dia,
                 s.unidad_origen_id AS origen,
                 s.unidad_destino_id AS destino,
                 ${normalizarClaveSql('s.clave_cnis')} AS clave,
                 SUM(s.cantidad) FILTER (
                   WHERE s.cantidad::text NOT IN ('NaN','Infinity','-Infinity')
                 )::float8 AS cantidad,
                 COUNT(*) FILTER (
                   WHERE s.cantidad IS NULL OR s.cantidad::text IN ('NaN','Infinity','-Infinity')
                 )::int AS invalidas
          FROM public.salida s
          WHERE EXISTS (
            SELECT 1 FROM ventanas v
            WHERE (
              s.unidad_origen_id = v."almacenId"
              OR NOT EXISTS (
                SELECT 1 FROM public.unidad_medica u WHERE u.id = s.unidad_origen_id
              )
            )
              AND (
                (s.fecha_entregado >= v.desde AND s.fecha_entregado < LEAST(v.hasta, $3::date) + 1)
                OR (s.fecha_entregado IS NULL AND s.unidad_origen_id = v."almacenId")
              )
          )
          GROUP BY s.fecha_entregado::date, s.unidad_origen_id, s.unidad_destino_id,
                   ${normalizarClaveSql('s.clave_cnis')}
        )
        SELECT d.dia::text, o.id AS origen, d.destino, d.clave, d.cantidad, d.invalidas
        FROM diario d
        LEFT JOIN public.unidad_medica o ON o.id = d.origen
        WHERE d.destino = ANY($2::int[])
      `, [JSON.stringify(ventanas), idsUnidad, corte]) : { rows: [] };
      const salidasSas = salidaResult.rows.flatMap((row: any) => {
        const unidad = unidadesPorId.get(Number(row.destino));
        return unidad && unidad.unico && row.origen && row.dia && row.clave && Number.isFinite(Number(row.cantidad))
          ? [{ clues: unidad.clues, clave: String(row.clave), cantidad: Number(row.cantidad) }]
          : [];
      });
      const cantidadesInvalidasSas = salidaResult.rows.reduce(
        (sum: number, row: any) => sum + Number(row.invalidas ?? 0), 0
      );
      const conciliacion = conciliarNecesidadesConSas(
        necesidadesGenerales, necesidadesProgramaticas, salidasSas
      );

      const seleccion = clasificacion.clasificadas.filter(item =>
        item.vertiente === vertiente && (!programa || item.programa === programa)
      );
      const solicitudIdsPorDestino = new Map<string, Set<string>>();
      for (const item of necesidadesProgramaticas) {
        const propietario = item.vertiente === 'APS' ? 'APS' : `PP:${item.programa ?? 'SIN_REFERENCIA'}`;
        const id = JSON.stringify([item.clues, item.clave, propietario]);
        const solicitudes = solicitudIdsPorDestino.get(id) ?? new Set<string>();
        solicitudes.add(item.solicitudId);
        solicitudIdsPorDestino.set(id, solicitudes);
      }
      const filasSeleccionadas = conciliacion.filas.filter(item =>
        item.vertiente === vertiente && (!programa || item.programa === programa)
      );
      const dataCompleta: AbastoProgramasNecesidadRow[] = filasSeleccionadas.flatMap(item => {
        const unidad = unidadPorClues.get(item.clues);
        if (!unidad) return [];
        const propietario = item.vertiente === 'APS' ? 'APS' : `PP:${item.programa ?? 'SIN_REFERENCIA'}`;
        return [{
          jurisdiccion: unidad.jurisdiccion, municipio: unidad.municipio, unidad: unidad.unidad,
          clues: unidad.clues, vertiente: item.vertiente, programa: item.programa,
          programaNombre: item.programaNombre, clave: item.clave,
          descripcion: descripciones.get(item.clave) ?? null, cantidad: item.cantidad,
          evidencia: item.evidencia,
          solicitudes: solicitudIdsPorDestino.get(JSON.stringify([item.clues, item.clave, propietario]))?.size ?? 0,
          surtidoSas: item.surtidoSas, pendiente: item.pendiente, excedente: item.excedente,
          cobertura: item.cobertura, relacionSurtidoSolicitado: item.relacionSurtidoSolicitado,
          atribucionSas: item.atribucionSas,
        }];
      }).sort((a, b) => b.cantidad - a.cantidad || a.unidad.localeCompare(b.unidad) || a.clave.localeCompare(b.clave));
      const offset = (page - 1) * pageSize;
      const data = dataCompleta.slice(offset, offset + pageSize);
      const unidadesSolicitantes = new Set(seleccion.map(item => {
        const cabecera = cabeceraPorId.get(item.solicitudId);
        return cabecera?.clues;
      }).filter(Boolean)).size;
      const cantidadRegistrada = seleccion.filter(item => item.evidencia === 'REGISTRADA')
        .reduce((sum, item) => sum + item.cantidad, 0);
      const cantidadInferida = seleccion.filter(item => item.evidencia === 'INFERIDA')
        .reduce((sum, item) => sum + item.cantidad, 0);
      const atribuibles = filasSeleccionadas.filter(item => item.atribucionSas === 'EXCLUSIVA');
      const necesidadAtribuible = atribuibles.reduce((sum, item) => sum + item.cantidad, 0);
      const surtidoAtribuido = atribuibles.reduce((sum, item) => sum + (item.surtidoSas ?? 0), 0);
      const pendienteAtribuible = atribuibles.reduce((sum, item) => sum + (item.pendiente ?? 0), 0);
      const excedenteAtribuible = atribuibles.reduce((sum, item) => sum + (item.excedente ?? 0), 0);
      const cantidadCubierta = atribuibles.reduce(
        (sum, item) => sum + Math.min(Math.max(item.surtidoSas ?? 0, 0), item.cantidad), 0
      );
      const compartidasSeleccionadas = conciliacion.compartidas.filter(item =>
        item.destinos.some(destino => destino.vertiente === vertiente && (!programa || destino.programa === programa))
      ).flatMap(item => {
        const unidad = unidadPorClues.get(item.clues);
        return unidad ? [{
          ...item, jurisdiccion: unidad.jurisdiccion, municipio: unidad.municipio,
          unidad: unidad.unidad, descripcion: descripciones.get(item.clave) ?? null,
        }] : [];
      }).sort((a, b) => b.necesidadTotal - a.necesidadTotal || a.unidad.localeCompare(b.unidad));
      const distribucionMap = new Map<string, { codigo: string; nombre: string; cantidad: number; claves: Set<string>; unidades: Set<string> }>();
      if (vertiente === 'PROGRAMAS_PREVENTIVOS') {
        for (const item of seleccion) {
          const codigo = item.programa ?? 'SIN_REFERENCIA';
          const actual = distribucionMap.get(codigo) ?? {
            codigo, nombre: item.programaNombre ?? codigo, cantidad: 0,
            claves: new Set<string>(), unidades: new Set<string>(),
          };
          actual.cantidad += item.cantidad;
          actual.claves.add(item.clave);
          const cabecera = cabeceraPorId.get(item.solicitudId);
          if (cabecera) actual.unidades.add(cabecera.clues);
          distribucionMap.set(codigo, actual);
        }
      }

      await client.query('COMMIT');
      return {
        mode: 'necesidades-abasto-programas' as const,
        periodo: { modalidad, mes, desde, hasta, corte },
        filtros: { jurisdiccion, municipio, clues, vertiente, programa },
        resumen: {
          unidadesSolicitantes,
          clavesDistintas: new Set(seleccion.map(item => item.clave)).size,
          cantidadTotal: seleccion.reduce((sum, item) => sum + item.cantidad, 0),
          cantidadRegistrada,
          cantidadInferida,
          totalHistoricoGeneral: clasificacion.totalGeneral,
          cantidadProgramaticaGeneral: clasificacion.cantidadProgramatica,
          cantidadFueraAnalisisProgramatico: Math.max(0, clasificacion.totalGeneral - clasificacion.cantidadProgramatica),
          necesidadAtribuible,
          surtidoAtribuido,
          pendienteAtribuible,
          excedenteAtribuible,
          coberturaOperativa: necesidadAtribuible > 0 ? 100 * cantidadCubierta / necesidadAtribuible : null,
          relacionSurtidoSolicitado: necesidadAtribuible > 0 ? 100 * surtidoAtribuido / necesidadAtribuible : null,
          casosCompartidos: compartidasSeleccionadas.length,
        },
        calidad: {
          cantidadClaveRegistrada: clasificacion.cantidadClaveRegistrada,
          cantidadAmbigua: clasificacion.cantidadAmbigua,
          cantidadSinCoincidencia: clasificacion.cantidadSinCoincidencia,
          diferenciasContexto: clasificacion.diferenciasContexto,
          cantidadesInvalidasSas,
          salidasSinNecesidad: conciliacion.salidasSinNecesidad.length,
          cantidadSalidasSinNecesidad: conciliacion.salidasSinNecesidad.reduce(
            (sum, item) => sum + item.cantidad, 0
          ),
        },
        ventanasSas: ventanas,
        almacenes: almacenesRows.map(almacen => ({
          id: almacen.id, nombre: almacen.nombre, zona: almacen.zonas[0],
        })),
        compartidas: compartidasSeleccionadas,
        distribucionProgramas: Array.from(distribucionMap.values()).map(item => ({
          codigo: item.codigo, nombre: item.nombre, cantidad: item.cantidad,
          claves: item.claves.size, unidades: item.unidades.size,
        })).sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre)),
        catalogos: {
          jurisdicciones: Array.from(new Set(catalogoUnidades.map(item => item.jurisdiccion))).sort(),
          municipios: Array.from(new Set(catalogoUnidades.map(item => item.municipio))).sort(),
          unidades: catalogoUnidades.map(({ clues, unidad, municipio, jurisdiccion }) => ({
            clues, unidad, municipio, jurisdiccion,
          })),
          programas: programasCatalogo,
        },
        page, pageSize, total: dataCompleta.length, data,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
