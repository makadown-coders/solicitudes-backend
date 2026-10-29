import { pool } from '../db/pool';
import { parseIntSafe } from '../helpers/helper';
import {
  ConcentradoPrimerNivelInput,
  ConcentradoPrimerNivelRow,
  MatrizDistribucionPrimerNivelResponse,
  MatrizDistribucionPrimerNivelRow,
  MatrizDistribucionPrimerNivelUnidad,
} from '../models/solicitudes/primer-nivel/ConcentradoPrimerNivel';
import { OrigenCapturaPrimerNivel } from '../models/solicitudes/primer-nivel/ContextoCapturaPrimerNivel';
import {
  JURISDICCIONES_DISTRIBUCION,
  JurisdiccionDistribucion,
  RUTAS_PRIMER_NIVEL_PROVISIONALES,
  RUTA_SIN_ASIGNAR,
} from '../config/rutas-primer-nivel.provisional';

const ORIGENES: OrigenCapturaPrimerNivel[] = ['APS', 'PROGRAMA_PREVENTIVO', 'CLAVE'];

function texto(value: unknown, max = 200): string {
  return String(value ?? '').trim().slice(0, max);
}

function fecha(value: unknown): string | null {
  if (!value) return null;
  return (value as any)?.toISOString?.().slice(0, 10) ?? String(value).slice(0, 10);
}

function normalizarClaveMatriz(value: unknown): string {
  const clave = String(value ?? '').trim().toUpperCase();
  return /^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$/.test(clave)
    ? clave.replace(/\.[0-9]{2}$/, '')
    : clave;
}

function clasificarTipoInsumo(clave: string, categoria: unknown): 'MED' | 'MC' | null {
  const prefijo = clave.split('.')[0];
  if (['060', '070', '080', '160', '180', '200', '204', '254', '311', '531', '537'].includes(prefijo)) {
    return 'MC';
  }
  const categoriaNormalizada = String(categoria ?? '').trim().toUpperCase();
  if (categoriaNormalizada.includes('MEDICAMENTO')) return 'MED';
  if (categoriaNormalizada.includes('MATERIAL') && categoriaNormalizada.includes('CURACI')) return 'MC';
  if (prefijo === '010') return 'MED';
  return null;
}

