import { pool } from "../db/pool";
import { DetalleBalanceo } from "../models/DetalleBalanceo";
import { ResumenBalanceo } from "../models/ResumenBalanceo";
import { UltimaEjecucion } from "../models/UltimaEjecucion";

export class BalanceoService {
  /**
   * Ejecuta la función PL/pgSQL ejecutar_balanceo_existencias()
   * y regresa el ejecucion_id generado.
   */
  async ejecutarBalanceoExistencias(): Promise<number> {
    const result = await pool.query(
      'SELECT ejecutar_balanceo_existencias() AS ejecucion_id;'
    );
    const ejecucionId = result.rows[0]?.ejecucion_id;
    if (!ejecucionId && ejecucionId !== 0) {
      throw new Error('No se obtuvo ejecucion_id al ejecutar el balanceo');
    }
    return ejecucionId;
  }

  /**
   * Obtiene la última ejecución registrada en log_ejecuciones_balanceo.
   */
  async obtenerUltimaEjecucion(): Promise<UltimaEjecucion | null> {
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
    return result.rows[0] as UltimaEjecucion;
  }

  /**
   * Obtiene el resumen actual (última ejecución) desde resumen_almacenes_final.
   */
  async obtenerResumenActual(): Promise<ResumenBalanceo[]> {
    const result = await pool.query(
      `
      SELECT 
        clave_cnis,
        jurisdiccion_almacen,
        jurisdiccion_destino,
        total_unidades,
        total_piezas,
        instrucciones_detalladas
      FROM resumen_almacenes_final
      ORDER BY jurisdiccion_almacen, jurisdiccion_destino, total_piezas DESC;
      `
    );

    return result.rows as ResumenBalanceo[];
  }

  /**
   * Obtiene el detalle actual filtrado por clave y/o jurisdicción origen
   * desde balanceo_detallado_final.
   */
  async obtenerDetalleActual(params: {
    clave_cnis?: string;
    jurisdiccion_almacen?: string;
  }): Promise<DetalleBalanceo[]> {
    const { clave_cnis, jurisdiccion_almacen } = params;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (clave_cnis) {
      conditions.push(`clave_cnis = $${idx++}`);
      values.push(clave_cnis);
    }

    if (jurisdiccion_almacen) {
      conditions.push(`jurisdiccion_almacen = $${idx++}`);
      values.push(jurisdiccion_almacen);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      SELECT 
        clave_cnis,
        jurisdiccion_almacen,
        jurisdiccion_destino,
        clues_destino,
        nombre_unidad_destino,
        necesidad_original,
        cantidad_sugerida,
        prioridad
      FROM balanceo_detallado_final
      ${where}
      ORDER BY jurisdiccion_almacen, prioridad, cantidad_sugerida DESC;
      `,
      values
    );

    return result.rows as DetalleBalanceo[];
  }

  /**
   * (Opcional) Resumen histórico por ejecucion_id desde perm_resumen_almacenes_final
   */
  async obtenerResumenPorEjecucion(ejecucionId: number): Promise<ResumenBalanceo[]> {
    const result = await pool.query(
      `
      SELECT 
        clave_cnis,
        jurisdiccion_almacen,
        jurisdiccion_destino,
        total_unidades,
        total_piezas,
        instrucciones_detalladas
      FROM perm_resumen_almacenes_final
      WHERE ejecucion_id = $1
      ORDER BY jurisdiccion_almacen, jurisdiccion_destino, total_piezas DESC;
      `,
      [ejecucionId]
    );

    return result.rows as ResumenBalanceo[];
  }

  /**
   * (Opcional) Detalle histórico por ejecucion_id desde perm_balanceo_detallado_final
   */
  async obtenerDetallePorEjecucion(params: {
    ejecucionId: number;
    clave_cnis?: string;
    jurisdiccion_almacen?: string;
  }): Promise<DetalleBalanceo[]> {
    const { ejecucionId, clave_cnis, jurisdiccion_almacen } = params;

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

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(
      `
      SELECT 
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
      ORDER BY jurisdiccion_almacen, prioridad, cantidad_sugerida DESC;
      `,
      values
    );

    return result.rows as DetalleBalanceo[];
  }
}