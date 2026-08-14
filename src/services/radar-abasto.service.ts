// src/services/radar-abasto.service.ts
import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { isISODateOnly, parseIntSafe } from '../helpers/helper';
import { RadarCrearEventoInput } from '../models/radar-abasto/RadarCrearEventoInput';
import { RadarEventoClaveRow } from '../models/radar-abasto/RadarEventoClaveRow';
import { RadarEventoHeaderRow } from '../models/radar-abasto/RadarEventoHeaderRow';
import { RadarGlobalClaveRiesgoRow } from '../models/radar-abasto/RadarGlobalClaveRiesgoRow';
import { RadarGlobalClavesRiesgoInput } from '../models/radar-abasto/RadarGlobalClavesRiesgoInput';
import { RadarGlobalSnapshotInput } from '../models/radar-abasto/RadarGlobalSnapshotInput';
import { RadarGlobalSolicitudRow } from '../models/radar-abasto/RadarGlobalSolicitudRow';
import { RadarGlobalTimelineInput } from '../models/radar-abasto/RadarGlobalTimelineInput';
import { RadarGlobalV2EstadoOperativo, RadarGlobalV2Input, RadarGlobalV2Segmento } from '../models/radar-abasto/RadarGlobalV2Input';
import { RadarGlobalV2Row } from '../models/radar-abasto/RadarGlobalV2Row';
import { RadarGlobalV2OrdenRow } from '../models/radar-abasto/RadarGlobalV2OrdenRow';
import { RadarGlobalV2SalidaRow } from '../models/radar-abasto/RadarGlobalV2SalidaRow';
import { RadarListarEventosInput } from '../models/radar-abasto/RadarListarEventosInput';
import { RadarRiesgoNivel } from '../models/radar-abasto/RadarRiesgoNivel';

type RadarMetricasClave = {
  existencia_actual: number;
  consumo_promedio: number;
  dias_cobertura: number | null;
  citas_pendientes: number;
  entradas_30d: number;
  salidas_30d: number;
  traspasos_30d: number;
  solicitado_30d: number;
  movimientos_recientes: number;
};