export default class ConcentradoPrimerNivelService {
  async matrizDistribucion(monthsInput: unknown): Promise<MatrizDistribucionPrimerNivelResponse> {
    const months = Math.min(12, Math.max(1, parseIntSafe(monthsInput, 1)));
    const cluesConfiguradas = RUTAS_PRIMER_NIVEL_PROVISIONALES.flatMap(ruta => [...ruta.clues]);

    const [agregado, catalogoUnidades, existenciasAlmacenes] = await Promise.all([
      pool.query(`
        WITH unidades AS (
          SELECT um.id,
                 UPPER(TRIM(um.cluesimb)) AS cluesimb,
                 MAX(um.nombre) AS unidad,
                 MAX(vumd.tipo_unidad) AS tipo_unidad,
                 CASE
                   WHEN UPPER(TRIM(um.cluesimb)) = 'BCIMB000133' THEN 'MEXICALI'
                   WHEN UPPER(TRIM(MAX(vumd.nombre_municipio))) IN ('TIJUANA', 'TECATE', 'PLAYAS DE ROSARITO') THEN 'TIJUANA'
                   WHEN UPPER(TRIM(MAX(vumd.nombre_municipio))) IN ('MEXICALI', 'SAN FELIPE') THEN 'MEXICALI'
                   WHEN UPPER(TRIM(MAX(vumd.nombre_municipio))) LIKE 'SAN QUINT%'
                     OR UPPER(TRIM(MAX(vumd.nombre_municipio))) = 'ENSENADA' THEN 'ENSENADA'
                   ELSE UPPER(TRIM(MAX(vumd.nombre_municipio)))
                 END AS jurisdiccion
          FROM public.unidad_medica um
          LEFT JOIN public.v_unidad_medica_detalle vumd ON vumd.id = um.id
          WHERE NULLIF(UPPER(TRIM(um.cluesimb)), '') IS NOT NULL
          GROUP BY um.id, UPPER(TRIM(um.cluesimb))
        ),
        unidades_primer_nivel AS (
          SELECT *
          FROM unidades
          WHERE jurisdiccion IN ('ENSENADA', 'MEXICALI', 'TIJUANA')
            AND COALESCE(UPPER(TRIM(tipo_unidad)), '') NOT LIKE '%HOSPITAL%'
            AND COALESCE(UPPER(TRIM(tipo_unidad)), '') NOT LIKE '%ALMACEN%'
            AND COALESCE(UPPER(TRIM(tipo_unidad)), '') NOT LIKE '%OFICINA%'
            AND COALESCE(UPPER(TRIM(tipo_unidad)), '') NOT LIKE '%ADMINISTRATIV%'
        ),
        solicitudes_periodo AS (
          SELECT s.id, u.cluesimb, u.unidad, u.jurisdiccion
          FROM public.solicitud_bitacora s
          JOIN unidades_primer_nivel u ON u.cluesimb = UPPER(TRIM(s.cluesimb))
          WHERE s.created_day BETWEEN CURRENT_DATE - make_interval(months => $1::int) AND CURRENT_DATE
        ),
        capturas AS (
          SELECT sp.cluesimb, sp.unidad, sp.jurisdiccion,
                 CASE
                   WHEN UPPER(TRIM(c.clave)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                     THEN REGEXP_REPLACE(UPPER(TRIM(c.clave)), '\.[0-9]{2}$', '')
                   ELSE UPPER(TRIM(c.clave))
                 END AS clave,
                 c.cantidad_capturada::numeric AS piezas
          FROM solicitudes_periodo sp
          JOIN public.solicitud_primer_nivel_contexto c ON c.solicitud_id = sp.id
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.v_solicitud_primer_nivel_clave_excluida ex
            WHERE ex.clave = UPPER(TRIM(c.clave))
          )

          UNION ALL

          SELECT sp.cluesimb, sp.unidad, sp.jurisdiccion,
                 CASE
                   WHEN UPPER(TRIM(d.clave)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                     THEN REGEXP_REPLACE(UPPER(TRIM(d.clave)), '\.[0-9]{2}$', '')
                   ELSE UPPER(TRIM(d.clave))
                 END AS clave,
                 d.cantidad::numeric AS piezas
          FROM solicitudes_periodo sp
          JOIN public.solicitud_bitacora_detalle d ON d.solicitud_id = sp.id
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.solicitud_primer_nivel_contexto c
            WHERE c.solicitud_id = sp.id
          )
            AND NOT EXISTS (
              SELECT 1
              FROM public.v_solicitud_primer_nivel_clave_excluida ex
              WHERE ex.clave = UPPER(TRIM(d.clave))
            )
        ),
        insumos AS (
          SELECT DISTINCT ON (CASE
                   WHEN UPPER(TRIM(i.clave)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                     THEN REGEXP_REPLACE(UPPER(TRIM(i.clave)), '\.[0-9]{2}$', '')
                   ELSE UPPER(TRIM(i.clave))
                 END)
                 CASE
                   WHEN UPPER(TRIM(i.clave)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                     THEN REGEXP_REPLACE(UPPER(TRIM(i.clave)), '\.[0-9]{2}$', '')
                   ELSE UPPER(TRIM(i.clave))
                 END AS clave,
                 NULLIF(REGEXP_REPLACE(TRIM(i.descripcion), '[[:space:]]+', ' ', 'g'), '') AS descripcion,
                 NULLIF(REGEXP_REPLACE(TRIM(i.nombre), '[[:space:]]+', ' ', 'g'), '') AS nombre,
                 NULLIF(TRIM(i.categoria), '') AS categoria
          FROM cnis.insumo i
          ORDER BY CASE
                     WHEN UPPER(TRIM(i.clave)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                       THEN REGEXP_REPLACE(UPPER(TRIM(i.clave)), '\.[0-9]{2}$', '')
                     ELSE UPPER(TRIM(i.clave))
                   END,
                   i.activo DESC, i.id DESC
        ),
        articulos_fallback AS (
          SELECT DISTINCT ON (CASE
                   WHEN UPPER(TRIM(a.clave)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                     THEN REGEXP_REPLACE(UPPER(TRIM(a.clave)), '\.[0-9]{2}$', '')
                   ELSE UPPER(TRIM(a.clave))
                 END)
                 CASE
                   WHEN UPPER(TRIM(a.clave)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                     THEN REGEXP_REPLACE(UPPER(TRIM(a.clave)), '\.[0-9]{2}$', '')
                   ELSE UPPER(TRIM(a.clave))
                 END AS clave,
                 NULLIF(REGEXP_REPLACE(TRIM(a.descripcion), '[[:space:]]+', ' ', 'g'), '') AS descripcion,
                 NULLIF(TRIM(a.categoria), '') AS categoria
          FROM public.articulos a
          WHERE NULLIF(UPPER(TRIM(a.clave)), '') IS NOT NULL
          ORDER BY CASE
                     WHEN UPPER(TRIM(a.clave)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                       THEN REGEXP_REPLACE(UPPER(TRIM(a.clave)), '\.[0-9]{2}$', '')
                     ELSE UPPER(TRIM(a.clave))
                   END,
                   CASE WHEN UPPER(TRIM(COALESCE(a.activo, ''))) IN ('1', 'TRUE', 'ACTIVO', 'SI', 'SÍ') THEN 0 ELSE 1 END,
                   a.id DESC
        )
        SELECT c.jurisdiccion, c.cluesimb, MAX(c.unidad) AS unidad, c.clave,
               COALESCE(MAX(i.descripcion), MAX(af.descripcion), MAX(i.nombre)) AS descripcion,
               CASE
                 WHEN SPLIT_PART(c.clave, '.', 1) IN (
                   '060', '070', '080', '160', '180', '200', '204', '254', '311', '531', '537'
                 ) THEN 'MC'
                 WHEN UPPER(COALESCE(MAX(i.categoria), MAX(af.categoria), '')) LIKE '%MEDICAMENTO%' THEN 'MED'
                 WHEN UPPER(COALESCE(MAX(i.categoria), MAX(af.categoria), '')) LIKE '%MATERIAL%CURACI%' THEN 'MC'
                 WHEN SPLIT_PART(c.clave, '.', 1) = '010' THEN 'MED'
                 ELSE NULL
               END AS tipo_insumo,
               COALESCE(SUM(c.piezas), 0)::numeric AS piezas
        FROM capturas c
        LEFT JOIN insumos i ON i.clave = c.clave
        LEFT JOIN articulos_fallback af ON af.clave = c.clave
        GROUP BY c.jurisdiccion, c.cluesimb, c.clave
        HAVING COALESCE(SUM(c.piezas), 0) > 0
        ORDER BY c.jurisdiccion, c.clave, c.cluesimb
      `, [months]),
      pool.query(`
        SELECT DISTINCT ON (UPPER(TRIM(um.cluesimb)))
               UPPER(TRIM(um.cluesimb)) AS cluesimb,
               um.nombre AS unidad
        FROM public.unidad_medica um
        WHERE UPPER(TRIM(um.cluesimb)) = ANY($1::text[])
        ORDER BY UPPER(TRIM(um.cluesimb)), um.activo DESC, um.id
      `, [cluesConfiguradas]),
      pool.query(`
        SELECT CASE
                 WHEN UPPER(TRIM(t.clave_cnis)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                   THEN REGEXP_REPLACE(UPPER(TRIM(t.clave_cnis)), '\.[0-9]{2}$', '')
                 ELSE UPPER(TRIM(t.clave_cnis))
               END AS clave,
               COALESCE(SUM(t.existencia) FILTER (
                 WHERE UPPER(CONCAT_WS(' ', vumd.nombre_de_unidad, vumd.nombre_municipio, vumd.alias_sas, vumd.cluesimb))
                   SIMILAR TO '%(MEXICALI|AZM)%'
               ), 0)::numeric AS existencia_azm,
               COALESCE(SUM(t.existencia) FILTER (
                 WHERE UPPER(CONCAT_WS(' ', vumd.nombre_de_unidad, vumd.nombre_municipio, vumd.alias_sas, vumd.cluesimb))
                   SIMILAR TO '%(TIJUANA|AZT)%'
               ), 0)::numeric AS existencia_azt,
               COALESCE(SUM(t.existencia) FILTER (
                 WHERE UPPER(CONCAT_WS(' ', vumd.nombre_de_unidad, vumd.nombre_municipio, vumd.alias_sas, vumd.cluesimb))
                   SIMILAR TO '%(ENSENADA|AZE)%'
               ), 0)::numeric AS existencia_aze,
               MAX(t.cargado_en) AS snapshot_existencias
        FROM public.tmp_existencias t
        JOIN public.v_unidad_medica_detalle vumd
          ON UPPER(TRIM(vumd.cluesimb)) = UPPER(TRIM(t.cluesimb))
        WHERE vumd.tipo_unidad = 'ALMACENES'
          AND NULLIF(UPPER(TRIM(t.clave_cnis)), '') IS NOT NULL
        GROUP BY CASE
                   WHEN UPPER(TRIM(t.clave_cnis)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                     THEN REGEXP_REPLACE(UPPER(TRIM(t.clave_cnis)), '\.[0-9]{2}$', '')
                   ELSE UPPER(TRIM(t.clave_cnis))
                 END
      `),
    ]);

    const unidadesCatalogo = new Map<string, string>(catalogoUnidades.rows.map(row => [
      String(row.cluesimb), String(row.unidad ?? row.cluesimb),
    ]));
    const asignacion = new Map<string, { jurisdiccion: JurisdiccionDistribucion; ruta: number; ordenUnidad: number }>();
    const unidades: MatrizDistribucionPrimerNivelUnidad[] = [];

    for (const ruta of RUTAS_PRIMER_NIVEL_PROVISIONALES) {
      ruta.clues.forEach((cluesimb, ordenUnidad) => {
        asignacion.set(cluesimb, { jurisdiccion: ruta.jurisdiccion, ruta: ruta.ruta, ordenUnidad });
        unidades.push({
          jurisdiccion: ruta.jurisdiccion,
          cluesimb,
          unidad: unidadesCatalogo.get(cluesimb) ?? cluesimb,
          ruta: String(ruta.ruta),
          ordenRuta: ruta.ruta,
          ordenUnidad,
          esRutaProvisional: true,
        });
      });
    }

    const data: MatrizDistribucionPrimerNivelRow[] = agregado.rows.map(row => {
      const cluesimb = String(row.cluesimb ?? '');
      const configurada = asignacion.get(cluesimb);
      return {
        jurisdiccion: configurada?.jurisdiccion ?? row.jurisdiccion,
        cluesimb,
        clave: String(row.clave ?? ''),
        descripcion: row.descripcion ?? null,
        tipoInsumo: row.tipo_insumo === 'MED' || row.tipo_insumo === 'MC' ? row.tipo_insumo : null,
        piezas: Number(row.piezas ?? 0),
      };
    });

    const existenciasPorClave = new Map(existenciasAlmacenes.rows.map(row => [String(row.clave), row]));
    const clavesSolicitadas = [...new Set(data.map(row => row.clave))];
    const alternativas = clavesSolicitadas.length ? await pool.query(`
      SELECT UPPER(TRIM(h.clave)) AS clave,
             UPPER(TRIM(h.sustituto)) AS candidato,
             h.factor::numeric AS factor
      FROM public.homologos h
      WHERE UPPER(TRIM(h.clave)) = ANY($1::text[])
        AND NULLIF(UPPER(TRIM(h.sustituto)), '') IS NOT NULL
        AND h.factor::numeric > 0
        AND NOT EXISTS (
          SELECT 1
          FROM public.v_solicitud_primer_nivel_clave_excluida ex
          WHERE ex.clave = UPPER(TRIM(h.sustituto))
        )
      UNION
      SELECT UPPER(TRIM(h.sustituto)) AS clave,
             UPPER(TRIM(h.clave)) AS candidato,
             1 / NULLIF(h.factor::numeric, 0) AS factor
      FROM public.homologos h
      WHERE UPPER(TRIM(h.sustituto)) = ANY($1::text[])
        AND NULLIF(UPPER(TRIM(h.clave)), '') IS NOT NULL
        AND h.factor::numeric > 0
        AND NOT EXISTS (
          SELECT 1
          FROM public.v_solicitud_primer_nivel_clave_excluida ex
          WHERE ex.clave = UPPER(TRIM(h.clave))
        )
    `, [clavesSolicitadas]) : { rows: [] as any[] };
    const alternativasPorClave = new Map<string, any>();
    for (const aristaOriginal of alternativas.rows) {
      const arista = {
        ...aristaOriginal,
        clave: normalizarClaveMatriz(aristaOriginal.clave),
        candidato: normalizarClaveMatriz(aristaOriginal.candidato),
      };
      const stock = existenciasPorClave.get(String(arista.candidato));
      const factor = Number(arista.factor ?? 0);
      const existenciaAzm = Number(stock?.existencia_azm ?? 0);
      const existenciaAzt = Number(stock?.existencia_azt ?? 0);
      const existenciaAze = Number(stock?.existencia_aze ?? 0);
      const total = existenciaAzm + existenciaAzt + existenciaAze;
      if (factor <= 0 || total <= 0) continue;
      const candidata = {
        ...arista,
        existencia_azm: existenciaAzm,
        existencia_azt: existenciaAzt,
        existencia_aze: existenciaAze,
        cobertura_equivalente: total / factor,
      };
      const clave = String(arista.clave);
      const actual = alternativasPorClave.get(clave);
      if (!actual
        || candidata.cobertura_equivalente > actual.cobertura_equivalente
        || (candidata.cobertura_equivalente === actual.cobertura_equivalente
          && String(candidata.candidato).localeCompare(String(actual.candidato)) < 0)) {
        alternativasPorClave.set(clave, candidata);
      }
    }

    const clavesAlternativas = [...new Set([...alternativasPorClave.values()]
      .map(item => String(item.candidato)))];
    const catalogoAlternativas = clavesAlternativas.length ? await pool.query(`
      WITH claves AS (
        SELECT UNNEST($1::text[]) AS clave
      )
      SELECT c.clave,
             COALESCE(i.descripcion, af.descripcion, i.nombre) AS descripcion,
             COALESCE(i.categoria, af.categoria) AS categoria
      FROM claves c
      LEFT JOIN LATERAL (
        SELECT NULLIF(REGEXP_REPLACE(TRIM(x.descripcion), '[[:space:]]+', ' ', 'g'), '') AS descripcion,
               NULLIF(REGEXP_REPLACE(TRIM(x.nombre), '[[:space:]]+', ' ', 'g'), '') AS nombre,
               NULLIF(TRIM(x.categoria), '') AS categoria
        FROM cnis.insumo x
        WHERE CASE
                WHEN UPPER(TRIM(x.clave)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                  THEN REGEXP_REPLACE(UPPER(TRIM(x.clave)), '\.[0-9]{2}$', '')
                ELSE UPPER(TRIM(x.clave))
              END = c.clave
        ORDER BY x.activo DESC, x.id DESC
        LIMIT 1
      ) i ON true
      LEFT JOIN LATERAL (
        SELECT NULLIF(REGEXP_REPLACE(TRIM(x.descripcion), '[[:space:]]+', ' ', 'g'), '') AS descripcion,
               NULLIF(TRIM(x.categoria), '') AS categoria
        FROM public.articulos x
        WHERE CASE
                WHEN UPPER(TRIM(x.clave)) ~ '^311\.[0-9]{3}\.[0-9]{4}\.[0-9]{2}$'
                  THEN REGEXP_REPLACE(UPPER(TRIM(x.clave)), '\.[0-9]{2}$', '')
                ELSE UPPER(TRIM(x.clave))
              END = c.clave
        ORDER BY x.id DESC
        LIMIT 1
      ) af ON true
    `, [clavesAlternativas]) : { rows: [] as any[] };
    const catalogoAlternativasPorClave = new Map(catalogoAlternativas.rows.map(row => [String(row.clave), row]));

    const adicionales = new Map<string, { jurisdiccion: JurisdiccionDistribucion; unidad: string }>();
    for (const row of agregado.rows) {
      const cluesimb = String(row.cluesimb ?? '');
      if (!asignacion.has(cluesimb) && JURISDICCIONES_DISTRIBUCION.includes(row.jurisdiccion)) {
        adicionales.set(cluesimb, { jurisdiccion: row.jurisdiccion, unidad: String(row.unidad ?? cluesimb) });
      }
    }
    for (const jurisdiccion of JURISDICCIONES_DISTRIBUCION) {
      [...adicionales.entries()]
        .filter(([, item]) => item.jurisdiccion === jurisdiccion)
        .sort((a, b) => a[1].unidad.localeCompare(b[1].unidad, 'es') || a[0].localeCompare(b[0]))
        .forEach(([cluesimb, item], ordenUnidad) => unidades.push({
          jurisdiccion,
          cluesimb,
          unidad: item.unidad,
          ruta: RUTA_SIN_ASIGNAR,
          ordenRuta: 999,
          ordenUnidad,
          esRutaProvisional: false,
        }));
    }

    unidades.sort((a, b) =>
      JURISDICCIONES_DISTRIBUCION.indexOf(a.jurisdiccion) - JURISDICCIONES_DISTRIBUCION.indexOf(b.jurisdiccion)
      || a.ordenRuta - b.ordenRuta
      || a.ordenUnidad - b.ordenUnidad
      || a.cluesimb.localeCompare(b.cluesimb)
    );

    return {
      mode: 'matriz-distribucion-primer-nivel',
      window: { months },
      generadoEn: new Date().toISOString(),
      snapshotExistencias: fecha(existenciasAlmacenes.rows.reduce<Date | null>((maximo, row) => {
        const actual = row.snapshot_existencias ? new Date(row.snapshot_existencias) : null;
        return actual && (!maximo || actual > maximo) ? actual : maximo;
      }, null)),
      unidades,
      data,
      existenciasAlmacenes: clavesSolicitadas.map(clave => {
        const row = existenciasPorClave.get(clave);
        const alternativa = alternativasPorClave.get(clave);
        return {
          clave,
          existenciaAzm: Number(row?.existencia_azm ?? 0),
          existenciaAzt: Number(row?.existencia_azt ?? 0),
          existenciaAze: Number(row?.existencia_aze ?? 0),
          alternativa: alternativa ? {
            clave: String(alternativa.candidato),
            descripcion: catalogoAlternativasPorClave.get(String(alternativa.candidato))?.descripcion ?? null,
            tipoInsumo: clasificarTipoInsumo(
              String(alternativa.candidato),
              catalogoAlternativasPorClave.get(String(alternativa.candidato))?.categoria
            ),
            factor: Number(alternativa.factor),
            existenciaAzm: Number(alternativa.existencia_azm ?? 0),
            existenciaAzt: Number(alternativa.existencia_azt ?? 0),
            existenciaAze: Number(alternativa.existencia_aze ?? 0),
            coberturaEquivalente: Number(alternativa.cobertura_equivalente ?? 0),
          } : null,
        };
      }),
    };
  }

