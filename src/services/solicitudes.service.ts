import crypto from 'crypto';
import { pool } from '../db/pool';
import { BitacoraDetalleRow } from '../models/solicitudes/BitacoraDetalleRow';
import { ListarBitacoraInput } from '../models/solicitudes/ListarBitacora';
import { BitacoraHeaderRow } from '../models/solicitudes/BitacoraHeaderRow';
import { daysAgoISO, isISODateOnly, normalizeText, normalizeUpper, todayISO } from '../helpers/helper';
import { CrearBitacoraInput } from '../models/solicitudes/CrearBitacoraInput';
import { CrearBitacoraResult } from '../models/solicitudes/CrearBitacoraResult';
import { MovimientoResumenRow } from '../models/solicitudes/MovimientoResumenRow';
import { MovimientoRow } from '../models/solicitudes/MovimientoRow';
import { MovimientosQuery } from '../models/solicitudes/MovimientosQuery';

function splitTiposInsumo(tipoInsumoRaw: string): string[] {
  const parts = (tipoInsumoRaw ?? '')
    .split('-')
    .map(s => s.trim())
    .filter(Boolean);

  // normaliza “bonito” (puedes dejarlo en mayúsculas si prefieres)
  // aquí lo dejo tal cual pero colapsando espacios
  return Array.from(new Set(parts));
}

/**
 * Canoniza SOLO con datos no sensibles y estables.
 * OJO: No usa descripcion.
 */
function buildCanonicalPayload(input: CrearBitacoraInput) {
  const cluesimb = normalizeUpper(input.cluesimb);
  const tipoPedido = normalizeText(input.tipoPedido);
  const tiposInsumo = splitTiposInsumo(input.tipoInsumo)
    .map(normalizeText)
    .sort((a, b) => a.localeCompare(b));

  const periodo = normalizeText(input.periodo ?? '');

  const articulosCanon = (input.articulos ?? [])
    .map(a => ({
      clave: normalizeUpper(a.clave),
      // unidadMedida: normalizeText(a.unidadMedida ?? ''),
      // cantidad: la hacemos número “estable”
      cantidad: Number.isFinite(a.cantidad) ? Number(a.cantidad) : 0,
    }))
    .sort((a, b) => a.clave.localeCompare(b.clave));

  return {
    cluesimb,
    tipoPedido,
    tiposInsumo,
    periodo,
    articulos: articulosCanon,
  };
}

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function computePayloadHash(canonical: any): string {
  const salt = process.env.SOLICITUDES_HASH_SALT;
  if (!salt) throw new Error('Missing env SOLICITUDES_HASH_SALT');

  // stringify determinista (JSON normal ya es determinista con nuestro objeto construido)
  const json = JSON.stringify(canonical);
  return sha256Hex(json + '|' + salt);
}

class SolicitudesService {