function normUpper(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

function normText(v: unknown): string {
  return String(v ?? '').trim();
}

function riesgoRank(nivel: RadarRiesgoNivel): number {
  switch (nivel) {
    case 'CRITICO':
      return 4;
    case 'ALTO':
      return 3;
    case 'MEDIO':
      return 2;
    default:
      return 1;
  }
}

function maxRiesgo(a: RadarRiesgoNivel | null, b: RadarRiesgoNivel): RadarRiesgoNivel {
  if (!a) return b;
  return riesgoRank(b) > riesgoRank(a) ? b : a;
}

export default class RadarAbastoService {
  private resolveEstado(input: unknown): 'abierto' | 'en_seguimiento' | 'cerrado' {
    const s = normText(input).toLowerCase();
    if (s === 'en_seguimiento') return 'en_seguimiento';
    if (s === 'cerrado') return 'cerrado';
    return 'abierto';
  }

  private resolveFecha(input: unknown): string {
    const s = normText(input);
    if (!s) return new Date().toISOString().slice(0, 10);
    if (!isISODateOnly(s)) throw new Error('fecha_evento debe venir como YYYY-MM-DD');
    return s;
  }

  private resolveRiesgoMin(input: unknown): RadarRiesgoNivel | '' {
    const v = normUpper(input);
    if (v === 'BAJO' || v === 'MEDIO' || v === 'ALTO' || v === 'CRITICO') return v;
    return '';
  }

  private calcularRiesgo(m: RadarMetricasClave): { nivel: RadarRiesgoNivel; flags: string[] } {
    const flags: string[] = [];

    if (m.existencia_actual <= 0) flags.push('SIN_EXISTENCIA');
    if (m.citas_pendientes <= 0) flags.push('SIN_CITAS_PENDIENTES');
    if (m.consumo_promedio <= 0) flags.push('CPM_CERO');
    if (m.solicitado_30d > 0) flags.push('SOLICITADO_RECIENTE');

    if (m.existencia_actual <= 0 && m.citas_pendientes <= 0) {
      return { nivel: 'CRITICO', flags };
    }

    if (m.consumo_promedio <= 0 && m.solicitado_30d > 0 && m.existencia_actual <= 30) {
      return { nivel: 'CRITICO', flags };
    }

    if ((m.dias_cobertura ?? 0) < 3 && m.citas_pendientes <= 0) {
      return { nivel: 'ALTO', flags };
    }

    if ((m.dias_cobertura ?? 99999) <= 7) {
      return { nivel: 'MEDIO', flags };
    }

    return { nivel: 'BAJO', flags };
  }

  private async obtenerMetricasClave(
    cx: PoolClient,
    clues: string,
    clave: string
  ): Promise<RadarMetricasClave> {
    const sql = `
      WITH
      ex AS (
        SELECT COALESCE(SUM(t.existencia), 0)::numeric AS existencia_actual
        FROM public.tmp_existencias t
        WHERE UPPER(TRIM(t.cluesimb)) = $1
          AND UPPER(TRIM(t.clave_cnis)) = $2
      ),
      cpm_ AS (
        SELECT COALESCE(MAX(c.cpm), 0)::numeric AS consumo_promedio
        FROM public.unidad_medica um
        LEFT JOIN public.cpm c ON c.unidad_medica_id = um.id
        WHERE UPPER(TRIM(um.cluesimb)) = $1
          AND UPPER(TRIM(c.clave_cnis)) = $2
      ),
      citas_p AS (
        SELECT COALESCE(count(c.orden_de_suministro), 0)::numeric AS citas_pendientes
        FROM public.citas c
        WHERE UPPER(TRIM(c.clave_cnis)) = $2
          AND c.fecha_limite_de_entrega >= (CURRENT_DATE - INTERVAL '15 days')
          AND c.fecha_recepcion_max IS NULL
      ),
      movimientos AS (
        SELECT
          'ENTRADA'::varchar(50) AS tipo_movimiento,
          COALESCE(um_destino.cluesimb, e.unidad_destino_texto) AS cluesimb,
          e.clave_cnis,
          e.cantidad,
          e.fecha AS fecha_movimiento
        FROM public.entrada e
        LEFT JOIN public.unidad_medica um_destino ON um_destino.id = e.unidad_destino_id
        WHERE UPPER(TRIM(COALESCE(um_destino.cluesimb, e.unidad_destino_texto))) = $1
          AND UPPER(TRIM(e.clave_cnis)) = $2
          AND e.fecha >= (CURRENT_DATE - INTERVAL '30 days')

        UNION ALL

        SELECT
          'TRASPASO'::varchar(50) AS tipo_movimiento,
          COALESCE(um_destino.cluesimb, t.unidad_destino_texto) AS cluesimb,
          t.clave_cnis,
          t.cantidad,
          t.fecha_recepcion AS fecha_movimiento
        FROM public.traspaso t
        LEFT JOIN public.unidad_medica um_destino ON um_destino.id = t.unidad_destino_id
        WHERE UPPER(TRIM(COALESCE(um_destino.cluesimb, t.unidad_destino_texto))) = $1
          AND UPPER(TRIM(t.clave_cnis)) = $2
          AND t.fecha_recepcion >= (CURRENT_DATE - INTERVAL '30 days')

        UNION ALL

        SELECT
          'SALIDA'::varchar(50) AS tipo_movimiento,
          COALESCE(um_origen.cluesimb, s.unidad_origen_texto) AS cluesimb,
          s.clave_cnis,
          s.cantidad,
          s.fecha_entregado AS fecha_movimiento
        FROM public.salida s
        LEFT JOIN public.unidad_medica um_origen ON um_origen.id = s.unidad_origen_id
        WHERE UPPER(TRIM(COALESCE(um_origen.cluesimb, s.unidad_origen_texto))) = $1
          AND UPPER(TRIM(s.clave_cnis)) = $2
          AND s.fecha_entregado >= (CURRENT_DATE - INTERVAL '30 days')
      ),
      mov AS (
        SELECT
          COALESCE(SUM(CASE WHEN m.tipo_movimiento IN ('ENTRADA', 'TRASPASO') THEN m.cantidad ELSE 0 END), 0)::numeric AS entradas_30d,
          COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'SALIDA' THEN m.cantidad ELSE 0 END), 0)::numeric AS salidas_30d,
          COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'TRASPASO' THEN m.cantidad ELSE 0 END), 0)::numeric AS traspasos_30d,
          COUNT(*)::int AS movimientos_recientes
        FROM movimientos m
      ),
      sol AS (
        SELECT COALESCE(SUM(d.cantidad), 0)::numeric AS solicitado_30d
        FROM public.solicitud_bitacora_detalle d
        INNER JOIN public.solicitud_bitacora s ON s.id = d.solicitud_id
        WHERE UPPER(TRIM(s.cluesimb)) = $1
          AND UPPER(TRIM(d.clave)) = $2
          AND s.created_day >= (CURRENT_DATE - INTERVAL '30 days')
      )
      SELECT
        ex.existencia_actual::text AS existencia_actual,
        cpm_.consumo_promedio::text AS consumo_promedio,
        citas_p.citas_pendientes::text AS citas_pendientes,
        mov.entradas_30d::text AS entradas_30d,
        mov.salidas_30d::text AS salidas_30d,
        mov.traspasos_30d::text AS traspasos_30d,
        sol.solicitado_30d::text AS solicitado_30d,
        mov.movimientos_recientes
      FROM ex, cpm_, citas_p, mov, sol;
    `;

    const { rows } = await cx.query(sql, [clues, clave]);
    const row = rows?.[0] ?? {};

    const existenciaActual = Number(row.existencia_actual ?? 0) || 0;
    const consumoPromedio = Number(row.consumo_promedio ?? 0) || 0;
    const diasCobertura = consumoPromedio > 0 ? Number((existenciaActual / consumoPromedio).toFixed(2)) : null;

    return {
      existencia_actual: existenciaActual,
      consumo_promedio: consumoPromedio,
      dias_cobertura: diasCobertura,
      citas_pendientes: Number(row.citas_pendientes ?? 0) || 0,
      entradas_30d: Number(row.entradas_30d ?? 0) || 0,
      salidas_30d: Number(row.salidas_30d ?? 0) || 0,
      traspasos_30d: Number(row.traspasos_30d ?? 0) || 0,
      solicitado_30d: Number(row.solicitado_30d ?? 0) || 0,
      movimientos_recientes: Number(row.movimientos_recientes ?? 0) || 0,
    };
  }

  async crearEvento(input: RadarCrearEventoInput) {
    const clues = normUpper(input.clues);
    const motivo = normText(input.motivo);
    const fechaEvento = this.resolveFecha(input.fecha_evento);
    const fechaReferencia = normText(input.fecha_referencia);
    const estado = this.resolveEstado(input.estado);
    const claves = Array.from(
      new Set(
        (input.claves ?? [])
          .map(x => normUpper(x?.clave_cnis))
          .filter(Boolean)
      )
    );

    if (!clues) throw new Error('clues es requerido');
    if (!motivo) throw new Error('motivo es requerido');
    if (!claves.length) throw new Error('claves es requerido');
    if (fechaReferencia && !isISODateOnly(fechaReferencia)) {
      throw new Error('fecha_referencia debe venir como YYYY-MM-DD');
    }

    const descripcionByClave = new Map<string, string | null>(
      (input.claves ?? []).map(x => [normUpper(x.clave_cnis), normText(x.descripcion) || null])
    );

    const cx = await pool.connect();
    try {
      await cx.query('BEGIN');

      const insertEventoSql = `
        INSERT INTO public.radar_eventos (
          fecha_evento, clues, unidad_nombre, tipo_insumo, fecha_referencia,
          motivo, observaciones, estado, creado_por
        )
        VALUES ($1::date, $2, $3, $4, $5::date, $6, $7, $8, $9)
        RETURNING id::int AS id, fecha_evento::text AS fecha_evento, clues, estado;
      `;

      const eventoRes = await cx.query(insertEventoSql, [
        fechaEvento,
        clues,
        normText(input.unidad_nombre) || null,
        normText(input.tipo_insumo) || null,
        fechaReferencia || null,
        motivo,
        normText(input.observaciones) || null,
        estado,
        normText(input.creado_por) || 'sistema',
      ]);

      const evento = eventoRes.rows[0];
      let riesgoMaximo: RadarRiesgoNivel | null = null;
      let critico = 0;
      let alto = 0;
      let medio = 0;
      let bajo = 0;

      for (const clave of claves) {
        const metricas = await this.obtenerMetricasClave(cx, clues, clave);
        const riesgo = this.calcularRiesgo(metricas);
        riesgoMaximo = maxRiesgo(riesgoMaximo, riesgo.nivel);

        if (riesgo.nivel === 'CRITICO') critico++;
        else if (riesgo.nivel === 'ALTO') alto++;
        else if (riesgo.nivel === 'MEDIO') medio++;
        else bajo++;

        const insertClaveSql = `
          INSERT INTO public.radar_evento_claves (
            evento_id, clave_cnis, descripcion,
            existencia_actual, consumo_promedio, dias_cobertura, citas_pendientes,
            entradas_30d, salidas_30d, traspasos_30d, solicitado_30d, movimientos_recientes,
            nivel_riesgo, flags
          )
          VALUES (
            $1::int, $2, $3,
            $4::numeric, $5::numeric, $6::numeric, $7::numeric,
            $8::numeric, $9::numeric, $10::numeric, $11::numeric, $12::int,
            $13, $14::jsonb
          );
        `;

        await cx.query(insertClaveSql, [
          evento.id,
          clave,
          descripcionByClave.get(clave) ?? null,
          metricas.existencia_actual,
          metricas.consumo_promedio,
          metricas.dias_cobertura,
          metricas.citas_pendientes,
          metricas.entradas_30d,
          metricas.salidas_30d,
          metricas.traspasos_30d,
          metricas.solicitado_30d,
          metricas.movimientos_recientes,
          riesgo.nivel,
          JSON.stringify(riesgo.flags),
        ]);
      }

      await cx.query('COMMIT');
      return {
        id: evento.id as number,
        fecha_evento: evento.fecha_evento as string,
        clues: evento.clues as string,
        estado: evento.estado as string,
        resumen: {
          total_claves: claves.length,
          riesgo_maximo: riesgoMaximo,
          critico,
          alto,
          medio,
          bajo,
        }
      };
    } catch (e) {
      await cx.query('ROLLBACK');
      throw e;
    } finally {
      cx.release();
    }
  }

  async listarEventos(input: RadarListarEventosInput) {
    const page = Math.max(1, parseIntSafe(input.page, 1));
    const pageSize = Math.min(200, Math.max(1, parseIntSafe(input.pageSize, 20)));
    const ofs = (page - 1) * pageSize;

    const desde = normText(input.desde);
    const hasta = normText(input.hasta);
    const clues = normUpper(input.clues);
    const estado = this.resolveEstado(input.estado || '');
    const riesgoMin = this.resolveRiesgoMin(input.riesgoMin);

    if (desde && !isISODateOnly(desde)) throw new Error('desde debe venir como YYYY-MM-DD');
    if (hasta && !isISODateOnly(hasta)) throw new Error('hasta debe venir como YYYY-MM-DD');

    const sql = `
      WITH base AS (
        SELECT
          e.id::int AS id,
          e.fecha_evento::text AS fecha_evento,
          e.clues,
          e.unidad_nombre,
          e.tipo_insumo,
          e.fecha_referencia::text AS fecha_referencia,
          e.motivo,
          e.observaciones,
          e.estado,
          e.creado_por,
          e.created_at::text AS created_at,
          COUNT(c.id)::int AS total_claves,
          MAX(
            CASE c.nivel_riesgo
              WHEN 'CRITICO' THEN 4
              WHEN 'ALTO' THEN 3
              WHEN 'MEDIO' THEN 2
              ELSE 1
            END
          ) AS riesgo_rank
        FROM public.radar_eventos e
        LEFT JOIN public.radar_evento_claves c ON c.evento_id = e.id
        WHERE ($1::date IS NULL OR e.fecha_evento >= $1::date)
          AND ($2::date IS NULL OR e.fecha_evento <= $2::date)
          AND ($3 = '' OR UPPER(TRIM(e.clues)) = $3)
          AND ($4 = '' OR e.estado = $4)
        GROUP BY e.id
      ),
      filtrado AS (
        SELECT *,
          CASE riesgo_rank
            WHEN 4 THEN 'CRITICO'
            WHEN 3 THEN 'ALTO'
            WHEN 2 THEN 'MEDIO'
            WHEN 1 THEN 'BAJO'
            ELSE NULL
          END AS riesgo_maximo
        FROM base
        WHERE (
          $5 = ''
          OR ($5 = 'BAJO' AND COALESCE(riesgo_rank, 0) >= 1)
          OR ($5 = 'MEDIO' AND COALESCE(riesgo_rank, 0) >= 2)
          OR ($5 = 'ALTO' AND COALESCE(riesgo_rank, 0) >= 3)
          OR ($5 = 'CRITICO' AND COALESCE(riesgo_rank, 0) >= 4)
        )
      )
      SELECT * FROM filtrado
      ORDER BY fecha_evento DESC, id DESC
      LIMIT $6 OFFSET $7;
    `;

    const countSql = `
      WITH base AS (
        SELECT
          e.id,
          MAX(
            CASE c.nivel_riesgo
              WHEN 'CRITICO' THEN 4
              WHEN 'ALTO' THEN 3
              WHEN 'MEDIO' THEN 2
              ELSE 1
            END
          ) AS riesgo_rank
        FROM public.radar_eventos e
        LEFT JOIN public.radar_evento_claves c ON c.evento_id = e.id
        WHERE ($1::date IS NULL OR e.fecha_evento >= $1::date)
          AND ($2::date IS NULL OR e.fecha_evento <= $2::date)
          AND ($3 = '' OR UPPER(TRIM(e.clues)) = $3)
          AND ($4 = '' OR e.estado = $4)
        GROUP BY e.id
      )
      SELECT COUNT(*)::int AS total
      FROM base
      WHERE (
        $5 = ''
        OR ($5 = 'BAJO' AND COALESCE(riesgo_rank, 0) >= 1)
        OR ($5 = 'MEDIO' AND COALESCE(riesgo_rank, 0) >= 2)
        OR ($5 = 'ALTO' AND COALESCE(riesgo_rank, 0) >= 3)
        OR ($5 = 'CRITICO' AND COALESCE(riesgo_rank, 0) >= 4)
      );
    `;

    const args = [
      desde || null,
      hasta || null,
      clues,
      input.estado ? estado : '',
      riesgoMin,
      pageSize,
      ofs
    ];

    const [rowsRes, countRes] = await Promise.all([
      pool.query(sql, args),
      pool.query(countSql, args.slice(0, 5))
    ]);

    return {
      page,
      pageSize,
      total: Number(countRes.rows?.[0]?.total ?? 0),
      data: (rowsRes.rows ?? []) as RadarEventoHeaderRow[]
    };
  }

  async getEventoDetalle(id: number) {
    if (!Number.isFinite(id) || id <= 0) throw new Error('id inválido');

    const eventoSql = `
      SELECT
        e.id::int AS id,
        e.fecha_evento::text AS fecha_evento,
        e.clues,
        e.unidad_nombre,
        e.tipo_insumo,
        e.fecha_referencia::text AS fecha_referencia,
        e.motivo,
        e.observaciones,
        e.estado,
        e.creado_por,
        e.created_at::text AS created_at,
        COUNT(c.id)::int AS total_claves,
        CASE MAX(
          CASE c.nivel_riesgo
            WHEN 'CRITICO' THEN 4
            WHEN 'ALTO' THEN 3
            WHEN 'MEDIO' THEN 2
            ELSE 1
          END
        )
          WHEN 4 THEN 'CRITICO'
          WHEN 3 THEN 'ALTO'
          WHEN 2 THEN 'MEDIO'
          WHEN 1 THEN 'BAJO'
          ELSE NULL
        END AS riesgo_maximo
      FROM public.radar_eventos e
      LEFT JOIN public.radar_evento_claves c ON c.evento_id = e.id
      WHERE e.id = $1::int
      GROUP BY e.id;
    `;

    const clavesSql = `
      SELECT
        id::int AS id,
        evento_id::int AS evento_id,
        clave_cnis,
        descripcion,
        existencia_actual::float AS existencia_actual,
        consumo_promedio::float AS consumo_promedio,
        dias_cobertura::float AS dias_cobertura,
        citas_pendientes::float AS citas_pendientes,
        entradas_30d::float AS entradas_30d,
        salidas_30d::float AS salidas_30d,
        traspasos_30d::float AS traspasos_30d,
        solicitado_30d::float AS solicitado_30d,
        movimientos_recientes::int AS movimientos_recientes,
        nivel_riesgo,
        COALESCE(flags, '[]'::jsonb) AS flags,
        created_at::text AS created_at,
        recalculated_at::text AS recalculated_at
      FROM public.radar_evento_claves
      WHERE evento_id = $1::int
      ORDER BY
        CASE nivel_riesgo
          WHEN 'CRITICO' THEN 1
          WHEN 'ALTO' THEN 2
          WHEN 'MEDIO' THEN 3
          ELSE 4
        END,
        clave_cnis ASC;
    `;

    const [eventoRes, clavesRes] = await Promise.all([
      pool.query(eventoSql, [id]),
      pool.query(clavesSql, [id])
    ]);

    const evento = (eventoRes.rows?.[0] ?? null) as RadarEventoHeaderRow | null;
    if (!evento) return null;

    const claves = (clavesRes.rows ?? []).map((r: any) => ({
      ...r,
      flags: Array.isArray(r.flags) ? r.flags : []
    })) as RadarEventoClaveRow[];

    return { evento, claves };
  }

  async patchEvento(id: number, patch: { estado?: string; motivo?: string; observaciones?: string }) {
    if (!Number.isFinite(id) || id <= 0) throw new Error('id inválido');

    const sets: string[] = [];
    const values: any[] = [id];
    let idx = 2;

    if (patch.estado !== undefined) {
      sets.push(`estado = $${idx++}`);
      values.push(this.resolveEstado(patch.estado));
    }
    if (patch.motivo !== undefined) {
      const motivo = normText(patch.motivo);
      if (!motivo) throw new Error('motivo no puede ir vacío');
      sets.push(`motivo = $${idx++}`);
      values.push(motivo);
    }
    if (patch.observaciones !== undefined) {
      sets.push(`observaciones = $${idx++}`);
      values.push(normText(patch.observaciones) || null);
    }

    if (!sets.length) throw new Error('Sin campos para actualizar');

    const sql = `
      UPDATE public.radar_eventos
      SET ${sets.join(', ')}
      WHERE id = $1::int
      RETURNING id::int AS id;
    `;
    const { rowCount } = await pool.query(sql, values);
    return (rowCount ?? 0) > 0;
  }

  async recalcularEvento(id: number) {
    if (!Number.isFinite(id) || id <= 0) throw new Error('id inválido');

    const cx = await pool.connect();
    try {
      await cx.query('BEGIN');

      const eventoRes = await cx.query(
        `SELECT id::int AS id, clues FROM public.radar_eventos WHERE id = $1::int LIMIT 1;`,
        [id]
      );
      const evento = eventoRes.rows?.[0];
      if (!evento) {
        await cx.query('ROLLBACK');
        return false;
      }

      const clavesRes = await cx.query(
        `SELECT id::int AS id, clave_cnis FROM public.radar_evento_claves WHERE evento_id = $1::int;`,
        [id]
      );

      for (const row of clavesRes.rows ?? []) {
        const clave = normUpper(row.clave_cnis);
        if (!clave) continue;

        const metricas = await this.obtenerMetricasClave(cx, normUpper(evento.clues), clave);
        const riesgo = this.calcularRiesgo(metricas);

        const sql = `
          UPDATE public.radar_evento_claves
          SET
            existencia_actual = $2::numeric,
            consumo_promedio = $3::numeric,
            dias_cobertura = $4::numeric,
            citas_pendientes = $5::numeric,
            entradas_30d = $6::numeric,
            salidas_30d = $7::numeric,
            traspasos_30d = $8::numeric,
            solicitado_30d = $9::numeric,
            movimientos_recientes = $10::int,
            nivel_riesgo = $11,
            flags = $12::jsonb,
            recalculated_at = now()
          WHERE id = $1::int;
        `;

        await cx.query(sql, [
          row.id,
          metricas.existencia_actual,
          metricas.consumo_promedio,
          metricas.dias_cobertura,
          metricas.citas_pendientes,
          metricas.entradas_30d,
          metricas.salidas_30d,
          metricas.traspasos_30d,
          metricas.solicitado_30d,
          metricas.movimientos_recientes,
          riesgo.nivel,
          JSON.stringify(riesgo.flags),
        ]);
      }

      await cx.query('COMMIT');
      return true;
    } catch (e) {
      await cx.query('ROLLBACK');
      throw e;
    } finally {
      cx.release();
    }
  }

  async listarGlobalSnapshot(input: RadarGlobalSnapshotInput) {
    const page = Math.max(1, parseIntSafe(input.page, 1));
    const pageSize = Math.min(300, Math.max(1, parseIntSafe(input.pageSize, 50)));
    const ofs = (page - 1) * pageSize;

    const search = String(input.search ?? '').trim();
    const clues = normUpper(input.clues);
    const tipoPedido = normUpper(input.tipo_pedido);
    const tiposInsumo = normUpper(input.tipos_insumo);
    const searchPredicate = `
          AND (
            $4 = ''
            OR s.cluesimb ILIKE '%' || $4 || '%'
            OR EXISTS (
              SELECT 1 FROM public.v_unidad_medica_detalle vumd
              WHERE vumd.cluesimb = UPPER(TRIM(s.cluesimb))
                AND COALESCE(vumd.nombre_de_unidad, '') ILIKE '%' || $4 || '%'
            )
            OR EXISTS (
              SELECT 1
              FROM public.solicitud_bitacora_detalle d
              LEFT JOIN public.articulos a ON UPPER(TRIM(a.clave)) = UPPER(TRIM(d.clave))
              WHERE d.solicitud_id = s.id
                AND (d.clave ILIKE '%' || $4 || '%' OR COALESCE(a.descripcion, '') ILIKE '%' || $4 || '%')
            )
          )`;

    const sql = `
      WITH latest AS (
        SELECT DISTINCT ON (
          UPPER(TRIM(s.cluesimb)),
          UPPER(TRIM(s.tipo_pedido)),
          UPPER(TRIM(COALESCE(array_to_string(s.tipos_insumo, ' - '), '')))
        )
          s.id::text AS id,
          s.created_day::text AS created_day,
          s.created_at::text AS created_at,
          s.cluesimb,
          s.tipo_pedido,
          COALESCE(array_to_string(s.tipos_insumo, ' - '), '') AS tipos_insumo,
          s.periodo_texto,
          COALESCE(s.total_renglones, 0)::int AS total_renglones,
          COALESCE(s.total_piezas, 0)::numeric AS total_piezas
        FROM public.solicitud_bitacora s
        WHERE ($1 = '' OR UPPER(TRIM(s.cluesimb)) = $1)
          AND ($2 = '' OR UPPER(TRIM(s.tipo_pedido)) = $2)
          AND (
            $3 = ''
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(s.tipos_insumo, ARRAY[]::text[])) ti
              WHERE UPPER(TRIM(ti)) = $3
            )
          )
          ${searchPredicate}
        ORDER BY
          UPPER(TRIM(s.cluesimb)),
          UPPER(TRIM(s.tipo_pedido)),
          UPPER(TRIM(COALESCE(array_to_string(s.tipos_insumo, ' - '), ''))),
          s.created_at DESC,
          s.id DESC
      )
      SELECT *
      FROM latest
      ORDER BY created_at DESC, id DESC
      LIMIT $5 OFFSET $6;
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT 1
        FROM public.solicitud_bitacora s
        WHERE ($1 = '' OR UPPER(TRIM(s.cluesimb)) = $1)
          AND ($2 = '' OR UPPER(TRIM(s.tipo_pedido)) = $2)
          AND (
            $3 = ''
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(s.tipos_insumo, ARRAY[]::text[])) ti
              WHERE UPPER(TRIM(ti)) = $3
            )
          )
          ${searchPredicate}
        GROUP BY
          UPPER(TRIM(s.cluesimb)),
          UPPER(TRIM(s.tipo_pedido)),
          UPPER(TRIM(COALESCE(array_to_string(s.tipos_insumo, ' - '), '')))
      ) x;
    `;

    const summarySql = `
      WITH latest AS (
        SELECT DISTINCT ON (
          UPPER(TRIM(s.cluesimb)),
          UPPER(TRIM(s.tipo_pedido)),
          UPPER(TRIM(COALESCE(array_to_string(s.tipos_insumo, ' - '), '')))
        )
          COALESCE(s.total_renglones, 0)::int AS total_renglones,
          COALESCE(s.total_piezas, 0)::numeric AS total_piezas
        FROM public.solicitud_bitacora s
        WHERE ($1 = '' OR UPPER(TRIM(s.cluesimb)) = $1)
          AND ($2 = '' OR UPPER(TRIM(s.tipo_pedido)) = $2)
          AND (
            $3 = ''
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(s.tipos_insumo, ARRAY[]::text[])) ti
              WHERE UPPER(TRIM(ti)) = $3
            )
          )
          ${searchPredicate}
        ORDER BY
          UPPER(TRIM(s.cluesimb)),
          UPPER(TRIM(s.tipo_pedido)),
          UPPER(TRIM(COALESCE(array_to_string(s.tipos_insumo, ' - '), ''))),
          s.created_at DESC,
          s.id DESC
      )
      SELECT
        COUNT(*)::int AS total_combinaciones,
        COALESCE(SUM(total_renglones), 0)::int AS total_renglones,
        COALESCE(SUM(total_piezas), 0)::numeric AS total_piezas
      FROM latest;
    `;

    const args = [clues, tipoPedido, tiposInsumo, search];
    const [rowsRes, countRes, summaryRes] = await Promise.all([
      pool.query(sql, [...args, pageSize, ofs]),
      pool.query(countSql, args),
      pool.query(summarySql, args),
    ]);

    const summary = summaryRes.rows?.[0] ?? {};

    return {
      mode: 'snapshot',
      page,
      pageSize,
      total: Number(countRes.rows?.[0]?.total ?? 0),
      summary: {
        total_combinaciones: Number(summary.total_combinaciones ?? 0),
        total_renglones: Number(summary.total_renglones ?? 0),
        total_piezas: Number(summary.total_piezas ?? 0),
      },
      data: (rowsRes.rows ?? []).map((r: any) => ({
        ...r,
        total_piezas: Number(r.total_piezas ?? 0),
        solicitado_acumulado: Number(r.total_piezas ?? 0) || 0,
        solicitado_promedio: Number(r.total_renglones ?? 0) > 0
          ? Math.round((Number(r.total_piezas ?? 0) || 0) / Number(r.total_renglones))
          : 0,
      })) as RadarGlobalSolicitudRow[],
    };
  }

  async listarGlobalTimeline(input: RadarGlobalTimelineInput) {
    const page = Math.max(1, parseIntSafe(input.page, 1));
    const pageSize = Math.min(500, Math.max(1, parseIntSafe(input.pageSize, 100)));
    const ofs = (page - 1) * pageSize;

    const search = String(input.search ?? '').trim();
    const clues = normUpper(input.clues);
    const tipoPedido = normUpper(input.tipo_pedido);
    const tiposInsumo = normUpper(input.tipos_insumo);
    const months = Math.min(24, Math.max(1, parseIntSafe(input.months, 3)));
    const searchPredicate = `
        AND (
          $5 = ''
          OR s.cluesimb ILIKE '%' || $5 || '%'
          OR EXISTS (
            SELECT 1 FROM public.v_unidad_medica_detalle vumd
            WHERE vumd.cluesimb = UPPER(TRIM(s.cluesimb))
              AND COALESCE(vumd.nombre_de_unidad, '') ILIKE '%' || $5 || '%'
          )
          OR EXISTS (
            SELECT 1
            FROM public.solicitud_bitacora_detalle d
            LEFT JOIN public.articulos a ON UPPER(TRIM(a.clave)) = UPPER(TRIM(d.clave))
            WHERE d.solicitud_id = s.id
              AND (d.clave ILIKE '%' || $5 || '%' OR COALESCE(a.descripcion, '') ILIKE '%' || $5 || '%')
          )
        )`;

    const sql = `
      SELECT
        s.id::text AS id,
        s.created_day::text AS created_day,
        s.created_at::text AS created_at,
        s.cluesimb,
        s.tipo_pedido,
        COALESCE(array_to_string(s.tipos_insumo, ' - '), '') AS tipos_insumo,
        s.periodo_texto,
        COALESCE(s.total_renglones, 0)::int AS total_renglones,
        COALESCE(s.total_piezas, 0)::numeric AS total_piezas
      FROM public.solicitud_bitacora s
      WHERE s.created_day >= (CURRENT_DATE - make_interval(months => $1::int))
        AND ($2 = '' OR UPPER(TRIM(s.cluesimb)) = $2)
        AND ($3 = '' OR UPPER(TRIM(s.tipo_pedido)) = $3)
        AND (
          $4 = ''
          OR EXISTS (
            SELECT 1
            FROM unnest(COALESCE(s.tipos_insumo, ARRAY[]::text[])) ti
            WHERE UPPER(TRIM(ti)) = $4
          )
        )
      ${searchPredicate}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT $6 OFFSET $7;
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM public.solicitud_bitacora s
      WHERE s.created_day >= (CURRENT_DATE - make_interval(months => $1::int))
        AND ($2 = '' OR UPPER(TRIM(s.cluesimb)) = $2)
        AND ($3 = '' OR UPPER(TRIM(s.tipo_pedido)) = $3)
        AND (
          $4 = ''
          OR EXISTS (
            SELECT 1
            FROM unnest(COALESCE(s.tipos_insumo, ARRAY[]::text[])) ti
            WHERE UPPER(TRIM(ti)) = $4
          )
        )
      ${searchPredicate};
    `;

    const summarySql = `
      SELECT
        COUNT(*)::int AS total_registros,
        COALESCE(SUM(COALESCE(s.total_renglones, 0)), 0)::int AS total_renglones,
        COALESCE(SUM(COALESCE(s.total_piezas, 0)), 0)::numeric AS total_piezas
      FROM public.solicitud_bitacora s
      WHERE s.created_day >= (CURRENT_DATE - make_interval(months => $1::int))
        AND ($2 = '' OR UPPER(TRIM(s.cluesimb)) = $2)
        AND ($3 = '' OR UPPER(TRIM(s.tipo_pedido)) = $3)
        AND (
          $4 = ''
          OR EXISTS (
            SELECT 1
            FROM unnest(COALESCE(s.tipos_insumo, ARRAY[]::text[])) ti
            WHERE UPPER(TRIM(ti)) = $4
          )
        )
      ${searchPredicate};
    `;

    const args = [months, clues, tipoPedido, tiposInsumo, search];
    const [rowsRes, countRes, summaryRes] = await Promise.all([
      pool.query(sql, [...args, pageSize, ofs]),
      pool.query(countSql, args),
      pool.query(summarySql, args),
    ]);

    const summary = summaryRes.rows?.[0] ?? {};

    return {
      mode: 'timeline',
      months,
      page,
      pageSize,
      total: Number(countRes.rows?.[0]?.total ?? 0),
      summary: {
        total_registros: Number(summary.total_registros ?? 0),
        total_renglones: Number(summary.total_renglones ?? 0),
        total_piezas: Number(summary.total_piezas ?? 0),
      },
      data: (rowsRes.rows ?? []).map((r: any) => ({
        ...r,
        total_piezas: Number(r.total_piezas ?? 0),
        solicitado_acumulado: Number(r.total_piezas ?? 0) || 0,
        solicitado_promedio: Number(r.total_renglones ?? 0) > 0
          ? Math.round((Number(r.total_piezas ?? 0) || 0) / Number(r.total_renglones))
          : 0,
      })) as RadarGlobalSolicitudRow[],
    };
  }

  async listarGlobalClavesRiesgo(input: RadarGlobalClavesRiesgoInput) {
    const page = Math.max(1, parseIntSafe(input.page, 1));
    const pageSize = Math.min(500, Math.max(1, parseIntSafe(input.pageSize, 100)));
    const ofs = (page - 1) * pageSize;

    const search = String(input.search ?? '').trim();
    const clues = normUpper(input.clues);
    const tipoPedido = normUpper(input.tipo_pedido);
    const tiposInsumo = normUpper(input.tipos_insumo);
    const months = Math.min(24, Math.max(1, parseIntSafe(input.months, 3)));
    const minSolicitado = Math.max(0, parseIntSafe(input.minSolicitado, 1));

    const baseCte = `
      WITH req AS (
        SELECT
          UPPER(TRIM(s.cluesimb)) AS cluesimb,
          UPPER(TRIM(d.clave)) AS clave,
          COALESCE(SUM(d.cantidad), 0)::numeric AS solicitado_periodo,
          COUNT(*)::int AS renglones_solicitados,
          MAX(s.created_day)::date AS ultima_solicitud
        FROM public.solicitud_bitacora s
        INNER JOIN public.solicitud_bitacora_detalle d ON d.solicitud_id = s.id
        WHERE s.created_day >= (CURRENT_DATE - make_interval(months => $1::int))
          AND ($2 = '' OR UPPER(TRIM(s.cluesimb)) = $2)
          AND ($3 = '' OR UPPER(TRIM(s.tipo_pedido)) = $3)
          AND (
            $4 = ''
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(s.tipos_insumo, ARRAY[]::text[])) ti
              WHERE UPPER(TRIM(ti)) = $4
            )
          )
        GROUP BY UPPER(TRIM(s.cluesimb)), UPPER(TRIM(d.clave))
      ),
      ex AS (
        SELECT
          UPPER(TRIM(t.cluesimb)) AS cluesimb,
          UPPER(TRIM(t.clave_cnis)) AS clave,
          COALESCE(SUM(t.existencia), 0)::numeric AS existencia_actual
        FROM public.tmp_existencias t
        GROUP BY UPPER(TRIM(t.cluesimb)), UPPER(TRIM(t.clave_cnis))
      ),
      cpm_ AS (
        SELECT
          UPPER(TRIM(um.cluesimb)) AS cluesimb,
          UPPER(TRIM(c.clave_cnis)) AS clave,
          COALESCE(MAX(c.cpm), 0)::numeric AS consumo_promedio
        FROM public.unidad_medica um
        INNER JOIN public.cpm c ON c.unidad_medica_id = um.id
        GROUP BY UPPER(TRIM(um.cluesimb)), UPPER(TRIM(c.clave_cnis))
      ),
      movimientos AS (
        SELECT
          'ENTRADA'::varchar(50) AS tipo_movimiento,
          COALESCE(um_destino.cluesimb, e.unidad_destino_texto) AS cluesimb,
          e.clave_cnis,
          e.cantidad
        FROM public.entrada e
        LEFT JOIN public.unidad_medica um_destino ON um_destino.id = e.unidad_destino_id
        WHERE e.fecha >= (CURRENT_DATE - INTERVAL '30 days')

        UNION ALL

        SELECT
          'TRASPASO'::varchar(50) AS tipo_movimiento,
          COALESCE(um_destino.cluesimb, t.unidad_destino_texto) AS cluesimb,
          t.clave_cnis,
          t.cantidad
        FROM public.traspaso t
        LEFT JOIN public.unidad_medica um_destino ON um_destino.id = t.unidad_destino_id
        WHERE t.fecha_recepcion >= (CURRENT_DATE - INTERVAL '30 days')

        UNION ALL

        SELECT
          'SALIDA'::varchar(50) AS tipo_movimiento,
          COALESCE(um_origen.cluesimb, s.unidad_origen_texto) AS cluesimb,
          s.clave_cnis,
          s.cantidad
        FROM public.salida s
        LEFT JOIN public.unidad_medica um_origen ON um_origen.id = s.unidad_origen_id
        WHERE s.fecha_entregado >= (CURRENT_DATE - INTERVAL '30 days')
      ),
      mov AS (
        SELECT
          UPPER(TRIM(m.cluesimb)) AS cluesimb,
          UPPER(TRIM(m.clave_cnis)) AS clave,
          COALESCE(SUM(CASE WHEN (m.tipo_movimiento = 'ENTRADA' OR m.tipo_movimiento = 'TRASPASO') THEN m.cantidad ELSE 0 END), 0)::numeric AS entradas_30d,
          COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'SALIDA' THEN m.cantidad ELSE 0 END), 0)::numeric AS salidas_30d
        FROM movimientos m
        GROUP BY UPPER(TRIM(m.cluesimb)), UPPER(TRIM(m.clave_cnis))
      ),
      calc AS (
        SELECT
          r.cluesimb,
          r.clave,
          r.solicitado_periodo,
          r.renglones_solicitados,
          r.ultima_solicitud::text AS ultima_solicitud,
          COALESCE(ex.existencia_actual, 0)::numeric AS existencia_actual,
          COALESCE(cpm_.consumo_promedio, 0)::numeric AS consumo_promedio,
          CASE
            WHEN COALESCE(cpm_.consumo_promedio, 0) > 0
              THEN ROUND((COALESCE(ex.existencia_actual, 0) / cpm_.consumo_promedio)::numeric, 2)
            ELSE NULL
          END AS dias_cobertura,
          COALESCE(mov.entradas_30d, 0)::numeric AS entradas_30d,
          COALESCE(mov.salidas_30d, 0)::numeric AS salidas_30d
        FROM req r
        LEFT JOIN ex   ON ex.cluesimb = r.cluesimb AND ex.clave = r.clave
        LEFT JOIN cpm_ ON cpm_.cluesimb = r.cluesimb AND cpm_.clave = r.clave
        LEFT JOIN mov  ON mov.cluesimb = r.cluesimb AND mov.clave = r.clave
        WHERE r.solicitado_periodo >= $5::numeric
      ),
      scored AS (
        SELECT
          c.*,
          (
            (CASE WHEN c.solicitado_periodo > 0 AND c.existencia_actual <= 0 THEN 100 ELSE 0 END) +
            (CASE WHEN c.consumo_promedio > 0 AND COALESCE(c.dias_cobertura, 99999) < 7 THEN 45 ELSE 0 END) +
            (CASE WHEN c.solicitado_periodo > c.existencia_actual THEN 25 ELSE 0 END) +
            (CASE WHEN c.salidas_30d > c.entradas_30d THEN 10 ELSE 0 END)
          )::int AS puntaje_desabasto,
          (
            (CASE WHEN c.consumo_promedio > 0 AND COALESCE(c.dias_cobertura, 0) >= 120 THEN 85 ELSE 0 END) +
            (CASE WHEN c.consumo_promedio > 0 AND COALESCE(c.dias_cobertura, 0) >= 60 THEN 35 ELSE 0 END) +
            (CASE WHEN c.consumo_promedio <= 0 AND c.existencia_actual >= 100 THEN 30 ELSE 0 END) +
            (CASE WHEN c.entradas_30d > c.salidas_30d AND c.existencia_actual > 0 THEN 10 ELSE 0 END)
          )::int AS puntaje_sobreabasto
        FROM calc c
      ),
      filtered AS (
        SELECT
          s.*,
          vumd.nombre_de_unidad,
          a.descripcion
        FROM scored s
        LEFT JOIN public.v_unidad_medica_detalle vumd ON vumd.cluesimb = s.cluesimb
        LEFT JOIN public.articulos a ON UPPER(TRIM(a.clave)) = s.clave
        WHERE $6 = ''
          OR s.cluesimb ILIKE '%' || $6 || '%'
          OR s.clave ILIKE '%' || $6 || '%'
          OR COALESCE(vumd.nombre_de_unidad, '') ILIKE '%' || $6 || '%'
          OR COALESCE(a.descripcion, '') ILIKE '%' || $6 || '%'
      )
    `;

    const selectFields = `
      s.cluesimb,
      s.nombre_de_unidad,
      s.clave,
      s.descripcion,
      s.solicitado_periodo::numeric::text AS solicitado_acumulado,
      ROUND((s.solicitado_periodo / NULLIF(s.renglones_solicitados, 0))::numeric, 0)::text AS solicitado_promedio,
      s.solicitado_periodo::numeric::text AS solicitado_periodo,
      s.renglones_solicitados::int AS renglones_solicitados,
      s.existencia_actual::numeric::text AS existencia_actual,
      s.consumo_promedio::numeric::text AS consumo_promedio,
      s.dias_cobertura::numeric::text AS dias_cobertura,
      s.entradas_30d::numeric::text AS entradas_30d,
      s.salidas_30d::numeric::text AS salidas_30d,
      s.ultima_solicitud,
      s.puntaje_desabasto::int AS puntaje_desabasto,
      CASE
        WHEN s.puntaje_desabasto >= 100 THEN 'CRITICO'
        WHEN s.puntaje_desabasto >= 60 THEN 'ALTO'
        WHEN s.puntaje_desabasto >= 30 THEN 'MEDIO'
        ELSE 'BAJO'
      END AS nivel_desabasto,
      s.puntaje_sobreabasto::int AS puntaje_sobreabasto,
      CASE
        WHEN s.puntaje_sobreabasto >= 80 THEN 'ALTO'
        WHEN s.puntaje_sobreabasto >= 35 THEN 'MEDIO'
        ELSE 'BAJO'
      END AS nivel_sobreabasto
    `;

    const pageSql = `
      ${baseCte}
      SELECT ${selectFields}
      FROM filtered s
      ORDER BY s.puntaje_desabasto DESC, s.solicitado_periodo DESC, s.cluesimb, s.clave
      LIMIT $7 OFFSET $8;
    `;

    const countSql = `
      ${baseCte}
      SELECT COUNT(*)::int AS total FROM filtered;
    `;

    const topDesabastoSql = `
      ${baseCte}
      SELECT ${selectFields}
      FROM filtered s
      WHERE s.puntaje_desabasto >= 30
      ORDER BY s.puntaje_desabasto DESC, s.solicitado_periodo DESC, s.cluesimb, s.clave
      LIMIT 20;
    `;

    const topSobreabastoSql = `
      ${baseCte}
      SELECT ${selectFields}
      FROM filtered s
      WHERE s.puntaje_sobreabasto >= 35
      ORDER BY s.puntaje_sobreabasto DESC, s.existencia_actual DESC, s.cluesimb, s.clave
      LIMIT 20;
    `;   

    const args = [months, clues, tipoPedido, tiposInsumo, minSolicitado, search];
     

    const [pageRes, countRes, topDRes, topSRes] = await Promise.all([
      pool.query(pageSql, [...args, pageSize, ofs]),
      pool.query(countSql, args),
      pool.query(topDesabastoSql, args),
      pool.query(topSobreabastoSql, args),
    ]);

    const mapRow = (r: any): RadarGlobalClaveRiesgoRow => ({
      cluesimb: String(r.cluesimb ?? ''),
      nombre_de_unidad: r.nombre_de_unidad == null ? null : String(r.nombre_de_unidad),
      clave: String(r.clave ?? ''),
      descripcion: r.descripcion == null ? null : String(r.descripcion),
      solicitado_acumulado: Number(r.solicitado_acumulado ?? r.solicitado_periodo ?? 0) || 0,
      solicitado_promedio: Number(r.solicitado_promedio ?? 0) || 0,
      solicitado_periodo: Number(r.solicitado_periodo ?? 0) || 0,
      renglones_solicitados: Number(r.renglones_solicitados ?? 0) || 0,
      existencia_actual: Number(r.existencia_actual ?? 0) || 0,
      consumo_promedio: Number(r.consumo_promedio ?? 0) || 0,
      dias_cobertura: r.dias_cobertura == null ? null : Number(r.dias_cobertura),
      entradas_30d: Number(r.entradas_30d ?? 0) || 0,
      salidas_30d: Number(r.salidas_30d ?? 0) || 0,
      ultima_solicitud: r.ultima_solicitud ? String(r.ultima_solicitud) : null,
      puntaje_desabasto: Number(r.puntaje_desabasto ?? 0) || 0,
      nivel_desabasto: (r.nivel_desabasto ?? 'BAJO') as any,
      puntaje_sobreabasto: Number(r.puntaje_sobreabasto ?? 0) || 0,
      nivel_sobreabasto: (r.nivel_sobreabasto ?? 'BAJO') as any,
    });

    return {
      mode: 'claves-riesgo',
      window: { months },
      page,
      pageSize,
      total: Number(countRes.rows?.[0]?.total ?? 0),
      data: (pageRes.rows ?? []).map(mapRow),
      top_desabasto: (topDRes.rows ?? []).map(mapRow),
      top_sobreabasto: (topSRes.rows ?? []).map(mapRow),
    };
  }

  async listarGlobalV2(input: RadarGlobalV2Input) {
    const page = Math.max(1, parseIntSafe(input.page, 1));
    const pageSizeMax = input.export ? 50000 : 200;
    const pageSize = Math.min(pageSizeMax, Math.max(1, parseIntSafe(input.pageSize, 25)));
    const offset = (page - 1) * pageSize;
    const months = Math.min(12, Math.max(1, parseIntSafe(input.months, 3)));
    const search = normText(input.search);
    const clues = normUpper(input.clues);
    const segmentos: RadarGlobalV2Segmento[] = [
      'CRITICA_CPM', 'ATENCION_CPM', 'DEMANDA_SIN_CPM',
      'CPM_SIN_SOLICITUD', 'CUBIERTA', 'OBSERVAR'
    ];
    const segmento = segmentos.includes(input.segmento as RadarGlobalV2Segmento)
      ? input.segmento as RadarGlobalV2Segmento
      : '';
    const estadosOperativos: RadarGlobalV2EstadoOperativo[] = [
      'VIGENTE_EN_PROCESO', 'VIGENTE_CON_SALIDA', 'FUERA_UMBRAL_SIN_SALIDA',
      'HISTORICA_CON_SALIDA', 'SIN_SOLICITUD_OBSERVADA'
    ];
    const estadoOperativo = estadosOperativos.includes(input.estado_operativo as RadarGlobalV2EstadoOperativo)
      ? input.estado_operativo as RadarGlobalV2EstadoOperativo
      : '';

    const sql = `
      WITH ciclos AS (
        SELECT UPPER(TRIM(s.cluesimb)) AS cluesimb, COUNT(DISTINCT s.id)::int AS ciclos_unidad
        FROM public.solicitud_bitacora s
        WHERE s.created_day BETWEEN CURRENT_DATE - make_interval(months => $1::int) AND CURRENT_DATE
        GROUP BY UPPER(TRIM(s.cluesimb))
      ),
      demanda AS (
        SELECT UPPER(TRIM(s.cluesimb)) AS cluesimb,
               UPPER(TRIM(d.clave)) AS clave,
               COALESCE(SUM(d.cantidad), 0)::numeric AS solicitado_periodo,
               COUNT(DISTINCT s.id)::int AS ciclos_con_clave,
               COALESCE(SUM(d.cantidad) FILTER (
                 WHERE s.created_day BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE
               ), 0)::numeric AS solicitado_vigente,
               COUNT(DISTINCT s.id) FILTER (
                 WHERE s.created_day BETWEEN CURRENT_DATE - INTERVAL '14 days' AND CURRENT_DATE
               )::int AS ciclos_vigentes,
               MIN(s.created_day)::date AS primera_solicitud,
               MAX(s.created_day)::date AS ultima_solicitud
        FROM public.solicitud_bitacora s
        JOIN public.solicitud_bitacora_detalle d ON d.solicitud_id = s.id
        WHERE s.created_day BETWEEN CURRENT_DATE - make_interval(months => $1::int) AND CURRENT_DATE
          AND NULLIF(UPPER(TRIM(d.clave)), '') IS NOT NULL
        GROUP BY UPPER(TRIM(s.cluesimb)), UPPER(TRIM(d.clave))
      ),
      cpm_ AS (
        SELECT UPPER(TRIM(um.cluesimb)) AS cluesimb,
               UPPER(TRIM(c.clave_cnis)) AS clave,
               COALESCE(MAX(c.cpm), 0)::numeric AS cpm
        FROM public.cpm c
        JOIN public.unidad_medica um ON um.id = c.unidad_medica_id
        WHERE NULLIF(UPPER(TRIM(um.cluesimb)), '') IS NOT NULL
          AND NULLIF(UPPER(TRIM(c.clave_cnis)), '') IS NOT NULL
        GROUP BY UPPER(TRIM(um.cluesimb)), UPPER(TRIM(c.clave_cnis))
      ),
      universo AS (
        SELECT cluesimb, clave FROM demanda
        UNION
        SELECT cluesimb, clave FROM cpm_ WHERE cpm > 0
      ),
      existencias AS (
        SELECT UPPER(TRIM(t.cluesimb)) AS cluesimb,
               UPPER(TRIM(t.clave_cnis)) AS clave,
               COALESCE(SUM(t.existencia), 0)::numeric AS existencia_actual,
               MAX(t.cargado_en) AS snapshot_existencias
        FROM public.tmp_existencias t
        GROUP BY UPPER(TRIM(t.cluesimb)), UPPER(TRIM(t.clave_cnis))
      ),
      aristas AS (
        SELECT UPPER(TRIM(h.clave)) AS clave,
               UPPER(TRIM(h.sustituto)) AS candidato,
               NULLIF(h.factor::numeric, 0) AS factor
        FROM public.homologos h
        WHERE NULLIF(UPPER(TRIM(h.clave)), '') IS NOT NULL
          AND NULLIF(UPPER(TRIM(h.sustituto)), '') IS NOT NULL
          AND h.factor::numeric > 0
        UNION ALL
        SELECT UPPER(TRIM(h.sustituto)), UPPER(TRIM(h.clave)),
               1 / NULLIF(h.factor::numeric, 0)
        FROM public.homologos h
        WHERE NULLIF(UPPER(TRIM(h.clave)), '') IS NOT NULL
          AND NULLIF(UPPER(TRIM(h.sustituto)), '') IS NOT NULL
          AND h.factor::numeric > 0
      ),
      homologos_stock AS (
        SELECT u.cluesimb, u.clave,
               COUNT(*) FILTER (WHERE COALESCE(e.existencia_actual, 0) > 0)::int AS homologos_disponibles,
               COALESCE(SUM(COALESCE(e.existencia_actual, 0) / a.factor), 0)::numeric AS existencia_homologos_equivalente,
               (ARRAY_AGG(a.candidato ORDER BY COALESCE(e.existencia_actual, 0) / a.factor DESC)
                 FILTER (WHERE COALESCE(e.existencia_actual, 0) > 0))[1] AS mejor_homologo
        FROM universo u
        JOIN aristas a ON a.clave = u.clave
        LEFT JOIN existencias e ON e.cluesimb = u.cluesimb AND e.clave = a.candidato
        GROUP BY u.cluesimb, u.clave
      ),
      salidas_posteriores AS (
        SELECT d.cluesimb, d.clave,
               COALESCE(SUM(s.cantidad), 0)::numeric AS piezas_salida_posterior,
               MAX(s.fecha_entregado)::date AS ultima_salida_posterior
        FROM demanda d
        JOIN public.unidad_medica um ON UPPER(TRIM(um.cluesimb)) = d.cluesimb
        JOIN public.salida s ON s.unidad_destino_id = um.id
          AND UPPER(TRIM(s.clave_cnis)) = d.clave
          AND s.fecha_entregado::date >= d.ultima_solicitud
          AND s.fecha_entregado::date <= CURRENT_DATE
        GROUP BY d.cluesimb, d.clave
      ),
      ordenes AS (
        SELECT UPPER(TRIM(um.cluesimb)) AS cluesimb,
               UPPER(TRIM(c.clave_cnis)) AS clave,
               COUNT(DISTINCT c.orden_de_suministro) FILTER (
                 WHERE GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0
               )::int AS ordenes_pendientes,
               COALESCE(SUM(GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0)), 0)::numeric AS piezas_pendientes,
               COUNT(DISTINCT c.orden_de_suministro) FILTER (
                 WHERE GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0
                   AND c.fecha_limite_de_entrega BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
               )::int AS ordenes_por_vencer,
               COUNT(DISTINCT c.orden_de_suministro) FILTER (
                 WHERE GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0
                   AND c.fecha_limite_de_entrega < CURRENT_DATE
               )::int AS ordenes_vencidas,
               COUNT(DISTINCT c.orden_de_suministro) FILTER (
                 WHERE c.fecha_recepcion_max >= CURRENT_DATE - INTERVAL '30 days'
               )::int AS recepciones_recientes,
               COALESCE(SUM(c.pzas_recibidas_por_la_entidad) FILTER (
                 WHERE c.fecha_recepcion_max >= CURRENT_DATE - INTERVAL '30 days'
               ), 0)::numeric AS piezas_recibidas_recientes,
               MIN(c.fecha_limite_de_entrega) FILTER (
                 WHERE GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0
                   AND c.fecha_limite_de_entrega >= CURRENT_DATE
               ) AS proxima_entrega
        FROM public.citas c
        JOIN public.unidad_medica um
          ON UPPER(TRIM(c.clues_destino)) IN (UPPER(TRIM(um.cluesimb)), UPPER(TRIM(um.cluessa)))
        WHERE NULLIF(UPPER(TRIM(c.clave_cnis)), '') IS NOT NULL
          AND (c.fecha_emision >= CURRENT_DATE - make_interval(months => $1::int)
            OR c.fecha_recepcion_max >= CURRENT_DATE - INTERVAL '30 days'
            OR (c.fecha_limite_de_entrega >= CURRENT_DATE - INTERVAL '30 days'
              AND GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0))
        GROUP BY UPPER(TRIM(um.cluesimb)), UPPER(TRIM(c.clave_cnis))
      ),
      base AS (
        SELECT u.cluesimb, vumd.nombre_de_unidad, u.clave, a.descripcion,
               COALESCE(c.cpm, 0)::numeric AS cpm,
               (COALESCE(c.cpm, 0) > 0) AS en_cpm,
               COALESCE(e.existencia_actual, 0)::numeric AS existencia_actual,
               e.snapshot_existencias,
               CASE WHEN COALESCE(c.cpm, 0) > 0 THEN ROUND(COALESCE(e.existencia_actual, 0) / c.cpm, 2) END AS cobertura_cpm,
               CASE WHEN COALESCE(c.cpm, 0) > 0 THEN ROUND((COALESCE(e.existencia_actual, 0) / c.cpm) * 30, 1) END AS cobertura_dias,
               COALESCE(d.solicitado_periodo, 0)::numeric AS solicitado_periodo,
               COALESCE(d.ciclos_con_clave, 0)::int AS ciclos_con_clave,
               COALESCE(ci.ciclos_unidad, 0)::int AS ciclos_unidad,
               CASE WHEN COALESCE(ci.ciclos_unidad, 0) > 0
                    THEN ROUND(d.ciclos_con_clave::numeric / ci.ciclos_unidad, 4) ELSE 0 END AS frecuencia_solicitud,
               d.primera_solicitud, d.ultima_solicitud,
               COALESCE(d.solicitado_vigente, 0)::numeric AS solicitado_vigente,
               COALESCE(d.ciclos_vigentes, 0)::int AS ciclos_vigentes,
               (COALESCE(d.ciclos_vigentes, 0) > 0) AS solicitud_vigente,
               CASE WHEN d.ultima_solicitud IS NOT NULL THEN (CURRENT_DATE - d.ultima_solicitud)::int END AS dias_desde_ultima_solicitud,
               CASE WHEN d.ultima_solicitud IS NOT NULL THEN (d.ultima_solicitud + 14)::date END AS fecha_fin_umbral,
               CASE WHEN d.ultima_solicitud IS NOT NULL THEN GREATEST((d.ultima_solicitud + 14 - CURRENT_DATE)::int, 0) END AS dias_restantes_umbral,
               (COALESCE(sp.piezas_salida_posterior, 0) > 0) AS salida_posterior,
               COALESCE(sp.piezas_salida_posterior, 0)::numeric AS piezas_salida_posterior,
               sp.ultima_salida_posterior,
               COALESCE(hs.homologos_disponibles, 0)::int AS homologos_disponibles,
               ROUND(COALESCE(hs.existencia_homologos_equivalente, 0), 2) AS existencia_homologos_equivalente,
               hs.mejor_homologo,
               COALESCE(o.ordenes_pendientes, 0)::int AS ordenes_pendientes,
               COALESCE(o.piezas_pendientes, 0)::numeric AS piezas_pendientes,
               COALESCE(o.ordenes_por_vencer, 0)::int AS ordenes_por_vencer,
               COALESCE(o.ordenes_vencidas, 0)::int AS ordenes_vencidas,
               COALESCE(o.recepciones_recientes, 0)::int AS recepciones_recientes,
               COALESCE(o.piezas_recibidas_recientes, 0)::numeric AS piezas_recibidas_recientes,
               o.proxima_entrega,
               ROUND(COALESCE(e.existencia_actual, 0) + COALESCE(hs.existencia_homologos_equivalente, 0) + COALESCE(o.piezas_pendientes, 0), 2) AS cobertura_proyectada,
               CASE WHEN COALESCE(c.cpm, 0) > 0 THEN ROUND(
                 (COALESCE(e.existencia_actual, 0) + COALESCE(hs.existencia_homologos_equivalente, 0) + COALESCE(o.piezas_pendientes, 0)) / c.cpm, 2
               ) END AS cobertura_proyectada_cpm
        FROM universo u
        LEFT JOIN demanda d ON d.cluesimb = u.cluesimb AND d.clave = u.clave
        LEFT JOIN ciclos ci ON ci.cluesimb = u.cluesimb
        LEFT JOIN cpm_ c ON c.cluesimb = u.cluesimb AND c.clave = u.clave
        LEFT JOIN existencias e ON e.cluesimb = u.cluesimb AND e.clave = u.clave
        LEFT JOIN homologos_stock hs ON hs.cluesimb = u.cluesimb AND hs.clave = u.clave
        LEFT JOIN salidas_posteriores sp ON sp.cluesimb = u.cluesimb AND sp.clave = u.clave
        LEFT JOIN ordenes o ON o.cluesimb = u.cluesimb AND o.clave = u.clave
        LEFT JOIN public.v_unidad_medica_detalle vumd ON UPPER(TRIM(vumd.cluesimb)) = u.cluesimb
        LEFT JOIN public.articulos a ON UPPER(TRIM(a.clave)) = u.clave
      ),
      clasificado AS (
        SELECT b.*,
          CASE
            WHEN b.solicitud_vigente AND b.salida_posterior THEN 'VIGENTE_CON_SALIDA'
            WHEN b.solicitud_vigente THEN 'VIGENTE_EN_PROCESO'
            WHEN b.ultima_solicitud IS NOT NULL AND b.salida_posterior THEN 'HISTORICA_CON_SALIDA'
            WHEN b.ultima_solicitud IS NOT NULL THEN 'FUERA_UMBRAL_SIN_SALIDA'
            ELSE 'SIN_SOLICITUD_OBSERVADA'
          END AS estado_operativo,
          CASE
            WHEN b.cpm > 0 AND b.existencia_actual < b.cpm AND b.solicitado_periodo > 0
              AND b.existencia_actual + b.existencia_homologos_equivalente >= b.cpm THEN 'CUBIERTA'
            WHEN b.cpm > 0 AND b.existencia_actual < b.cpm AND b.solicitado_periodo > 0
              AND (b.existencia_actual <= 0 OR b.frecuencia_solicitud >= .5) THEN 'CRITICA_CPM'
            WHEN b.cpm > 0 AND b.existencia_actual < b.cpm AND b.solicitado_periodo > 0 THEN 'ATENCION_CPM'
            WHEN b.cpm <= 0 AND b.solicitado_periodo > 0 AND b.existencia_actual <= 0 THEN 'DEMANDA_SIN_CPM'
            WHEN b.cpm > 0 AND b.solicitado_periodo <= 0 THEN 'CPM_SIN_SOLICITUD'
            WHEN b.cpm > 0 AND b.existencia_actual >= b.cpm THEN 'CUBIERTA'
            ELSE 'OBSERVAR'
          END AS segmento,
          CASE
            WHEN b.cpm > 0 AND b.existencia_actual < b.cpm AND b.solicitado_periodo > 0 AND (b.existencia_actual <= 0 OR b.frecuencia_solicitud >= .5) THEN 100
            WHEN b.cpm <= 0 AND b.solicitado_periodo > 0 AND b.existencia_actual <= 0 THEN 90
            WHEN b.cpm > 0 AND b.existencia_actual < b.cpm AND b.solicitado_periodo > 0 THEN 75
            WHEN b.cpm > 0 AND b.solicitado_periodo <= 0 THEN 45
            ELSE 20
          END::int AS prioridad
        FROM base b
      ),
      filtrado AS (
        SELECT c.*,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN c.cpm > 0 AND c.existencia_actual < c.cpm THEN 'Existencia menor a un CPM' END,
            CASE WHEN c.cpm <= 0 AND c.solicitado_periodo > 0 THEN 'Demanda observada sin CPM' END,
            CASE WHEN c.cpm > 0 AND c.solicitado_periodo <= 0 THEN 'Sin solicitud observada en el periodo' END,
            CASE WHEN c.frecuencia_solicitud >= .5 THEN 'Solicitada en al menos la mitad de los ciclos' END,
            CASE WHEN c.existencia_actual <= 0 THEN 'Sin existencia en el snapshot actual' END,
            CASE WHEN c.homologos_disponibles > 0 THEN 'Cuenta con alternativas con existencia local' END
            ,CASE WHEN c.ordenes_pendientes > 0 THEN 'Cuenta con orden de suministro pendiente para la unidad' END
            ,CASE WHEN c.ordenes_por_vencer > 0 THEN 'Tiene órdenes con entrega prevista en los próximos 30 días' END
            ,CASE WHEN c.ordenes_vencidas > 0 THEN 'Tiene órdenes vencidas con saldo pendiente' END
            ,CASE WHEN c.recepciones_recientes > 0 THEN 'Registra recepciones durante los últimos 30 días' END
            ,CASE WHEN c.solicitud_vigente THEN 'Solicitud dentro del umbral operativo de 14 días' END
            ,CASE WHEN c.estado_operativo = 'FUERA_UMBRAL_SIN_SALIDA' THEN 'Solicitud fuera del umbral sin salida posterior observada' END
            ,CASE WHEN c.salida_posterior THEN 'Registra salida posterior a la última solicitud' END
          ], NULL)::text[] AS razones
        FROM clasificado c
        WHERE ($2 = '' OR c.cluesimb = $2)
          AND ($3 = '' OR c.segmento = $3)
          AND ($4 = '' OR c.estado_operativo = $4)
          AND ($5 = '' OR c.cluesimb ILIKE '%' || $5 || '%'
            OR c.clave ILIKE '%' || $5 || '%'
            OR COALESCE(c.nombre_de_unidad, '') ILIKE '%' || $5 || '%'
            OR COALESCE(c.descripcion, '') ILIKE '%' || $5 || '%')
      )
      SELECT f.*,
             COUNT(*) OVER()::int AS total_rows,
             COUNT(*) FILTER (WHERE segmento = 'CRITICA_CPM') OVER()::int AS total_criticas,
             COUNT(*) FILTER (WHERE segmento = 'ATENCION_CPM') OVER()::int AS total_atencion,
             COUNT(*) FILTER (WHERE segmento = 'DEMANDA_SIN_CPM') OVER()::int AS total_sin_cpm,
             COUNT(*) FILTER (WHERE segmento = 'CPM_SIN_SOLICITUD') OVER()::int AS total_sin_solicitud,
             COUNT(*) FILTER (WHERE segmento = 'CUBIERTA') OVER()::int AS total_cubiertas
      FROM filtrado f
      ORDER BY f.prioridad DESC, f.frecuencia_solicitud DESC, f.solicitado_periodo DESC, f.cluesimb, f.clave
      LIMIT $6 OFFSET $7;
    `;

    const { rows } = await pool.query(sql, [months, clues, segmento, estadoOperativo, search, pageSize, offset]);
    const first = rows?.[0] ?? {};
    const data: RadarGlobalV2Row[] = (rows ?? []).map((r: any) => ({
      cluesimb: String(r.cluesimb ?? ''), nombre_de_unidad: r.nombre_de_unidad ?? null,
      clave: String(r.clave ?? ''), descripcion: r.descripcion ?? null,
      cpm: Number(r.cpm ?? 0), en_cpm: Boolean(r.en_cpm), existencia_actual: Number(r.existencia_actual ?? 0),
      snapshot_existencias: r.snapshot_existencias ? new Date(r.snapshot_existencias).toISOString() : null,
      cobertura_cpm: r.cobertura_cpm == null ? null : Number(r.cobertura_cpm),
      cobertura_dias: r.cobertura_dias == null ? null : Number(r.cobertura_dias),
      solicitado_periodo: Number(r.solicitado_periodo ?? 0), ciclos_con_clave: Number(r.ciclos_con_clave ?? 0),
      ciclos_unidad: Number(r.ciclos_unidad ?? 0), frecuencia_solicitud: Number(r.frecuencia_solicitud ?? 0),
      primera_solicitud: r.primera_solicitud?.toISOString?.().slice(0, 10) ?? r.primera_solicitud ?? null,
      ultima_solicitud: r.ultima_solicitud?.toISOString?.().slice(0, 10) ?? r.ultima_solicitud ?? null,
      solicitado_vigente: Number(r.solicitado_vigente ?? 0), ciclos_vigentes: Number(r.ciclos_vigentes ?? 0),
      solicitud_vigente: Boolean(r.solicitud_vigente),
      dias_desde_ultima_solicitud: r.dias_desde_ultima_solicitud == null ? null : Number(r.dias_desde_ultima_solicitud),
      fecha_fin_umbral: r.fecha_fin_umbral?.toISOString?.().slice(0, 10) ?? r.fecha_fin_umbral ?? null,
      dias_restantes_umbral: r.dias_restantes_umbral == null ? null : Number(r.dias_restantes_umbral),
      salida_posterior: Boolean(r.salida_posterior), piezas_salida_posterior: Number(r.piezas_salida_posterior ?? 0),
      ultima_salida_posterior: r.ultima_salida_posterior?.toISOString?.().slice(0, 10) ?? r.ultima_salida_posterior ?? null,
      estado_operativo: r.estado_operativo,
      homologos_disponibles: Number(r.homologos_disponibles ?? 0),
      existencia_homologos_equivalente: Number(r.existencia_homologos_equivalente ?? 0),
      mejor_homologo: r.mejor_homologo ?? null, segmento: r.segmento, prioridad: Number(r.prioridad ?? 0),
      ordenes_pendientes: Number(r.ordenes_pendientes ?? 0), piezas_pendientes: Number(r.piezas_pendientes ?? 0),
      ordenes_por_vencer: Number(r.ordenes_por_vencer ?? 0), ordenes_vencidas: Number(r.ordenes_vencidas ?? 0),
      recepciones_recientes: Number(r.recepciones_recientes ?? 0),
      piezas_recibidas_recientes: Number(r.piezas_recibidas_recientes ?? 0),
      proxima_entrega: r.proxima_entrega?.toISOString?.().slice(0, 10) ?? r.proxima_entrega ?? null,
      cobertura_proyectada: Number(r.cobertura_proyectada ?? 0),
      cobertura_proyectada_cpm: r.cobertura_proyectada_cpm == null ? null : Number(r.cobertura_proyectada_cpm),
      razones: Array.isArray(r.razones) ? r.razones : []
    }));

    return {
      mode: 'radar-global-v2', window: { months }, page, pageSize,
      total: Number(first.total_rows ?? 0),
      truncated: Boolean(input.export && Number(first.total_rows ?? 0) > data.length),
      summary: {
        criticas_cpm: Number(first.total_criticas ?? 0), atencion_cpm: Number(first.total_atencion ?? 0),
        demanda_sin_cpm: Number(first.total_sin_cpm ?? 0), cpm_sin_solicitud: Number(first.total_sin_solicitud ?? 0),
        cubiertas: Number(first.total_cubiertas ?? 0)
      },
      data
    };
  }

  async listarGlobalV2Ordenes(cluesInput: unknown, claveInput: unknown, monthsInput: unknown) {
    const clues = normUpper(cluesInput);
    const clave = normUpper(claveInput);
    const months = Math.min(12, Math.max(1, parseIntSafe(monthsInput, 3)));
    if (!clues || !clave) throw new Error('clues y clave son requeridos');

    const { rows } = await pool.query(`
      SELECT c.orden_de_suministro, c.proveedor,
             c.fecha_emision::text AS fecha_emision,
             c.fecha_limite_de_entrega::text AS fecha_limite_de_entrega,
             c.fecha_recepcion_max::text AS fecha_recepcion,
             COALESCE(c.no_de_piezas_emitidas, 0)::numeric AS piezas_emitidas,
             COALESCE(c.pzas_recibidas_por_la_entidad, 0)::numeric AS piezas_recibidas,
             GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0)::numeric AS piezas_pendientes,
             CASE
               WHEN GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) <= 0
                 AND c.fecha_recepcion_max >= CURRENT_DATE - INTERVAL '30 days' THEN 'CUMPLIDA_RECIENTE'
               WHEN c.fecha_limite_de_entrega < CURRENT_DATE
                 AND GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0 THEN 'VENCIDA'
               WHEN c.fecha_limite_de_entrega BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                 AND GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0 THEN 'POR_VENCER'
               ELSE 'PENDIENTE'
             END AS estado_radar
      FROM public.citas c
      JOIN public.unidad_medica um
        ON UPPER(TRIM(c.clues_destino)) IN (UPPER(TRIM(um.cluesimb)), UPPER(TRIM(um.cluessa)))
      WHERE UPPER(TRIM(um.cluesimb)) = $1 AND UPPER(TRIM(c.clave_cnis)) = $2
        AND (c.fecha_emision >= CURRENT_DATE - make_interval(months => $3::int)
          OR c.fecha_recepcion_max >= CURRENT_DATE - INTERVAL '30 days'
          OR (c.fecha_limite_de_entrega >= CURRENT_DATE - INTERVAL '30 days'
            AND GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0))
      ORDER BY
        CASE
          WHEN c.fecha_limite_de_entrega < CURRENT_DATE
            AND GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0 THEN 0
          WHEN GREATEST(COALESCE(c.no_de_piezas_emitidas, 0) - COALESCE(c.pzas_recibidas_por_la_entidad, 0), 0) > 0 THEN 1
          ELSE 2
        END,
        COALESCE(c.fecha_limite_de_entrega, c.fecha_recepcion_max) DESC NULLS LAST
      LIMIT 50`, [clues, clave, months]);

    const data: RadarGlobalV2OrdenRow[] = rows.map((r: any) => ({
      orden_de_suministro: r.orden_de_suministro ?? null,
      proveedor: r.proveedor ?? null,
      fecha_emision: r.fecha_emision ?? null,
      fecha_limite_de_entrega: r.fecha_limite_de_entrega ?? null,
      fecha_recepcion: r.fecha_recepcion ?? null,
      piezas_emitidas: Number(r.piezas_emitidas ?? 0),
      piezas_recibidas: Number(r.piezas_recibidas ?? 0),
      piezas_pendientes: Number(r.piezas_pendientes ?? 0),
      estado_radar: r.estado_radar
    }));
    return { cluesimb: clues, clave, window: { months }, total: data.length, data };
  }

  async listarGlobalV2Salidas(cluesInput: unknown, claveInput: unknown, monthsInput: unknown) {
    const clues = normUpper(cluesInput);
    const clave = normUpper(claveInput);
    const months = Math.min(12, Math.max(1, parseIntSafe(monthsInput, 3)));
    if (!clues || !clave) throw new Error('clues y clave son requeridos');

    const { rows } = await pool.query(`
      WITH ultima_solicitud AS (
        SELECT MAX(sb.created_day)::date AS fecha
        FROM public.solicitud_bitacora sb
        JOIN public.solicitud_bitacora_detalle d ON d.solicitud_id = sb.id
        WHERE UPPER(TRIM(sb.cluesimb)) = $1
          AND UPPER(TRIM(d.clave)) = $2
          AND sb.created_day BETWEEN CURRENT_DATE - make_interval(months => $3::int) AND CURRENT_DATE
      )
      SELECT s.id, s.fecha_entregado::text AS fecha_entregado, s.folio, s.folio_extra,
             COALESCE(s.cantidad, 0)::numeric AS cantidad, s.tipo, s.programa,
             COALESCE(um_origen.nombre, s.unidad_origen_texto) AS unidad_origen,
             COALESCE(um_destino.nombre, s.unidad_destino_texto) AS unidad_destino
      FROM public.salida s
      JOIN public.unidad_medica um_destino ON um_destino.id = s.unidad_destino_id
      LEFT JOIN public.unidad_medica um_origen ON um_origen.id = s.unidad_origen_id
      CROSS JOIN ultima_solicitud us
      WHERE UPPER(TRIM(um_destino.cluesimb)) = $1
        AND UPPER(TRIM(s.clave_cnis)) = $2
        AND us.fecha IS NOT NULL
        AND s.fecha_entregado::date BETWEEN us.fecha AND CURRENT_DATE
      ORDER BY s.fecha_entregado DESC, s.id DESC
      LIMIT 50`, [clues, clave, months]);

    const data: RadarGlobalV2SalidaRow[] = rows.map((r: any) => ({
      id: Number(r.id), fecha_entregado: String(r.fecha_entregado), folio: r.folio ?? null,
      folio_extra: r.folio_extra ?? null, cantidad: Number(r.cantidad ?? 0), tipo: r.tipo ?? null,
      programa: r.programa ?? null, unidad_origen: r.unidad_origen ?? null, unidad_destino: r.unidad_destino ?? null
    }));
    return { cluesimb: clues, clave, window: { months }, total: data.length, data };
  }

  async exportarGlobalV2Detalles(itemsInput: unknown, monthsInput: unknown) {
    const months = Math.min(12, Math.max(1, parseIntSafe(monthsInput, 3)));
    const items = Array.isArray(itemsInput) ? itemsInput.slice(0, 50000) : [];
    const paresUnicos = new Map<string, { cluesimb: string; clave: string }>();
    for (const item of items) {
      const cluesimb = normUpper(item?.cluesimb);
      const clave = normUpper(item?.clave);
      if (cluesimb && clave) paresUnicos.set(`${cluesimb}|${clave}`, { cluesimb, clave });
    }
    const pares = Array.from(paresUnicos.values());
    if (!pares.length) return { salidas: [], ordenes: [] };

    const params = [JSON.stringify(pares), months];
    const salidasSql = `
      WITH pares AS (SELECT UPPER(TRIM(cluesimb)) cluesimb, UPPER(TRIM(clave)) clave
        FROM jsonb_to_recordset($1::jsonb) AS x(cluesimb text, clave text)),
      ultimas AS (SELECT p.cluesimb, p.clave, MAX(sb.created_day)::date ultima_solicitud
        FROM pares p JOIN public.solicitud_bitacora sb ON UPPER(TRIM(sb.cluesimb))=p.cluesimb
        JOIN public.solicitud_bitacora_detalle d ON d.solicitud_id=sb.id AND UPPER(TRIM(d.clave))=p.clave
        WHERE sb.created_day BETWEEN CURRENT_DATE-make_interval(months=>$2::int) AND CURRENT_DATE GROUP BY p.cluesimb,p.clave)
      SELECT u.cluesimb,u.clave,u.ultima_solicitud::text,s.id,s.fecha_entregado::text,s.folio,s.folio_extra,
        COALESCE(s.cantidad,0)::numeric cantidad,s.tipo,s.programa,
        COALESCE(o.nombre,s.unidad_origen_texto) unidad_origen,COALESCE(d.nombre,s.unidad_destino_texto) unidad_destino
      FROM ultimas u JOIN public.unidad_medica d ON UPPER(TRIM(d.cluesimb))=u.cluesimb
      JOIN public.salida s ON s.unidad_destino_id=d.id AND UPPER(TRIM(s.clave_cnis))=u.clave
        AND s.fecha_entregado::date BETWEEN u.ultima_solicitud AND CURRENT_DATE
      LEFT JOIN public.unidad_medica o ON o.id=s.unidad_origen_id ORDER BY u.cluesimb,u.clave,s.fecha_entregado DESC`;
    const ordenesSql = `
      WITH pares AS (SELECT UPPER(TRIM(cluesimb)) cluesimb,UPPER(TRIM(clave)) clave
        FROM jsonb_to_recordset($1::jsonb) AS x(cluesimb text,clave text))
      SELECT p.cluesimb,p.clave,c.orden_de_suministro,c.proveedor,c.fecha_emision::text,
        c.fecha_limite_de_entrega::text,c.fecha_recepcion_max::text fecha_recepcion,
        COALESCE(c.no_de_piezas_emitidas,0)::numeric piezas_emitidas,
        COALESCE(c.pzas_recibidas_por_la_entidad,0)::numeric piezas_recibidas,
        GREATEST(COALESCE(c.no_de_piezas_emitidas,0)-COALESCE(c.pzas_recibidas_por_la_entidad,0),0)::numeric piezas_pendientes,
        CASE
          WHEN GREATEST(COALESCE(c.no_de_piezas_emitidas,0)-COALESCE(c.pzas_recibidas_por_la_entidad,0),0)<=0
            AND c.fecha_recepcion_max>=CURRENT_DATE-INTERVAL '30 days' THEN 'CUMPLIDA_RECIENTE'
          WHEN c.fecha_limite_de_entrega<CURRENT_DATE
            AND GREATEST(COALESCE(c.no_de_piezas_emitidas,0)-COALESCE(c.pzas_recibidas_por_la_entidad,0),0)>0 THEN 'VENCIDA'
          WHEN c.fecha_limite_de_entrega BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '30 days'
            AND GREATEST(COALESCE(c.no_de_piezas_emitidas,0)-COALESCE(c.pzas_recibidas_por_la_entidad,0),0)>0 THEN 'POR_VENCER'
          ELSE 'PENDIENTE'
        END estado_radar
      FROM pares p JOIN public.unidad_medica um ON UPPER(TRIM(um.cluesimb))=p.cluesimb
      JOIN public.citas c ON UPPER(TRIM(c.clues_destino)) IN (UPPER(TRIM(um.cluesimb)),UPPER(TRIM(um.cluessa)))
        AND UPPER(TRIM(c.clave_cnis))=p.clave
      WHERE c.fecha_emision>=CURRENT_DATE-make_interval(months=>$2::int)
        OR c.fecha_recepcion_max>=CURRENT_DATE-INTERVAL '30 days'
        OR (c.fecha_limite_de_entrega>=CURRENT_DATE-INTERVAL '30 days'
          AND GREATEST(COALESCE(c.no_de_piezas_emitidas,0)-COALESCE(c.pzas_recibidas_por_la_entidad,0),0)>0)
      ORDER BY p.cluesimb,p.clave,c.fecha_limite_de_entrega DESC NULLS LAST`;
    const [salidas, ordenes] = await Promise.all([pool.query(salidasSql, params), pool.query(ordenesSql, params)]);
    return {
      salidas: salidas.rows.map((r: any) => ({ ...r, id: Number(r.id), cantidad: Number(r.cantidad ?? 0) })),
      ordenes: ordenes.rows.map((r: any) => ({
        ...r, piezas_emitidas: Number(r.piezas_emitidas ?? 0), piezas_recibidas: Number(r.piezas_recibidas ?? 0),
        piezas_pendientes: Number(r.piezas_pendientes ?? 0)
      }))
    };
  }
}

