import { pool } from '../db/pool';
import HomologosService from './homologos.service';
import { clasificarGrupos, clasificarInsumos, detectarCandidatos, InsumoGrupo } from './concentrado-segundo-nivel-excel';
import { Cabecera, Consulta, Detalle, Unidad, cluesAutorizadas, consolidar, seleccionarPeriodo } from './concentrado-segundo-nivel-calculo';
import { Identidad, Movimiento, Ventana, conciliarSalidas, resolverIdentidades, ventanasEfectivas } from './concentrado-segundo-nivel-sas';

const incluirTransferenciasHospitalarias = false;

async function analizarCorte(q: Consulta & { ventanas?: Ventana[] }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: [{ corte }] } = await client.query<{ corte: string }>(
      "SELECT (now() AT TIME ZONE 'America/Tijuana')::date::text AS corte",
    );
    const { desde, hasta, incluye } = seleccionarPeriodo(q, corte);
    const ventanas = ventanasEfectivas(q.ventanas, desde, hasta, corte);
    const { rows: unidades } = await client.query<Unidad>(`
      WITH catalogo AS (
        SELECT upper(trim(cluesimb)) AS clues, max(nombre_de_unidad) AS nombre,
          max(nombre_municipio) AS municipio
        FROM public.v_unidad_medica_detalle
        WHERE upper(trim(cluesimb)) = ANY($1::text[])
        GROUP BY 1 HAVING count(DISTINCT id) = 1
      )
      SELECT clues, nombre, coalesce(municipio, 'N/D') AS municipio,
        CASE
          WHEN upper(trim(municipio)) IN ('TIJUANA','TECATE','PLAYAS DE ROSARITO') THEN 'TIJUANA'
          WHEN upper(trim(municipio)) IN ('MEXICALI','SAN FELIPE') THEN 'MEXICALI'
          WHEN upper(trim(municipio)) IN ('ENSENADA','SAN QUINTIN','SAN QUINTÍN') THEN 'ENSENADA'
          ELSE 'N/D'
        END AS jurisdiccion
      FROM catalogo ORDER BY nombre, clues`, [cluesAutorizadas]);
    const { rows } = await client.query<Cabecera>(`
      SELECT id::text, upper(trim(cluesimb)) AS clues,
        (created_at AT TIME ZONE 'America/Tijuana')::date::text AS fecha,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS creada,
        periodo_texto AS periodo, tipo_pedido AS tipo, tipos_insumo AS insumos,
        payload_hash AS hash, export_kind AS clase
      FROM public.solicitud_bitacora
      WHERE upper(trim(cluesimb)) = ANY($1::text[]) AND export_kind = 'raw'
        AND tipo_pedido IN ('Ordinario', 'Extraordinario')
        AND ($2 <> 'ULTIMOS_30_DIAS' OR (
          created_at >= ($3::date::timestamp AT TIME ZONE 'America/Tijuana')
          AND created_at < (($4::date + 1)::timestamp AT TIME ZONE 'America/Tijuana')
        ))`, [unidades.map(u => u.clues), q.modalidad, desde, hasta]);
    const cabeceras = rows.filter(incluye);
    const { rows: detalle } = await client.query<Detalle>(`
      SELECT solicitud_id::text AS id, upper(trim(clave)) AS clave, cantidad::text AS cantidad
      FROM public.solicitud_bitacora_detalle
      WHERE solicitud_id = ANY($1::uuid[])`, [cabeceras.map(c => c.id)]);
    const resultado = consolidar(unidades, cabeceras, detalle);
    const { rows: catalogo } = await client.query<Identidad>(`
      WITH tipologia AS (
        SELECT id,
          bool_or(upper(trim(tipo_unidad)) = 'ALMACENES') AS almacen,
          bool_or(upper(trim(tipo_unidad)) = 'HOSPITALES'
            OR ((es_segundo_nivel OR upper(trim(nivel_atencion)) = 'SEGUNDO NIVEL')
                AND (upper(trim(tipo_unidad)) = 'UNEMES' OR upper(trim(cluesimb)) = 'BCIMB000623'))) AS hospital
        FROM public.v_unidad_medica_detalle GROUP BY id
      ), alias AS (
        SELECT unidad_medica_id, array_agg(alias_sas) FILTER (WHERE alias_sas IS NOT NULL) AS sas,
          array_agg(alias_dash) FILTER (WHERE alias_dash IS NOT NULL) AS dash
        FROM public.unidad_medica_alias GROUP BY unidad_medica_id
      )
      SELECT u.id, u.nombre, coalesce(upper(trim(u.cluesimb)), '') AS clues,
        coalesce(t.almacen, false) AS almacen, coalesce(t.hospital, false) AS hospital,
        coalesce(a.sas, '{}') AS "aliasSas", coalesce(a.dash, '{}') AS "aliasDash"
      FROM public.unidad_medica u LEFT JOIN tipologia t ON t.id = u.id
      LEFT JOIN alias a ON a.unidad_medica_id = u.id`);
    const identidades = resolverIdentidades(catalogo, unidades);
    const validas = ventanas.filter(v => v.desde <= v.hasta &&
      (incluirTransferenciasHospitalarias || v.fuente !== 'HOSPITAL'));
    const { rows: movimientos } = validas.length && identidades.destinos.size ? await client.query<Movimiento>(`
      SELECT s.id, s.fecha_entregado::text AS dia, s.unidad_origen_id AS origen,
        s.unidad_destino_id AS destino, s.unidad_origen_texto AS "origenTexto",
        s.unidad_destino_texto AS "destinoTexto", upper(trim(s.clave_cnis)) AS clave,
        s.cantidad::text AS cantidad, s.lote, s.folio, s.folio_extra AS "folioExtra"
      FROM public.salida s
      WHERE s.fecha_entregado BETWEEN $1::date AND $2::date
        AND (s.unidad_destino_id = ANY($3::int[])
          OR (upper(trim(s.unidad_destino_texto)) = ANY($4::text[])
            AND NOT EXISTS (SELECT 1 FROM public.unidad_medica u WHERE u.id = s.unidad_destino_id)))`, [
      validas.map(v => v.desde).sort()[0], validas.map(v => v.hasta).sort().at(-1),
      [...identidades.destinos], identidades.aliasDestino,
    ]) : { rows: [] };
    const { filas, incidencias } = conciliarSalidas(
      resultado.filas, unidades, movimientos, identidades, ventanas, incluirTransferenciasHospitalarias,
    );
    const claves = [...new Set(filas.map(f => f.clave).filter(Boolean))];
    const { rows: descripciones } = claves.length ? await client.query<{ clave: string; descripcion: string }>(`
      SELECT c.clave, coalesce(i.descripcion, a.descripcion, '') AS descripcion
      FROM unnest($1::text[]) AS c(clave)
      LEFT JOIN LATERAL (
        SELECT coalesce(nullif(trim(descripcion), ''), nullif(trim(nombre), '')) AS descripcion
        FROM cnis.insumo WHERE upper(trim(clave)) = c.clave
          AND coalesce(nullif(trim(descripcion), ''), nullif(trim(nombre), '')) IS NOT NULL
        ORDER BY activo DESC NULLS LAST, id DESC LIMIT 1
      ) i ON true
      LEFT JOIN LATERAL (
        SELECT min(trim(descripcion)) AS descripcion
        FROM public.articulos WHERE i.descripcion IS NULL AND upper(trim(clave)) = c.clave
          AND nullif(trim(descripcion), '') IS NOT NULL
        HAVING count(DISTINCT trim(descripcion)) = 1
      ) a ON true`, [claves]) : { rows: [] };
    const descripcionPorClave = new Map<string, string>(descripciones.map(d => [d.clave, d.descripcion] as const));
    await client.query('COMMIT');
    return {
      corte, desde, hasta, unidades, ...resultado,
      filas: filas.map(f => ({ ...f, descripcion: descripcionPorClave.get(f.clave) ?? '' })),
      ventanas, incidencias,
      almacenesPorValidar: identidades.almacenesPorValidar,
      unidadesPorValidar: cluesAutorizadas.filter(clues => !unidades.some(u => u.clues === clues)),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function analizarNecesidades(q: Consulta & { ventanas?: Ventana[] }) {
  const informe = await analizarCorte(q);
  const claves = [...new Set(informe.filas.map(f => f.clave).filter(Boolean))];
  const pendientes = [...new Set(informe.filas.filter(f => f.cantidad > 0 && f.pendiente > 0)
    .map(f => f.clave).filter(Boolean))];
  try {
    const [relaciones, { rows }] = await Promise.all([
      new HomologosService().batchForward(pendientes),
      claves.length ? pool.query<InsumoGrupo & { categoria: string }>(`
        SELECT upper(trim(i.clave)) AS clave, i.categoria,
          upper(translate(trim(i.categoria), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) = 'CATEGORIA I. MEDICAMENTOS' AS medicamento,
          coalesce(jsonb_agg(jsonb_build_object('numero', g.numero, 'nombre', g.nombre)
            ORDER BY g.numero) FILTER (WHERE g.id IS NOT NULL), '[]'::jsonb) AS grupos
        FROM cnis.insumo i
        LEFT JOIN cnis.insumo_grupo ig ON ig.insumo_id = i.id
        LEFT JOIN cnis.grupo g ON g.id = ig.grupo_id
        WHERE i.activo AND upper(trim(i.clave)) = ANY($1::text[])
        GROUP BY i.id`, [claves]) : Promise.resolve({ rows: [] }),
    ]);
    return { ...informe, enriquecimientoExcel: {
      sustituciones: detectarCandidatos(informe.filas, relaciones), grupos: clasificarGrupos(rows),
      clasificacion: clasificarInsumos(rows),
    } };
  } catch (error) {
    console.error('Error al consultar homólogos o grupos terapéuticos de Segundo Nivel', error);
    return { ...informe, enriquecimientoExcel: null };
  }
}
