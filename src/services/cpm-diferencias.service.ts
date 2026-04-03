import { pool } from '../db/pool';

interface Params {
  cluesimb?: string;
  observacion?: string;
  search?: string;
  page?: number;
  limit?: number;
  offset?: number;
}

interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
  offset: number;
  totalPages: number;
}

interface IndicadoresRow {
  cluesimb: string | null;
  nombre_de_unidad: string | null;
  clave_cnis: string | null;
  cpm_local: number | null;
  cpm_real: number | null;
  observacion: 'AGREGADO' | 'ELIMINADO' | 'MODIFICADO' | 'SIN_CAMBIO';
  diferencia: number;
  impacto_absoluto: number;
}

class CpmDiferenciasService {
  private normalizePagination(params: Params) {
    const limit = Math.min(Math.max(Number(params.limit ?? 100), 1), 1000);
    const requestedPage = Number(params.page);
    const requestedOffset = Number(params.offset);

    const page = Number.isFinite(requestedPage) && requestedPage > 0
      ? Math.floor(requestedPage)
      : 1;

    const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0
      ? Math.floor(requestedOffset)
      : (page - 1) * limit;

    const effectivePage = Math.floor(offset / limit) + 1;

    return { limit, offset, page: effectivePage };
  }

  async getDiferencias(params: Params): Promise<PaginatedResult<any>> {
    const { cluesimb, observacion } = params;
    const search = String(params.search ?? '').trim() || null;
    const { limit, offset, page } = this.normalizePagination(params);

    const query = `
      SELECT *
      FROM (
        SELECT
          base.cluesimb,
          base.nombre_de_unidad,
          base.clave_cnis,
          base.cpm_cdmx,
          base.cpm_propuesto,
          base.diferencia,
          base.observacion,
          COUNT(*) OVER() AS total_count
        FROM (
          SELECT
            d.cluesimb,
            COALESCE(NULLIF(BTRIM(d.nombre_de_unidad), ''), um.nombre_de_unidad) AS nombre_de_unidad,
            d.clave_cnis,
            d.cpm_cdmx,
            d.cpm_propuesto,
            d.diferencia,
            d.observacion
          FROM public.v_cpm_diferencias d
          LEFT JOIN public.v_unidad_medica_detalle um
            ON um.cluesimb = d.cluesimb
        ) base
        WHERE
          ($1::text IS NULL OR base.cluesimb = $1)
          AND ($2::text IS NULL OR base.observacion = $2)
          AND (
            $3::text IS NULL
            OR base.cluesimb ILIKE '%' || $3 || '%'
            OR COALESCE(base.nombre_de_unidad, '') ILIKE '%' || $3 || '%'
            OR base.clave_cnis ILIKE '%' || $3 || '%'
          )
      ) dif
      ORDER BY cluesimb, clave_cnis
      LIMIT $4 OFFSET $5
    `;

    const result = await pool.query(query, [
      cluesimb ?? null,
      observacion ?? null,
      search,
      limit,
      offset
    ]);

    const total = result.rows.length ? Number(result.rows[0].total_count) : 0;
    const rows = result.rows.map(r => ({
      cluesimb: r.cluesimb,
      nombre_de_unidad: r.nombre_de_unidad,
      clave_cnis: r.clave_cnis,
      cpm_cdmx: Number(r.cpm_cdmx),
      cpm_propuesto: Number(r.cpm_propuesto),
      diferencia: Number(r.diferencia),
      observacion: r.observacion
    }));

    return {
      rows,
      total,
      page,
      limit,
      offset,
      totalPages: total > 0 ? Math.ceil(total / limit) : 0
    };
  }

