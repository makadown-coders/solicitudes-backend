import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { isISODateOnly, parseIntSafe } from '../helpers/helper';
import { RadarCrearEventoInput } from '../models/radar-abasto/RadarCrearEventoInput';
import { RadarEventoClaveRow } from '../models/radar-abasto/RadarEventoClaveRow';
import { RadarEventoHeaderRow } from '../models/radar-abasto/RadarEventoHeaderRow';
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
        SELECT COALESCE(SUM(c.no_de_piezas_emitidas), 0)::numeric AS citas_pendientes
        FROM public.citas c
        WHERE UPPER(TRIM(c.clues_destino)) = $1
          AND UPPER(TRIM(c.clave_cnis)) = $2
          AND c.fecha_limite_de_entrega >= (CURRENT_DATE - INTERVAL '15 days')
          AND c.fecha_recepcion_max IS NULL
      ),
      mov AS (
        SELECT
          COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'ENTRADA' THEN m.cantidad ELSE 0 END), 0)::numeric AS entradas_30d,
          COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'SALIDA' THEN m.cantidad ELSE 0 END), 0)::numeric AS salidas_30d,
          COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'TRASPASO' THEN m.cantidad ELSE 0 END), 0)::numeric AS traspasos_30d,
          COUNT(*)::int AS movimientos_recientes
        FROM public.v_movimientos_a_unidades_desde_abasto m
        WHERE UPPER(TRIM(m.clues_destino)) = $1
          AND UPPER(TRIM(m.clave_cnis)) = $2
          AND m.fecha_movimiento >= (CURRENT_DATE - INTERVAL '30 days')
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
}

