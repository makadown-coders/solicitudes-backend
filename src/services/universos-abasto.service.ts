import { pool } from '../db/pool';
import {
  AnalisisOperativoAlternativa,
  AnalisisOperativoResponse,
  AnalisisOperativoSolicitud,
  ActualizarActivoResult,
  CatalogoClaveCandidataRow,
  IncorporarClaveInput,
  UniversoClaveRow,
  UniversoClavesQuery,
  UniversoUnidadRow,
} from '../models/universos-abasto.model';

export default class UniversosAbastoService {
  async listarUnidades(): Promise<UniversoUnidadRow[]> {
    const { rows } = await pool.query<UniversoUnidadRow>(`
      SELECT
        um.id,
        um.nombre,
        UPPER(TRIM(um.cluesimb)) AS cluesimb,
        UPPER(TRIM(um.cluessa)) AS cluessa,
        COUNT(*)::int AS "totalClaves"
      FROM abasto.universo_hospital_2027 u
      INNER JOIN public.unidad_medica um ON um.id = u.unidad_medica_id
      GROUP BY um.id, um.nombre, um.cluesimb, um.cluessa
      ORDER BY um.nombre
    `);
    return rows;
  }

  async obtenerUnidad(unidadId: number): Promise<UniversoUnidadRow | null> {
    const { rows } = await pool.query<UniversoUnidadRow>(`
      SELECT
        um.id,
        um.nombre,
        UPPER(TRIM(um.cluesimb)) AS cluesimb,
        UPPER(TRIM(um.cluessa)) AS cluessa,
        COUNT(*)::int AS "totalClaves"
      FROM abasto.universo_hospital_2027 u
      INNER JOIN public.unidad_medica um ON um.id = u.unidad_medica_id
      WHERE um.id = $1
      GROUP BY um.id, um.nombre, um.cluesimb, um.cluessa
    `, [unidadId]);
    return rows[0] ?? null;
  }

