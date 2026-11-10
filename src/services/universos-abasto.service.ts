import { pool } from '../db/pool';
import {
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
    const { rows } = await pool.query<UniversoClaveRow & { totalRegistros: number }>(`
      SELECT
        UPPER(TRIM(u.clave_cnis)) AS clave,
        a.descripcion,
        a.presentacion,
        u.tipo_insumo AS "tipoInsumo",
        u.activo,
        (a.id IS NOT NULL) AS "correspondenciaArticulo",
        COUNT(*) OVER()::int AS "totalRegistros"
      FROM abasto.universo_hospital_2027 u
      LEFT JOIN public.articulos a
        ON UPPER(TRIM(u.clave_cnis)) = UPPER(TRIM(a.clave))
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
      data: rows.map(({ totalRegistros: _totalRegistros, ...row }) => row),
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
    const { rows } = await pool.query<CatalogoClaveCandidataRow & { totalRegistros: number }>(`
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
      SELECT
        c.clave,
        c.descripcion,
        c.presentacion,
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
      ORDER BY UPPER(TRIM(c.clave))
      LIMIT $3 OFFSET $4
    `, [unidadId, search, pageSize, offset]);

    const total = rows[0]?.totalRegistros ?? 0;
    return {
      data: rows.map(({ totalRegistros: _totalRegistros, ...row }) => row),
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

  private async rollbackResult(client: { query: (sql: string) => Promise<unknown> }, reason: string) {
    await client.query('ROLLBACK');
    return { ok: false as const, reason };
  }
}