  async consultar(input: ConcentradoPrimerNivelInput) {
    const months = Math.min(12, Math.max(1, parseIntSafe(input.months, 1)));
    const page = Math.max(1, parseIntSafe(input.page, 1));
    const pageSize = Math.min(input.export ? 50000 : 200, Math.max(1, parseIntSafe(input.pageSize, 25)));
    const offset = (page - 1) * pageSize;
    const jurisdiccion = texto(input.jurisdiccion, 40).toUpperCase();
    const clues = texto(input.clues, 30).toUpperCase();
    const origenInput = texto(input.origen, 40).toUpperCase() as OrigenCapturaPrimerNivel;
    const origen = ORIGENES.includes(origenInput) ? origenInput : '';
    const referencia = texto(input.referencia, 100).toUpperCase();
    const search = texto(input.search).toUpperCase();

    const { rows } = await pool.query(`
      WITH unidades_detalle AS (
        SELECT um.id,
               UPPER(TRIM(um.cluesimb)) AS cluesimb,
               um.nombre AS unidad,
               MAX(vumd.tipo_unidad) AS tipo_unidad,
               CASE
                 WHEN UPPER(TRIM(um.cluesimb)) = 'BCIMB000133' THEN 'MEXICALI'
                 WHEN UPPER(TRIM(MAX(vumd.nombre_municipio))) IN ('TIJUANA', 'TECATE', 'PLAYAS DE ROSARITO') THEN 'TIJUANA'
                 WHEN UPPER(TRIM(MAX(vumd.nombre_municipio))) IN ('MEXICALI', 'SAN FELIPE') THEN 'MEXICALI'
                 WHEN UPPER(TRIM(MAX(vumd.nombre_municipio))) IN ('ENSENADA', 'SAN QUINTIN', 'SAN QUINTÍN') THEN 'ENSENADA'
                 ELSE UPPER(TRIM(MAX(vumd.nombre_municipio)))
               END AS jurisdiccion
        FROM public.unidad_medica um
        LEFT JOIN public.v_unidad_medica_detalle vumd ON vumd.id = um.id
        WHERE um.activo = true
          AND NULLIF(UPPER(TRIM(um.cluesimb)), '') IS NOT NULL
        GROUP BY um.id, UPPER(TRIM(um.cluesimb)), um.nombre
      ),
      centros AS (
        SELECT * FROM unidades_detalle
        WHERE UPPER(TRIM(tipo_unidad)) = 'CENTRO DE SALUD'
          AND ($2::text = '' OR jurisdiccion = $2)
          AND ($3::text = '' OR cluesimb = $3)
      ),
      solicitudes_periodo AS (
        SELECT s.id, UPPER(TRIM(s.cluesimb)) AS cluesimb, s.created_day
        FROM public.solicitud_bitacora s
        JOIN centros ce ON ce.cluesimb = UPPER(TRIM(s.cluesimb))
        WHERE s.created_day BETWEEN CURRENT_DATE - make_interval(months => $1::int) AND CURRENT_DATE
      ),
      capturas AS (
        SELECT sp.id AS solicitud_id, sp.cluesimb, sp.created_day,
               UPPER(TRIM(c.clave)) AS clave,
               c.origen_captura AS origen,
               NULLIF(UPPER(TRIM(c.referencia_captura)), '') AS referencia,
               c.cantidad_capturada::numeric AS piezas,
               false AS es_historica
        FROM solicitudes_periodo sp
        JOIN public.solicitud_primer_nivel_contexto c ON c.solicitud_id = sp.id

        UNION ALL

        SELECT sp.id AS solicitud_id, sp.cluesimb, sp.created_day,
               UPPER(TRIM(d.clave)) AS clave,
               'CLAVE'::text AS origen,
               NULL::text AS referencia,
               d.cantidad::numeric AS piezas,
               true AS es_historica
        FROM solicitudes_periodo sp
        JOIN public.solicitud_bitacora_detalle d ON d.solicitud_id = sp.id
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.solicitud_primer_nivel_contexto c
          WHERE c.solicitud_id = sp.id
        )
      ),
      contexto AS (
        SELECT c.solicitud_id, c.cluesimb, c.created_day,
               c.clave, c.origen, c.referencia, c.piezas,
               ce.unidad, ce.jurisdiccion,
               NULLIF(TRIM(i.nombre), '') AS nombre,
               NULLIF(REGEXP_REPLACE(TRIM(i.descripcion), '[[:space:]]+', ' ', 'g'), '') AS descripcion,
               COALESCE(
                 NULLIF(TRIM(am.etiqueta_usuario), ''),
                 NULLIF(TRIM(pp.nombre), ''),
                 CASE c.origen
                   WHEN 'CLAVE' THEN CASE
                     WHEN c.es_historica THEN 'Captura histórica por clave'
                     ELSE 'Captura por clave CNIS'
                   END
                   ELSE NULLIF(TRIM(c.referencia), '')
                 END,
                 'Referencia no disponible'
               ) AS etiqueta_referencia
        FROM capturas c
        JOIN centros ce ON ce.cluesimb = c.cluesimb
        LEFT JOIN cnis.insumo i ON i.activo = true AND UPPER(TRIM(i.clave)) = UPPER(TRIM(c.clave))
        LEFT JOIN aps.medicamento am
          ON c.origen = 'APS' AND am.codigo = UPPER(TRIM(c.referencia))
        LEFT JOIN preventivos.programa pp
          ON c.origen = 'PROGRAMA_PREVENTIVO' AND pp.codigo = UPPER(TRIM(c.referencia))
      ),
      filtrado AS (
        SELECT * FROM contexto
        WHERE ($4::text = '' OR origen = $4)
          AND ($5::text = '' OR referencia = $5)
          AND ($6::text = '' OR cluesimb ILIKE '%' || $6 || '%'
            OR unidad ILIKE '%' || $6 || '%'
            OR clave ILIKE '%' || $6 || '%'
            OR COALESCE(nombre, '') ILIKE '%' || $6 || '%'
            OR COALESCE(descripcion, '') ILIKE '%' || $6 || '%'
            OR COALESCE(referencia, '') ILIKE '%' || $6 || '%'
            OR etiqueta_referencia ILIKE '%' || $6 || '%')
      ),
      detalle AS (
        SELECT cluesimb, unidad, jurisdiccion, clave, nombre, descripcion,
               origen, referencia, etiqueta_referencia,
               COUNT(DISTINCT solicitud_id)::int AS solicitudes,
               COALESCE(SUM(piezas), 0)::numeric AS piezas,
               MIN(created_day)::date AS primera_solicitud,
               MAX(created_day)::date AS ultima_solicitud
        FROM filtrado
        GROUP BY cluesimb, unidad, jurisdiccion, clave, nombre, descripcion,
                 origen, referencia, etiqueta_referencia
      ),
      origenes AS (
        SELECT origen,
               COUNT(DISTINCT solicitud_id)::int AS solicitudes,
               COUNT(DISTINCT cluesimb)::int AS unidades,
               COUNT(DISTINCT clave)::int AS claves,
               COALESCE(SUM(piezas), 0)::numeric AS piezas
        FROM filtrado GROUP BY origen
      ),
      referencias AS (
        SELECT origen, referencia, etiqueta_referencia,
               COUNT(DISTINCT solicitud_id)::int AS solicitudes,
               COUNT(DISTINCT cluesimb)::int AS unidades,
               COUNT(DISTINCT clave)::int AS claves,
               COALESCE(SUM(piezas), 0)::numeric AS piezas
        FROM filtrado
        WHERE origen <> 'CLAVE' AND referencia IS NOT NULL
        GROUP BY origen, referencia, etiqueta_referencia
        ORDER BY piezas DESC, solicitudes DESC, etiqueta_referencia
        LIMIT 30
      ),
      participacion AS (
        SELECT ce.cluesimb, ce.unidad, ce.jurisdiccion,
               COUNT(DISTINCT sp.id)::int AS solicitudes,
               MAX(sp.created_day)::date AS ultima_solicitud
        FROM centros ce
        LEFT JOIN solicitudes_periodo sp ON sp.cluesimb = ce.cluesimb
        GROUP BY ce.cluesimb, ce.unidad, ce.jurisdiccion
      )
      SELECT
        (SELECT COUNT(*)::int FROM detalle) AS total,
        (SELECT JSON_BUILD_OBJECT(
          'solicitudes', COUNT(DISTINCT solicitud_id),
          'unidadesParticipantes', COUNT(DISTINCT cluesimb),
          'unidadesUniverso', (SELECT COUNT(*) FROM centros),
          'unidadesSinSolicitud', (SELECT COUNT(*) FROM participacion WHERE solicitudes = 0),
          'clavesDistintas', COUNT(DISTINCT clave),
          'piezas', COALESCE(SUM(piezas), 0)
        ) FROM filtrado) AS resumen,
        COALESCE((SELECT JSON_AGG(o ORDER BY o.piezas DESC) FROM origenes o), '[]'::json) AS origenes,
        COALESCE((SELECT JSON_AGG(r) FROM referencias r), '[]'::json) AS referencias,
        COALESCE((SELECT JSON_AGG(p ORDER BY p.jurisdiccion, p.unidad, p.cluesimb)
          FROM participacion p WHERE p.solicitudes = 0), '[]'::json) AS unidades_sin_solicitud,
        COALESCE((SELECT JSON_AGG(d ORDER BY d.piezas DESC, d.ultima_solicitud DESC, d.unidad, d.clave)
          FROM (SELECT * FROM detalle ORDER BY piezas DESC, ultima_solicitud DESC, unidad, clave
                LIMIT $7 OFFSET $8) d), '[]'::json) AS data
    `, [months, jurisdiccion, clues, origen, referencia, search, pageSize, offset]);

    const result = rows[0] ?? {};
    const data: ConcentradoPrimerNivelRow[] = (result.data ?? []).map((row: any) => ({
      cluesimb: String(row.cluesimb ?? ''), unidad: String(row.unidad ?? ''),
      jurisdiccion: row.jurisdiccion ?? null, clave: String(row.clave ?? ''),
      nombre: row.nombre ?? null, descripcion: row.descripcion ?? null,
      origen: row.origen, referencia: row.referencia ?? null,
      etiquetaReferencia: String(row.etiqueta_referencia ?? ''),
      solicitudes: Number(row.solicitudes ?? 0), piezas: Number(row.piezas ?? 0),
      primeraSolicitud: fecha(row.primera_solicitud) ?? '', ultimaSolicitud: fecha(row.ultima_solicitud) ?? '',
    }));

    const resumen = result.resumen ?? {};
    return {
      mode: 'concentrado-primer-nivel' as const,
      window: { months }, page, pageSize, total: Number(result.total ?? 0),
      truncated: Boolean(input.export && Number(result.total ?? 0) > data.length),
      resumen: {
        solicitudes: Number(resumen.solicitudes ?? 0),
        unidadesParticipantes: Number(resumen.unidadesParticipantes ?? 0),
        unidadesUniverso: Number(resumen.unidadesUniverso ?? 0),
        unidadesSinSolicitud: Number(resumen.unidadesSinSolicitud ?? 0),
        clavesDistintas: Number(resumen.clavesDistintas ?? 0),
        piezas: Number(resumen.piezas ?? 0),
      },
      origenes: (result.origenes ?? []).map((row: any) => ({
        origen: row.origen, solicitudes: Number(row.solicitudes ?? 0), unidades: Number(row.unidades ?? 0),
        claves: Number(row.claves ?? 0), piezas: Number(row.piezas ?? 0),
      })),
      referencias: (result.referencias ?? []).map((row: any) => ({
        origen: row.origen, referencia: row.referencia, etiquetaReferencia: row.etiqueta_referencia,
        solicitudes: Number(row.solicitudes ?? 0), unidades: Number(row.unidades ?? 0),
        claves: Number(row.claves ?? 0), piezas: Number(row.piezas ?? 0),
      })),
      unidadesSinSolicitud: (result.unidades_sin_solicitud ?? []).map((row: any) => ({
        cluesimb: String(row.cluesimb ?? ''), unidad: String(row.unidad ?? ''),
        jurisdiccion: row.jurisdiccion ?? null, solicitudes: Number(row.solicitudes ?? 0),
        ultimaSolicitud: fecha(row.ultima_solicitud),
      })),
      data,
    };
  }
}