  async crearBitacora(input: CrearBitacoraInput): Promise<CrearBitacoraResult> {
    const canonical = buildCanonicalPayload(input);
    const payloadHash = computePayloadHash(canonical);

    const totalRenglones = canonical.articulos.length;
    const totalPiezas = canonical.articulos.reduce((acc: number, a: any) => acc + (a.cantidad || 0), 0);

    // Guardrails ligeros (evita basura)
    if (!canonical.cluesimb) throw new Error('cluesimb requerido');
    if (!['Ordinario', 'Extraordinario'].includes(canonical.tipoPedido)) {
      throw new Error('tipoPedido inválido');
    }
    if (totalRenglones === 0) throw new Error('articulos vacío');
    if (totalPiezas < 0) throw new Error('totalPiezas inválido');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert header con dedupe por (cluesimb, created_day, payload_hash)
      // Truco: RETURNING (xmax = 0) indica insert real en Postgres
      const headerSql = `
        insert into public.solicitud_bitacora (
          cluesimb, tipo_pedido, tipos_insumo, periodo_texto,
          total_renglones, total_piezas, payload_hash
        )
        values ($1, $2, $3::text[], $4, $5, $6, $7)
        on conflict (cluesimb, created_day, payload_hash)
        do update set        
          total_renglones = excluded.total_renglones
        returning id::text as id, (xmax = 0) as inserted;
      `;

      const headerParams = [
        canonical.cluesimb,
        canonical.tipoPedido,
        canonical.tiposInsumo,
        canonical.periodo || null,
        totalRenglones,
        totalPiezas,
        payloadHash,
      ];

      const headerRes = await client.query(headerSql, headerParams);
      const solicitudId: string = headerRes.rows[0].id;
      const wasInserted: boolean = headerRes.rows[0].inserted;

      console.log('[BITACORA SNAPSHOT]', {
        cluesimb: canonical.cluesimb,
        tipoPedido: canonical.tipoPedido,
        tiposInsumo: canonical.tiposInsumo,
        periodo: canonical.periodo,
        renglones: canonical.articulos.length,
        hash: payloadHash,
      });

      // Si fue dedupe, no insertamos detalle otra vez.
      if (wasInserted) {
        // Insert detalle en batch
        const values: any[] = [];
        const chunks: string[] = [];

        canonical.articulos.forEach((a: any, idx: number) => {
          const base = idx * 4;
          chunks.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
          values.push(
            solicitudId,
            a.clave,
            a.unidadMedida || null,
            a.cantidad
          );
        });

        const detailSql = `
          insert into public.solicitud_bitacora_detalle
            (solicitud_id, clave, unidad_medida, cantidad)
          values ${chunks.join(',')};
        `;

        await client.query(detailSql, values);
      }

      await client.query('COMMIT');

      return { solicitudId, wasInserted, payloadHash };
    } catch (e) {
      console.error('Error en crearBitacora:', e);
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async listarBitacora(input: ListarBitacoraInput): Promise<BitacoraHeaderRow[]> {
    const desde = (input.desde && isISODateOnly(input.desde)) ? input.desde : daysAgoISO(30);
    const hasta = (input.hasta && isISODateOnly(input.hasta)) ? input.hasta : todayISO();

    const cluesimb = (input.cluesimb ?? '').trim().toUpperCase();

    // created_day es DATE. Usamos rango inclusivo:
    // created_day BETWEEN desde AND hasta
    // (si prefieres "hasta exclusivo", ajustamos)
    const sql = `
      select DISTINCT ON (cluesimb, tipo_pedido, tipos_insumo)
        id::text as id,
        created_day::text as created_day,
        created_at::text as created_at,
        cluesimb,
        tipo_pedido,
        tipos_insumo,
        periodo_texto,
        total_renglones,
        total_piezas
      from public.solicitud_bitacora
      where created_day between $1::date and $2::date
        and ($3 = '' or cluesimb = $3)
      ORDER BY
            cluesimb,                  
            tipo_pedido,
            tipos_insumo,
            created_at DESC
      limit 9000;
    `;

    const { rows } = await pool.query(sql, [desde, hasta, cluesimb]);
    return rows;
  }

  async getDetalleBitacora(solicitudId: string): Promise<BitacoraDetalleRow[]> {
    const id = (solicitudId ?? '').trim();
    if (!id) throw new Error('id requerido');

    const sql = `
       select
        sbd.solicitud_id::text as solicitud_id,
        sbd.clave,
        sbd.cantidad,
        coalesce(c.cpm, 0) as cpm
from public.solicitud_bitacora_detalle sbd 
	 inner join public.solicitud_bitacora sb on sb.id = sbd.solicitud_id 
	 inner join public.unidad_medica um on um.cluesimb = sb.cluesimb 
	 left join public.cpm c on c.unidad_medica_id = um.id and c.clave_cnis = sbd.clave 
where sb.id = $1::uuid
      order by clave;
    `;

    const { rows } = await pool.query(sql, [id]);
    return rows;
  }

  async listarMovimientos(q: MovimientosQuery): Promise<MovimientoRow[]> {
    const cluesimb = (q.cluesimb ?? '').trim().toUpperCase();
    if (!cluesimb) throw new Error('cluesimb requerido');

    const desde = (q.desde ?? '').trim();
    const hasta = (q.hasta ?? '').trim();
    if (!isISODateOnly(desde) || !isISODateOnly(hasta)) {
      throw new Error('desde/hasta deben venir como YYYY-MM-DD');
    }

    const clave = (q.clave ?? '').trim().toUpperCase();
    const tipo = (q.tipo ?? '').trim().toUpperCase(); // SALIDA/TRASPASO o ''

    const sql = `
    select
      tipo_movimiento,
      clues_destino,
      unidad_destino_texto,
      unidad_origen_texto,
      clave_cnis,
      cantidad,
      lote,
      total,
      programa,
      fecha_movimiento::text as fecha_movimiento,
      fecha_caducidad::text as fecha_caducidad
    from public.v_movimientos_a_unidades_desde_abasto
    where clues_destino = $1
      and fecha_movimiento between $2::date and $3::date
      and ($4 = '' or clave_cnis = $4)
      and ($5 = '' or tipo_movimiento = $5)
    order by fecha_movimiento desc, clave_cnis asc
    limit 20000;
  `;

    const { rows } = await pool.query(sql, [cluesimb, desde, hasta, clave, tipo]);
    return rows;
  }

  async resumenMovimientos(q: MovimientosQuery): Promise<MovimientoResumenRow[]> {
    const cluesimb = (q.cluesimb ?? '').trim().toUpperCase();
    if (!cluesimb) throw new Error('cluesimb requerido');

    const desde = (q.desde ?? '').trim();
    const hasta = (q.hasta ?? '').trim();
    if (!isISODateOnly(desde) || !isISODateOnly(hasta)) {
      throw new Error('desde/hasta deben venir como YYYY-MM-DD');
    }

    const clave = (q.clave ?? '').trim().toUpperCase();
    const tipo = (q.tipo ?? '').trim().toUpperCase();

    const sql = `
    select
      clues_destino as cluesimb,
      clave_cnis as clave,
      sum(cantidad)::int as entregado_piezas,
      min(fecha_movimiento)::text as primer_mov,
      max(fecha_movimiento)::text as ultimo_mov
    from public.v_movimientos_a_unidades_desde_abasto
    where clues_destino = $1
      and fecha_movimiento between $2::date and $3::date
      and ($4 = '' or clave_cnis = $4)
      and ($5 = '' or tipo_movimiento = $5)
    group by clues_destino, clave_cnis
    order by clave_cnis;
  `;

    const { rows } = await pool.query(sql, [cluesimb, desde, hasta, clave, tipo]);
    return rows;
  }
}

export default SolicitudesService;