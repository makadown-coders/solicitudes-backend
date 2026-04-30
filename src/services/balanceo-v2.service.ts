import { pool } from "../db/pool";
import {
  BalanceoV2Apartado,
  BalanceoV2ApartadoParams,
  BalanceoV2Detalle,
  BalanceoV2DetalleParams,
  BalanceoV2Ejecucion,
  BalanceoV2Resultado,
  BalanceoV2ResumenJurisdiccional,
} from "../models/BalanceoV2";

export class BalanceoV2Service {
  async ejecutarBalanceoV2(): Promise<number> {
    const result = await pool.query(
      'SELECT public.ejecutar_balanceo_existencias_v2() AS ejecucion_id;'
    );

    const ejecucionId = result.rows[0]?.ejecucion_id;
    if (!ejecucionId && ejecucionId !== 0) {
      throw new Error('No se obtuvo ejecucion_id al ejecutar el balanceo v2');
    }

    return ejecucionId;
  }

  async obtenerEjecuciones(): Promise<BalanceoV2Ejecucion[]> {
    const result = await pool.query(
      `
      SELECT
        id,
        fecha_inicio,
        fecha_fin,
        estado,
        total_claves,
        claves_procesadas
      FROM log_ejecuciones_balanceo
      ORDER BY fecha_inicio DESC;
      `
    );

    return result.rows as BalanceoV2Ejecucion[];
  }

  async obtenerUltimaEjecucion(): Promise<BalanceoV2Ejecucion | null> {
    const result = await pool.query(
      `
      SELECT
        id,
        fecha_inicio,
        fecha_fin,
        estado,
        total_claves,
        claves_procesadas
      FROM log_ejecuciones_balanceo
      ORDER BY fecha_inicio DESC
      LIMIT 1;
      `
    );

    if (result.rows.length === 0) return null;
    return result.rows[0] as BalanceoV2Ejecucion;
  }

  async obtenerResumenJurisdiccional(
    ejecucionId: number
  ): Promise<BalanceoV2ResumenJurisdiccional[]> {
    const result = await pool.query(
      `
      SELECT *
      FROM v_reporte_balanceo_jurisdiccional
      WHERE ejecucion_id = $1
      ORDER BY clave_cnis, jurisdiccion;
      `,
      [ejecucionId]
    );

    return result.rows as BalanceoV2ResumenJurisdiccional[];
  }

  async obtenerDetallePorEjecucion(
    params: BalanceoV2DetalleParams
  ): Promise<BalanceoV2Detalle[]> {
    const {
      ejecucionId,
      clave_cnis,
      jurisdiccion_almacen,
      jurisdiccion_destino,
    } = params;

    const conditions: string[] = ['ejecucion_id = $1'];
    const values: any[] = [ejecucionId];
    let idx = 2;

    if (clave_cnis) {
      conditions.push(`clave_cnis = $${idx++}`);
      values.push(clave_cnis);
    }

    if (jurisdiccion_almacen) {
      conditions.push(`jurisdiccion_almacen = $${idx++}`);
      values.push(jurisdiccion_almacen);
    }

    if (jurisdiccion_destino) {
      conditions.push(`jurisdiccion_destino = $${idx++}`);
      values.push(jurisdiccion_destino);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(
      `
      SELECT
        ejecucion_id,
        fecha_ejecucion,
        clave_cnis,
        jurisdiccion_almacen,
        jurisdiccion_destino,
        clues_destino,
        nombre_unidad_destino,
        necesidad_original,
        cantidad_sugerida,
        prioridad
      FROM perm_balanceo_detallado_final
      ${where}
      ORDER BY clave_cnis, jurisdiccion_almacen, prioridad, cantidad_sugerida DESC;
      `,
      values
    );

    return result.rows as BalanceoV2Detalle[];
  }

  async obtenerApartadosPorEjecucion(
    params: BalanceoV2ApartadoParams
  ): Promise<BalanceoV2Apartado[]> {
    const { ejecucionId, clave_cnis, jurisdiccion } = params;

    const conditions: string[] = ['ejecucion_id = $1'];
    const values: any[] = [ejecucionId];
    let idx = 2;

    if (clave_cnis) {
      conditions.push(`clave_cnis = $${idx++}`);
      values.push(clave_cnis);
    }

    if (jurisdiccion) {
      conditions.push(`jurisdiccion = $${idx++}`);
      values.push(jurisdiccion);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(
      `
      SELECT
        id,
        ejecucion_id,
        fecha_ejecucion,
        clave_cnis,
        clues_almacen,
        nombre_almacen,
        jurisdiccion,
        existencia_original,
        cpm_jurisdiccion,
        cantidad_apartada,
        existencia_disponible_balanceo,
        observaciones
      FROM balanceo_apartados_historial
      ${where}
      ORDER BY clave_cnis, jurisdiccion, nombre_almacen;
      `,
      values
    );

    return result.rows as BalanceoV2Apartado[];
  }

  async obtenerResultadosPorEjecucion(
    ejecucionId: number
  ): Promise<BalanceoV2Resultado[]> {
    const result = await pool.query(
      `
      SELECT
        ejecucion_id,
        fecha_ejecucion,
        clave_cnis,
        jurisdiccion_origen,
        jurisdiccion_destino,
        cantidad_transferir,
        existencia_original,
        necesidad_destino
      FROM perm_balanceo_resultados
      WHERE ejecucion_id = $1
      ORDER BY clave_cnis, jurisdiccion_origen, jurisdiccion_destino;
      `,
      [ejecucionId]
    );

    return result.rows as BalanceoV2Resultado[];
  }
}