  async listarClaves(unidadId: number, query: UniversoClavesQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const { rows } = await pool.query<Omit<UniversoClaveRow, 'cpm'> & {
      cpm: string | number;
      totalRegistros: number;
    }>(`
      WITH cpm_unidad AS (
        SELECT
          UPPER(TRIM(clave_cnis)) AS clave,
          MAX(cpm) AS cpm,
          TRUE AS registrado
        FROM public.cpm
        WHERE unidad_medica_id = $1
        GROUP BY UPPER(TRIM(clave_cnis))
      )
      SELECT
        UPPER(TRIM(u.clave_cnis)) AS clave,
        a.descripcion,
        a.presentacion,
        u.tipo_insumo AS "tipoInsumo",
        COALESCE(c.cpm, 0) AS cpm,
        COALESCE(c.registrado, FALSE) AS "cpmRegistrado",
        u.activo,
        (a.id IS NOT NULL) AS "correspondenciaArticulo",
        COUNT(*) OVER()::int AS "totalRegistros"
      FROM abasto.universo_hospital_2027 u
      LEFT JOIN public.articulos a
        ON UPPER(TRIM(u.clave_cnis)) = UPPER(TRIM(a.clave))
      LEFT JOIN cpm_unidad c
        ON c.clave = UPPER(TRIM(u.clave_cnis))
      WHERE u.unidad_medica_id = $1
        AND (
          $2::text IS NULL
          OR UPPER(TRIM(u.clave_cnis)) ILIKE '%' || $2 || '%'
          OR COALESCE(a.descripcion, '') ILIKE '%' || $2 || '%'
        )
        AND ($3::text IS NULL OR u.tipo_insumo = $3)
        AND ($4::boolean IS NULL OR u.activo = $4)
      ORDER BY UPPER(TRIM(u.clave_cnis))
      LIMIT $5 OFFSET $6
    `, [
      unidadId,
      query.search?.trim() || null,
      query.tipoInsumo?.trim() || null,
      query.activo ?? null,
      query.pageSize,
      offset,
    ]);

    const total = rows[0]?.totalRegistros ?? 0;
    return {
      data: rows.map(({ totalRegistros: _totalRegistros, cpm, ...row }) => ({
        ...row,
        cpm: Number(cpm ?? 0),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async buscarClavesCandidatas(unidadId: number, search: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const { rows } = await pool.query<Omit<CatalogoClaveCandidataRow, 'cpm'> & {
      cpm: string | number;
      totalRegistros: number;
    }>(`
      WITH catalogo AS (
        SELECT DISTINCT ON (UPPER(TRIM(a.clave)))
          a.clave,
          a.descripcion,
          a.presentacion
        FROM public.articulos a
        WHERE NULLIF(TRIM(a.clave), '') IS NOT NULL
          AND (
            a.clave ILIKE '%' || $2 || '%'
            OR COALESCE(a.descripcion, '') ILIKE '%' || $2 || '%'
          )
        ORDER BY UPPER(TRIM(a.clave)), a.clave, a.descripcion NULLS LAST, a.presentacion NULLS LAST
      )
      , clasificacion AS (
        SELECT
          c.clave,
          COUNT(DISTINCT i.id)::int AS insumos,
          COUNT(DISTINCT i.categoria)::int AS categorias,
          MIN(i.categoria) AS categoria
        FROM catalogo c
        LEFT JOIN cnis.insumo i
          ON i.clave_normalizada = regexp_replace(TRIM(c.clave), '[^0-9]', '', 'g')
        GROUP BY c.clave
      )
      , cpm_unidad AS (
        SELECT
          UPPER(TRIM(clave_cnis)) AS clave,
          MAX(cpm) AS cpm
        FROM public.cpm
        WHERE unidad_medica_id = $1
        GROUP BY UPPER(TRIM(clave_cnis))
      )
      SELECT
        c.clave,
        c.descripcion,
        c.presentacion,
        COALESCE(cpm.cpm, 0) AS cpm,
        EXISTS (
          SELECT 1
          FROM abasto.universo_hospital_2027 u
          WHERE u.unidad_medica_id = $1
            AND UPPER(TRIM(u.clave_cnis)) = UPPER(TRIM(c.clave))
        ) AS "perteneceUniverso",
        CASE
          WHEN cl.insumos > 1 OR cl.categorias > 1 THEN 'AMBIGUA'
          WHEN cl.insumos = 0 AND TRIM(c.clave) LIKE '160.%' THEN 'MANUAL_160'
          WHEN cl.insumos = 0 THEN 'NO_DISPONIBLE'
          WHEN cl.categoria IN ('Categoria I. Medicamentos', 'Categoría II. Material de Curación') THEN 'AUTOMATICA'
          ELSE 'INCOMPATIBLE'
        END AS "clasificacionEstado",
        CASE
          WHEN cl.insumos = 1 AND cl.categoria = 'Categoria I. Medicamentos' THEN 'Medicamento'
          WHEN cl.insumos = 1 AND cl.categoria = 'Categoría II. Material de Curación' THEN 'Material de curación'
          ELSE NULL
        END AS "tipoInsumo",
        CASE
          WHEN cl.insumos > 1 OR cl.categorias > 1 THEN 'La clave tiene múltiples clasificaciones CNIS.'
          WHEN cl.insumos = 0 AND TRIM(c.clave) LIKE '160.%' THEN 'Selecciona manualmente el tipo de insumo.'
          WHEN cl.insumos = 0 THEN 'Clasificación no disponible.'
          WHEN cl.categoria NOT IN ('Categoria I. Medicamentos', 'Categoría II. Material de Curación') THEN 'La clasificación CNIS no es compatible con el universo.'
          ELSE 'Clasificación determinada por CNIS.'
        END AS "clasificacionMensaje",
        COUNT(*) OVER()::int AS "totalRegistros"
      FROM catalogo c
      INNER JOIN clasificacion cl ON cl.clave = c.clave
      LEFT JOIN cpm_unidad cpm ON cpm.clave = UPPER(TRIM(c.clave))
      ORDER BY UPPER(TRIM(c.clave))
      LIMIT $3 OFFSET $4
    `, [unidadId, search, pageSize, offset]);

    const total = rows[0]?.totalRegistros ?? 0;
    return {
      data: rows.map(({ totalRegistros: _totalRegistros, cpm, ...row }) => ({
        ...row,
        cpm: Number(cpm ?? 0),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async incorporarClave(unidadId: number, input: IncorporarClaveInput) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const unidad = await client.query<{ id: number }>(
        'SELECT id FROM public.unidad_medica WHERE id = $1',
        [unidadId],
      );
      if (!unidad.rowCount) return await this.rollbackResult(client, 'UNIDAD_NO_EXISTE');

      const articulo = await client.query<{ clave: string; descripcion: string | null; presentacion: string | null }>(`
        SELECT a.clave, a.descripcion, a.presentacion
        FROM public.articulos a
        WHERE UPPER(TRIM(a.clave)) = UPPER(TRIM($1))
        ORDER BY a.clave, a.descripcion NULLS LAST, a.presentacion NULLS LAST
        LIMIT 1
      `, [input.clave]);
      if (!articulo.rowCount) return await this.rollbackResult(client, 'CLAVE_NO_EXISTE');

      const clave = articulo.rows[0].clave;
      const duplicada = await client.query(`
        SELECT 1
        FROM abasto.universo_hospital_2027 u
        WHERE u.unidad_medica_id = $1
          AND UPPER(TRIM(u.clave_cnis)) = UPPER(TRIM($2))
        LIMIT 1
      `, [unidadId, clave]);
      if (duplicada.rowCount) return await this.rollbackResult(client, 'DUPLICADA');

      const clasificacion = await client.query<{ insumos: number; categorias: number; categoria: string | null }>(`
        SELECT
          COUNT(DISTINCT i.id)::int AS insumos,
          COUNT(DISTINCT i.categoria)::int AS categorias,
          MIN(i.categoria) AS categoria
        FROM cnis.insumo i
        WHERE i.clave_normalizada = regexp_replace(TRIM($1), '[^0-9]', '', 'g')
      `, [clave]);
      const { insumos, categorias, categoria } = clasificacion.rows[0];

      let tipoInsumo: 'Medicamento' | 'Material de curación';
      if (insumos > 1 || categorias > 1) return await this.rollbackResult(client, 'CLASIFICACION_AMBIGUA');
      if (insumos === 1 && categoria === 'Categoria I. Medicamentos') tipoInsumo = 'Medicamento';
      else if (insumos === 1 && categoria === 'Categoría II. Material de Curación') tipoInsumo = 'Material de curación';
      else if (insumos === 0 && clave.trim().startsWith('160.')) {
        if (!['Medicamento', 'Material de curación'].includes(input.tipoInsumoManual ?? '')) {
          return await this.rollbackResult(client, 'TIPO_MANUAL_REQUERIDO');
        }
        tipoInsumo = input.tipoInsumoManual as typeof tipoInsumo;
      } else if (insumos === 0) return await this.rollbackResult(client, 'CLASIFICACION_NO_DISPONIBLE');
      else return await this.rollbackResult(client, 'CLASIFICACION_INCOMPATIBLE');

      const { rows } = await client.query<{ clave: string; tipoInsumo: string }>(`
        INSERT INTO abasto.universo_hospital_2027
          (unidad_medica_id, clave_cnis, tipo_insumo, origen, activo)
        VALUES ($1, $2, $3, 'MANUAL', TRUE)
        RETURNING clave_cnis AS clave, tipo_insumo AS "tipoInsumo"
      `, [unidadId, clave, tipoInsumo]);
      await client.query('COMMIT');
      return { ok: true as const, data: rows[0] };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') return { ok: false as const, reason: 'DUPLICADA' as const };
      throw error;
    } finally {
      client.release();
    }
  }

  async actualizarActivo(
    unidadId: number,
    claveCnis: string,
    activo: boolean,
  ): Promise<ActualizarActivoResult | null> {
    const actualizacion = await pool.query<{ clave: string; activo: boolean }>(`
      UPDATE abasto.universo_hospital_2027
      SET activo = $3
      WHERE unidad_medica_id = $1
        AND clave_cnis = $2
        AND activo IS DISTINCT FROM $3
      RETURNING clave_cnis AS clave, activo
    `, [unidadId, claveCnis, activo]);

    if (actualizacion.rows[0]) {
      return { ...actualizacion.rows[0], actualizado: true };
    }

    const relacion = await pool.query<{ clave: string; activo: boolean }>(`
      SELECT clave_cnis AS clave, activo
      FROM abasto.universo_hospital_2027
      WHERE unidad_medica_id = $1
        AND clave_cnis = $2
    `, [unidadId, claveCnis]);

    return relacion.rows[0]
      ? { ...relacion.rows[0], actualizado: false }
      : null;
  }

  async obtenerAnalisisOperativo(
    unidadId: number,
    solicitud: AnalisisOperativoSolicitud[],
  ): Promise<AnalisisOperativoResponse | null> {
    const claves = solicitud.map(item => item.clave.trim().toUpperCase());
    const unidad = await pool.query<{
      cluesimb: string;
      jurisdiccion: 'MEXICALI' | 'TIJUANA' | 'ENSENADA' | null;
    }>(`
      SELECT
        UPPER(TRIM(um.cluesimb)) AS cluesimb,
        CASE
          WHEN UPPER(TRIM(um.cluesimb)) = 'BCIMB000133' THEN 'MEXICALI'
          WHEN UPPER(COALESCE(vumd.nombre_municipio, '')) SIMILAR TO '%(TIJUANA|TECATE|PLAYAS DE ROSARITO)%' THEN 'TIJUANA'
          WHEN UPPER(COALESCE(vumd.nombre_municipio, '')) SIMILAR TO '%(MEXICALI|SAN FELIPE)%' THEN 'MEXICALI'
          WHEN UPPER(COALESCE(vumd.nombre_municipio, '')) SIMILAR TO '%(ENSENADA|SAN QUINTIN|SAN QUINTÍN)%' THEN 'ENSENADA'
          ELSE NULL
        END AS jurisdiccion
      FROM public.unidad_medica um
      LEFT JOIN public.v_unidad_medica_detalle vumd
        ON UPPER(TRIM(vumd.cluesimb)) = UPPER(TRIM(um.cluesimb))
      WHERE um.id = $1
      LIMIT 1
    `, [unidadId]);
    if (!unidad.rows[0]) return null;

    const pertenencia = await pool.query<{ clave: string }>(`
      SELECT DISTINCT UPPER(TRIM(u.clave_cnis)) AS clave
      FROM abasto.universo_hospital_2027 u
      WHERE u.unidad_medica_id = $1
        AND UPPER(TRIM(u.clave_cnis)) = ANY($2::text[])
    `, [unidadId, claves]);
    if (pertenencia.rows.length !== claves.length) return null;

    const { rows } = await pool.query<{
      clave: string;
      cpm: string | number | null;
      existencia_azm: string | number | null;
      existencia_azt: string | number | null;
      existencia_aze: string | number | null;
      fecha_snapshot: Date | string | null;
    }>(`
      WITH claves AS (SELECT UNNEST($2::text[]) AS clave),
      cpm_unidad AS (
        SELECT UPPER(TRIM(c.clave_cnis)) AS clave, MAX(c.cpm) AS cpm
        FROM public.cpm c
        WHERE c.unidad_medica_id = $1
          AND UPPER(TRIM(c.clave_cnis)) = ANY($2::text[])
        GROUP BY UPPER(TRIM(c.clave_cnis))
      ),
      existencias AS (
        SELECT
          UPPER(TRIM(t.clave_cnis)) AS clave,
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
          MAX(t.cargado_en) AS fecha_snapshot
        FROM public.tmp_existencias t
        INNER JOIN public.v_unidad_medica_detalle vumd
          ON UPPER(TRIM(vumd.cluesimb)) = UPPER(TRIM(t.cluesimb))
        WHERE vumd.tipo_unidad = 'ALMACENES'
          AND UPPER(TRIM(t.clave_cnis)) = ANY($2::text[])
        GROUP BY UPPER(TRIM(t.clave_cnis))
      )
      SELECT
        k.clave,
        COALESCE(c.cpm, 0) AS cpm,
        COALESCE(e.existencia_azm, 0) AS existencia_azm,
        COALESCE(e.existencia_azt, 0) AS existencia_azt,
        COALESCE(e.existencia_aze, 0) AS existencia_aze,
        e.fecha_snapshot
      FROM claves k
      LEFT JOIN cpm_unidad c ON c.clave = k.clave
      LEFT JOIN existencias e ON e.clave = k.clave
      ORDER BY k.clave
    `, [unidadId, claves]);

    const alternativasResult = await pool.query<{
      clave: string;
      candidato: string;
      factor: string | number;
      descripcion: string | null;
      presentacion: string | null;
      cpm: string | number | null;
      existencia_azm: string | number | null;
      existencia_azt: string | number | null;
      existencia_aze: string | number | null;
      fecha_snapshot: Date | string | null;
    }>(`
      WITH aristas AS (
        SELECT UPPER(TRIM(h.clave)) AS clave, UPPER(TRIM(h.sustituto)) AS candidato, h.factor::numeric AS factor
        FROM public.homologos h
        WHERE UPPER(TRIM(h.clave)) = ANY($2::text[])
          AND h.factor::numeric > 0
          AND NULLIF(UPPER(TRIM(h.sustituto)), '') IS NOT NULL
        UNION
        SELECT UPPER(TRIM(h.sustituto)), UPPER(TRIM(h.clave)), 1 / NULLIF(h.factor::numeric, 0)
        FROM public.homologos h
        WHERE UPPER(TRIM(h.sustituto)) = ANY($2::text[])
          AND h.factor::numeric > 0
          AND NULLIF(UPPER(TRIM(h.clave)), '') IS NOT NULL
      ),
      permitidas AS (
        SELECT a.* FROM aristas a
        WHERE NOT EXISTS (
          SELECT 1 FROM public.v_solicitud_primer_nivel_clave_excluida ex WHERE ex.clave = a.candidato
        )
      ),
      existencias AS (
        SELECT
          UPPER(TRIM(t.clave_cnis)) AS clave,
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
          MAX(t.cargado_en) AS fecha_snapshot
        FROM public.tmp_existencias t
        INNER JOIN public.v_unidad_medica_detalle vumd
          ON UPPER(TRIM(vumd.cluesimb)) = UPPER(TRIM(t.cluesimb))
        WHERE vumd.tipo_unidad = 'ALMACENES'
          AND UPPER(TRIM(t.clave_cnis)) IN (SELECT candidato FROM permitidas)
        GROUP BY UPPER(TRIM(t.clave_cnis))
      ),
      cpm_unidad AS (
        SELECT UPPER(TRIM(c.clave_cnis)) AS clave, MAX(c.cpm) AS cpm
        FROM public.cpm c
        WHERE c.unidad_medica_id = $1
          AND UPPER(TRIM(c.clave_cnis)) IN (SELECT candidato FROM permitidas)
        GROUP BY UPPER(TRIM(c.clave_cnis))
      )
      SELECT DISTINCT ON (p.clave)
        p.clave, p.candidato, p.factor,
        a.descripcion, a.presentacion,
        COALESCE(c.cpm, 0) AS cpm,
        e.existencia_azm, e.existencia_azt, e.existencia_aze, e.fecha_snapshot
      FROM permitidas p
      INNER JOIN existencias e ON e.clave = p.candidato
      LEFT JOIN cpm_unidad c ON c.clave = p.candidato
      LEFT JOIN LATERAL (
        SELECT art.descripcion, art.presentacion
        FROM public.articulos art
        WHERE UPPER(TRIM(art.clave)) = p.candidato
        ORDER BY art.id DESC
        LIMIT 1
      ) a ON TRUE
      WHERE p.factor > 0
        AND (e.existencia_azm + e.existencia_azt + e.existencia_aze) > 0
      ORDER BY p.clave,
        ((e.existencia_azm + e.existencia_azt + e.existencia_aze) / p.factor) DESC,
        p.candidato
    `, [unidadId, claves]);

    const alternativas = new Map<string, AnalisisOperativoAlternativa>(
      alternativasResult.rows.map(row => [row.clave, {
        clave: row.candidato,
        descripcion: row.descripcion,
        presentacion: row.presentacion,
        factor: Number(row.factor),
        cpm: Number(row.cpm ?? 0),
        existenciaAzm: Number(row.existencia_azm ?? 0),
        existenciaAzt: Number(row.existencia_azt ?? 0),
        existenciaAze: Number(row.existencia_aze ?? 0),
        fechaSnapshot: row.fecha_snapshot ? new Date(row.fecha_snapshot).toISOString() : null,
      }]),
    );
    const data = rows.map(row => ({
      clave: row.clave,
      cpm: Number(row.cpm ?? 0),
      existenciaAzm: Number(row.existencia_azm ?? 0),
      existenciaAzt: Number(row.existencia_azt ?? 0),
      existenciaAze: Number(row.existencia_aze ?? 0),
      fechaSnapshot: row.fecha_snapshot ? new Date(row.fecha_snapshot).toISOString() : null,
      alternativa: alternativas.get(row.clave) ?? null,
    }));
    const snapshots = data.flatMap(item => [item.fechaSnapshot, item.alternativa?.fechaSnapshot ?? null])
      .filter((value): value is string => Boolean(value));

    return {
      jurisdiccion: unidad.rows[0].jurisdiccion,
      snapshotExistencias: snapshots.sort().at(-1) ?? null,
      data,
    };
  }

  private async rollbackResult(client: { query: (sql: string) => Promise<unknown> }, reason: string) {
    await client.query('ROLLBACK');
    return { ok: false as const, reason };
  }
}
