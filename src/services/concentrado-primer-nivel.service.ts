import { pool } from '../db/pool';
import { parseIntSafe } from '../helpers/helper';
import {
  ConcentradoPrimerNivelInput,
  ConcentradoPrimerNivelRow,
} from '../models/solicitudes/primer-nivel/ConcentradoPrimerNivel';
import { OrigenCapturaPrimerNivel } from '../models/solicitudes/primer-nivel/ContextoCapturaPrimerNivel';

const ORIGENES: OrigenCapturaPrimerNivel[] = ['APS', 'PROGRAMA_PREVENTIVO', 'CLAVE'];

function texto(value: unknown, max = 200): string {
  return String(value ?? '').trim().slice(0, max);
}

function fecha(value: unknown): string | null {
  if (!value) return null;
  return (value as any)?.toISOString?.().slice(0, 10) ?? String(value).slice(0, 10);
}

export default class ConcentradoPrimerNivelService {
  async consultar(input: ConcentradoPrimerNivelInput) {
    const months = Math.min(12, Math.max(1, parseIntSafe(input.months, 3)));
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