  async getResumen(params: Params = {}): Promise<PaginatedResult<any>> {
    const { limit, offset, page } = this.normalizePagination(params);

    const query = `
      SELECT *
      FROM (
        SELECT
          cluesimb,
          MAX(nombre_de_unidad) AS nombre_de_unidad,
          COUNT(*) AS total_diferencias,
          COUNT(*) FILTER (WHERE observacion = 'AGREGADO') AS agregados,
          COUNT(*) FILTER (WHERE observacion = 'ELIMINADO') AS eliminados,
          COUNT(*) FILTER (WHERE observacion = 'MODIFICADO') AS modificados,
          SUM(ABS(diferencia)) AS impacto_absoluto_total,
          COUNT(*) OVER() AS total_count
        FROM public.v_cpm_diferencias
        GROUP BY cluesimb
      ) resumen
      ORDER BY total_diferencias DESC, impacto_absoluto_total DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    const total = result.rows.length ? Number(result.rows[0].total_count) : 0;
    const rows = result.rows.map(r => ({
      cluesimb: r.cluesimb,
      nombre_de_unidad: r.nombre_de_unidad,
      total_diferencias: Number(r.total_diferencias),
      agregados: Number(r.agregados),
      eliminados: Number(r.eliminados),
      modificados: Number(r.modificados),
      impacto_absoluto_total: Number(r.impacto_absoluto_total)
    }));

    return {
      rows,
      total,
      page,
      limit,
      offset,
      totalPages: total > 0 ? Math.ceil(total / limit) : 0
    };
  }

  private roundPercent(value: number) {
    return Number(value.toFixed(2));
  }

  private buildLecturaEjecutiva(input: {
    totalUnidadesUniverso: number;
    totalUnidadesConCambios: number;
    porcentajeUnidadesSinCambios: number;
    totalAgregados: number;
    totalEliminados: number;
    totalModificados: number;
    topConcentracion: number;
    topCantidad: number;
  }) {
    const {
      totalUnidadesUniverso,
      totalUnidadesConCambios,
      porcentajeUnidadesSinCambios,
      totalAgregados,
      totalEliminados,
      totalModificados,
      topConcentracion,
      topCantidad
    } = input;

    let accionPredominante = 'las modificaciones';
    if (totalAgregados >= totalEliminados && totalAgregados >= totalModificados) {
      accionPredominante = 'las altas';
    } else if (totalEliminados >= totalAgregados && totalEliminados >= totalModificados) {
      accionPredominante = 'las bajas';
    }

    const panorama = totalUnidadesConCambios > 0
      ? `Panorama general: ${totalUnidadesConCambios} unidades presentan diferencias respecto al CPM real de CDMX de un universo de ${totalUnidadesUniverso} unidades (hospitales, centros de salud, etc). Predominan ${accionPredominante} sobre el resto de movimientos. ${porcentajeUnidadesSinCambios}% de las unidades evaluadas no presenta cambios.`
      : `Panorama general: no se identifican diferencias respecto al CPM real de CDMX en las ${totalUnidadesUniverso} unidades evaluadas. El 100% del universo analizado se encuentra sin cambios.`;

    const concentracion = totalUnidadesConCambios > 0
      ? `El impacto se concentra en ${topCantidad} unidades que acumulan ${topConcentracion}% de las diferencias detectadas.`
      : 'No se observa concentración de impacto porque no hay diferencias registradas.';

    return `${panorama} ${concentracion}`;
  }

  private getRiesgoGlobal(input: {
    porcentajeUnidadesConCambios: number;
    totalDiferencias: number;
    totalClavesEvaluadas: number;
  }): 'bajo' | 'medio' | 'alto' {
    const { porcentajeUnidadesConCambios, totalDiferencias, totalClavesEvaluadas } = input;
    const porcentajeDiferencias = totalClavesEvaluadas > 0
      ? (totalDiferencias / totalClavesEvaluadas) * 100
      : 0;

    if (porcentajeUnidadesConCambios >= 70 || porcentajeDiferencias >= 35) {
      return 'alto';
    }

    if (porcentajeUnidadesConCambios >= 30 || porcentajeDiferencias >= 15) {
      return 'medio';
    }

    return 'bajo';
  }

  async getIndicadores() {
    const query = `
      WITH local_cpm AS (
        SELECT
          um.id AS unidad_medica_id,
          um.cluesimb,
          NULLIF(BTRIM(um.nombre_de_unidad), '') AS nombre_de_unidad,
          c.clave_cnis,
          c.cpm::numeric AS cpm_local
        FROM public.cpm c
        INNER JOIN public.v_unidad_medica_detalle um
          ON um.id = c.unidad_medica_id
      ),
      real_cpm AS (
        SELECT
          r.cluesimb,
          r.clave_cnis,
          r.cpm::numeric AS cpm_real
        FROM public.cpm_real r
      ),
      universo AS (
        SELECT
          COALESCE(l.cluesimb, r.cluesimb) AS cluesimb,
          COALESCE(NULLIF(BTRIM(l.nombre_de_unidad), ''), um.nombre_de_unidad) AS nombre_de_unidad,
          COALESCE(l.clave_cnis, r.clave_cnis) AS clave_cnis,
          l.cpm_local,
          r.cpm_real,
          CASE
            WHEN l.clave_cnis IS NOT NULL AND r.clave_cnis IS NULL THEN 'AGREGADO'
            WHEN l.clave_cnis IS NULL AND r.clave_cnis IS NOT NULL THEN 'ELIMINADO'
            WHEN l.cpm_local = r.cpm_real THEN 'SIN_CAMBIO'
            ELSE 'MODIFICADO'
          END AS observacion,
          COALESCE(l.cpm_local, 0) - COALESCE(r.cpm_real, 0) AS diferencia,
          ABS(COALESCE(l.cpm_local, 0) - COALESCE(r.cpm_real, 0)) AS impacto_absoluto
        FROM local_cpm l
        FULL OUTER JOIN real_cpm r
          ON r.cluesimb = l.cluesimb
         AND r.clave_cnis = l.clave_cnis
        LEFT JOIN public.v_unidad_medica_detalle um
          ON um.cluesimb = COALESCE(l.cluesimb, r.cluesimb)
        WHERE COALESCE(l.cluesimb, r.cluesimb) IS NOT NULL
          AND COALESCE(l.clave_cnis, r.clave_cnis) IS NOT NULL
      )
      SELECT
        cluesimb,
        nombre_de_unidad,
        clave_cnis,
        cpm_local,
        cpm_real,
        observacion,
        diferencia,
        impacto_absoluto
      FROM universo
      ORDER BY cluesimb, clave_cnis
    `;

    const result = await pool.query(query);
    const rows: IndicadoresRow[] = result.rows.map((r) => ({
      cluesimb: r.cluesimb,
      nombre_de_unidad: r.nombre_de_unidad,
      clave_cnis: r.clave_cnis,
      cpm_local: r.cpm_local === null ? null : Number(r.cpm_local),
      cpm_real: r.cpm_real === null ? null : Number(r.cpm_real),
      observacion: r.observacion,
      diferencia: Number(r.diferencia),
      impacto_absoluto: Number(r.impacto_absoluto)
    }));

    const unidades = new Map<string, {
      cluesimb: string;
      nombre_de_unidad: string;
      agregados: number;
      eliminados: number;
      modificados_mas: number;
      modificados_menos: number;
      sin_cambios: number;
      total_diferencias: number;
      impacto_absoluto_total: number;
      total_claves_evaluadas: number;
      tiene_cambios: boolean;
    }>();

    for (const row of rows) {
      const cluesimb = row.cluesimb ?? 'SIN_CLUES';
      const nombreDeUnidad = row.nombre_de_unidad ?? '';
      const current = unidades.get(cluesimb) ?? {
        cluesimb,
        nombre_de_unidad: nombreDeUnidad,
        agregados: 0,
        eliminados: 0,
        modificados_mas: 0,
        modificados_menos: 0,
        sin_cambios: 0,
        total_diferencias: 0,
        impacto_absoluto_total: 0,
        total_claves_evaluadas: 0,
        tiene_cambios: false
      };

      current.nombre_de_unidad = current.nombre_de_unidad || nombreDeUnidad;
      current.total_claves_evaluadas += 1;

      if (row.observacion === 'SIN_CAMBIO') {
        current.sin_cambios += 1;
      } else {
        current.total_diferencias += 1;
        current.impacto_absoluto_total += row.impacto_absoluto;
        current.tiene_cambios = true;
      }

      if (row.observacion === 'AGREGADO') current.agregados += 1;
      if (row.observacion === 'ELIMINADO') current.eliminados += 1;
      if (row.observacion === 'MODIFICADO' && row.diferencia > 0) current.modificados_mas += 1;
      if (row.observacion === 'MODIFICADO' && row.diferencia < 0) current.modificados_menos += 1;

      unidades.set(cluesimb, current);
    }

    const composicionPorUnidad = Array.from(unidades.values())
      .map((item) => ({
        cluesimb: item.cluesimb,
        nombre_de_unidad: item.nombre_de_unidad,
        agregados: item.agregados,
        eliminados: item.eliminados,
        modificados_mas: item.modificados_mas,
        modificados_menos: item.modificados_menos,
        total_diferencias: item.total_diferencias,
        impacto_absoluto_total: item.impacto_absoluto_total,
        total_claves_evaluadas: item.total_claves_evaluadas
      }))
      .sort((a, b) =>
        b.total_diferencias - a.total_diferencias ||
        b.impacto_absoluto_total - a.impacto_absoluto_total ||
        a.cluesimb.localeCompare(b.cluesimb)
      );

    const totalUnidadesUniverso = composicionPorUnidad.length;
    const totalUnidadesConCambios = composicionPorUnidad.filter((item) => item.total_diferencias > 0).length;
    const totalUnidadesSinCambios = totalUnidadesUniverso - totalUnidadesConCambios;
    const totalClavesEvaluadas = rows.length;
    const totalAgregados = rows.filter((row) => row.observacion === 'AGREGADO').length;
    const totalEliminados = rows.filter((row) => row.observacion === 'ELIMINADO').length;
    const totalModificados = rows.filter((row) => row.observacion === 'MODIFICADO').length;
    const totalModificadosMas = rows.filter((row) => row.observacion === 'MODIFICADO' && row.diferencia > 0).length;
    const totalModificadosMenos = rows.filter((row) => row.observacion === 'MODIFICADO' && row.diferencia < 0).length;
    const totalDiferencias = totalAgregados + totalEliminados + totalModificados;
    const impactoAbsolutoTotal = rows
      .filter((row) => row.observacion !== 'SIN_CAMBIO')
      .reduce((acc, row) => acc + row.impacto_absoluto, 0);

    const porcentajeUnidadesSinCambios = totalUnidadesUniverso > 0
      ? this.roundPercent((totalUnidadesSinCambios / totalUnidadesUniverso) * 100)
      : 0;

    const porcentajeUnidadesConCambios = totalUnidadesUniverso > 0
      ? (totalUnidadesConCambios / totalUnidadesUniverso) * 100
      : 0;

    const porcentajeModificados = totalDiferencias > 0
      ? this.roundPercent((totalModificados / totalDiferencias) * 100)
      : 0;

    const porcentajeAgregados = totalDiferencias > 0
      ? this.roundPercent((totalAgregados / totalDiferencias) * 100)
      : 0;

    const porcentajeEliminados = totalDiferencias > 0
      ? this.roundPercent((totalEliminados / totalDiferencias) * 100)
      : 0;

    const topUnidadesPorDiferencias = composicionPorUnidad
      .filter((item) => item.total_diferencias > 0)
      .slice(0, 10)
      .map((item) => ({
        cluesimb: item.cluesimb,
        nombre_de_unidad: item.nombre_de_unidad,
        total_diferencias: item.total_diferencias
      }));

    const topUnidadesPorImpacto = [...composicionPorUnidad]
      .filter((item) => item.impacto_absoluto_total > 0)
      .sort((a, b) =>
        b.impacto_absoluto_total - a.impacto_absoluto_total ||
        b.total_diferencias - a.total_diferencias ||
        a.cluesimb.localeCompare(b.cluesimb)
      )
      .slice(0, 10)
      .map((item) => ({
        cluesimb: item.cluesimb,
        nombre_de_unidad: item.nombre_de_unidad,
        impacto_absoluto_total: item.impacto_absoluto_total
      }));

    const topCantidad = Math.min(10, topUnidadesPorDiferencias.length);
    const topDiferenciasAcumuladas = topUnidadesPorDiferencias
      .slice(0, topCantidad)
      .reduce((acc, item) => acc + item.total_diferencias, 0);

    const topConcentracion = totalDiferencias > 0
      ? this.roundPercent((topDiferenciasAcumuladas / totalDiferencias) * 100)
      : 0;

    const riesgoGlobal = this.getRiesgoGlobal({
      porcentajeUnidadesConCambios,
      totalDiferencias,
      totalClavesEvaluadas
    });

    return {
      kpis: {
        total_unidades_universo: totalUnidadesUniverso,
        total_unidades_con_cambios: totalUnidadesConCambios,
        total_unidades_sin_cambios: totalUnidadesSinCambios,
        porcentaje_unidades_sin_cambios: porcentajeUnidadesSinCambios,
        total_claves_evaluadas: totalClavesEvaluadas,
        total_diferencias: totalDiferencias,
        total_agregados: totalAgregados,
        total_eliminados: totalEliminados,
        total_modificados: totalModificados,
        modificados_mas: totalModificadosMas,
        modificados_menos: totalModificadosMenos,
        impacto_absoluto_total: impactoAbsolutoTotal,
        porcentaje_modificados: porcentajeModificados,
        porcentaje_agregados: porcentajeAgregados,
        porcentaje_eliminados: porcentajeEliminados,
        riesgo_global: riesgoGlobal
      },
      charts: {
        distribucion_acciones: [
          { label: 'AGREGADO', value: totalAgregados },
          { label: 'ELIMINADO', value: totalEliminados },
          { label: 'MODIFICADO_MAS', value: totalModificadosMas },
          { label: 'MODIFICADO_MENOS', value: totalModificadosMenos }
        ],
        top_unidades_por_diferencias: topUnidadesPorDiferencias,
        top_unidades_por_impacto: topUnidadesPorImpacto,
        composicion_por_unidad: composicionPorUnidad.map((item) => ({
          cluesimb: item.cluesimb,
          nombre_de_unidad: item.nombre_de_unidad,
          agregados: item.agregados,
          eliminados: item.eliminados,
          total_modificados: item.modificados_mas + item.modificados_menos,
          modificados_mas: item.modificados_mas,
          modificados_menos: item.modificados_menos,
          total_diferencias: item.total_diferencias
        }))
      },
      tutorial_excel: {
        titulo: 'Como crear una grafica manual en Excel',
        pasos: [
          'Selecciona la tabla de distribucion de acciones o cualquiera de los bloques Top incluidos en esta hoja.',
          'Ve a la pestaña Insertar en Excel.',
          'Elige un grafico recomendado o usa columnas, barras o pastel segun el analisis que necesites.',
          'Asigna un titulo claro, por ejemplo: Distribucion de cambios CPM.',
          'Si deseas resaltar el impacto, usa la tabla Top unidades por impacto y ordena de mayor a menor antes de insertar el grafico.'
        ],
        recomendacion: 'Para resumen ejecutivo, usa columnas para distribucion de acciones y barras horizontales para Top unidades.'
      },
      lectura_ejecutiva: this.buildLecturaEjecutiva({
        totalUnidadesUniverso,
        totalUnidadesConCambios,
        porcentajeUnidadesSinCambios,
        totalAgregados,
        totalEliminados,
        totalModificados,
        topConcentracion,
        topCantidad
      })
    };
  }
}

export default CpmDiferenciasService;
