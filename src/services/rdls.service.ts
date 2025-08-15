// src/services/rdls.service.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
});

export interface RdlsSalidaRow {
  id: number;
  fecha_entregado: string; // DATE (string ISO yyyy-mm-dd)
  folio: string | null;
  clave_cnis: string | null;
  descripcion: string | null;
  cantidad: number | null;
  total: number | null;
  unidad_origen_id: number | null;
  nombre_almacen_origen: string | null;
  clues_origen: string | null;
  tipo_origen: string | null;
  unidad_destino_id: number | null;
  nombre_destino: string | null;
  clues_destino: string | null;
  tipo_destino: string | null;
  lote: string | null;
  fecha_caducidad: string | null;
}

export interface RdlsQuery {
  desde: string;         // 'YYYY-MM-DD'
  hasta: string;         // 'YYYY-MM-DD'
  ventanaDias?: number;  // default 7
  limit?: number;        // default 100
  cursorFecha?: string | null; // 'YYYY-MM-DD' (porque es DATE)
  cursorId?: number | null;
}

class RdlsService {
  /**
   * Devuelve salidas desde almacén hacia “exterior” (sin recibido por lote en entrada/traspaso).
   * Keyset pagination con (fecha_entregado, id) descendente.
   */
  async salidasExteriorPorRango(q: RdlsQuery): Promise<{ items: RdlsSalidaRow[]; nextCursor: string | null; }> {
    const ventana = Number.isFinite(q.ventanaDias) ? Number(q.ventanaDias) : 7;
    const limit = Number.isFinite(q.limit) ? Number(q.limit) : 100;

    const sql = `
      WITH base AS (
        SELECT
          s.id,
          s.fecha_entregado,
          s.folio,
          s.clave_cnis,
          s.descripcion,
          s.cantidad,
          s.total,
          s.unidad_origen_id,
          COALESCE(um_o.nombre, s.unidad_origen_texto)  AS nombre_almacen_origen,
          um_o.cluesimb                                 AS clues_origen,
          tu_o.nombre_tipo                               AS tipo_origen,
          s.unidad_destino_id,
          COALESCE(um_d.nombre, s.unidad_destino_texto) AS nombre_destino,
          um_d.cluesimb                                 AS clues_destino,
          tu_d.nombre_tipo                               AS tipo_destino,
          s.lote,
          s.fecha_caducidad
        FROM salida s
        LEFT JOIN unidad_medica_alias a_o ON a_o.id = s.unidad_origen_id
        LEFT JOIN unidad_medica       um_o ON um_o.id = a_o.unidad_medica_id
        LEFT JOIN tipo_unidad         tu_o ON tu_o.id = um_o.tipo_unidad_id
        LEFT JOIN unidad_medica_alias a_d ON a_d.id = s.unidad_destino_id
        LEFT JOIN unidad_medica       um_d ON um_d.id = a_d.unidad_medica_id
        LEFT JOIN tipo_unidad         tu_d ON tu_d.id = um_d.tipo_unidad_id
        WHERE tu_o.nombre_tipo = 'ALMACENES'
          AND s.fecha_entregado >= $1::date
          AND s.fecha_entregado <  ($2::date + INTERVAL '1 day')
      ),
      match_traspaso AS (
        SELECT DISTINCT b.id
        FROM base b
        JOIN traspaso t
          ON NULLIF(UPPER(TRIM(t.lote)), '') IS NOT NULL
         AND NULLIF(UPPER(TRIM(b.lote)), '') IS NOT NULL
         AND UPPER(TRIM(t.lote)) = UPPER(TRIM(b.lote))
         AND t.fecha_recepcion BETWEEN b.fecha_entregado - ($3 || ' days')::interval
                                   AND     b.fecha_entregado + ($3 || ' days')::interval
      ),
      match_entrada AS (
        SELECT DISTINCT b.id
        FROM base b
        JOIN entrada e
          ON NULLIF(UPPER(TRIM(e.lote)), '') IS NOT NULL
         AND NULLIF(UPPER(TRIM(b.lote)), '') IS NOT NULL
         AND UPPER(TRIM(e.lote)) = UPPER(TRIM(b.lote))
         AND e.fecha BETWEEN b.fecha_entregado - ($3 || ' days')::interval
                         AND     b.fecha_entregado + ($3 || ' days')::interval
      )
      SELECT *
      FROM base b
      LEFT JOIN match_traspaso mt ON mt.id = b.id
      LEFT JOIN match_entrada  me ON me.id = b.id
      WHERE mt.id IS NULL AND me.id IS NULL
        AND ($6::date IS NULL OR (b.fecha_entregado, b.id) < ($6::date, $7::int))
      ORDER BY b.fecha_entregado DESC, b.id DESC
      LIMIT $5::int;
    `;

    const params = [
      q.desde,          // $1
      q.hasta,          // $2
      ventana,          // $3
      // $4 libre si quisieras
      limit,            // $5
      q.cursorFecha ?? null, // $6
      q.cursorId ?? null     // $7
    ];

    const { rows } = await pool.query(sql, params);
    const last = rows[rows.length - 1];
    const nextCursor = last ? `${last.fecha_entregado},${last.id}` : null;

    return { items: rows as RdlsSalidaRow[], nextCursor };
  }
}

export default RdlsService;
