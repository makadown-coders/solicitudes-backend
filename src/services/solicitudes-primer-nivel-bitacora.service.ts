import crypto from 'crypto';
import { pool } from '../db/pool';
import { normalizeText, normalizeUpper } from '../helpers/helper';
import { CrearBitacoraResult } from '../models/solicitudes/CrearBitacoraResult';
import { CrearBitacoraPrimerNivelInput } from '../models/solicitudes/primer-nivel/CrearBitacoraPrimerNivelInput';

function crearPayloadCanonico(input: CrearBitacoraPrimerNivelInput) {
  return {
    cluesimb: normalizeUpper(input.cluesimb),
    tipoPedido: 'Ordinario',
    tiposInsumo: ['Material de Curación', 'Medicamento'].sort((a, b) => a.localeCompare(b)),
    periodo: normalizeText(input.periodo ?? ''),
    articulos: input.articulos
      .map(item => ({ clave: normalizeUpper(item.clave), cantidad: Number(item.cantidad) }))
      .sort((a, b) => a.clave.localeCompare(b.clave)),
  };
}

function calcularHash(payload: ReturnType<typeof crearPayloadCanonico>): string {
  const salt = process.env.SOLICITUDES_HASH_SALT;
  if (!salt) throw new Error('Missing env SOLICITUDES_HASH_SALT');
  return crypto.createHash('sha256').update(`${JSON.stringify(payload)}|${salt}`, 'utf8').digest('hex');
}

export default class SolicitudesPrimerNivelBitacoraService {
  async crear(input: CrearBitacoraPrimerNivelInput): Promise<CrearBitacoraResult> {
    const canonical = crearPayloadCanonico(input);
    const payloadHash = calcularHash(canonical);
    const totalRenglones = canonical.articulos.length;
    const totalPiezas = canonical.articulos.reduce((total, item) => total + item.cantidad, 0);

    if (!canonical.cluesimb) throw new Error('cluesimb requerido');
    if (!totalRenglones) throw new Error('articulos vacío');
    if (totalPiezas < 1) throw new Error('totalPiezas inválido');
    if (!input.contextosCaptura.length) throw new Error('contextosCaptura vacío');

    const cantidadesPorClave = new Map<string, number>();
    for (const contexto of input.contextosCaptura) {
      const clave = normalizeUpper(contexto.clave);
      if (!clave || !Number.isInteger(contexto.cantidad) || contexto.cantidad < 1) {
        throw new Error('Contexto de captura inválido');
      }
      cantidadesPorClave.set(clave, (cantidadesPorClave.get(clave) ?? 0) + contexto.cantidad);
    }
    const contextoNoCoincide = canonical.articulos.some(
      item => cantidadesPorClave.get(item.clave) !== item.cantidad
    ) || cantidadesPorClave.size !== canonical.articulos.length;
    if (contextoNoCoincide) {
      throw new Error('El contexto de captura no coincide con los artículos de la solicitud');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const header = await client.query<{ id: string; inserted: boolean }>(`
        INSERT INTO public.solicitud_bitacora (
          cluesimb, tipo_pedido, tipos_insumo, periodo_texto,
          total_renglones, total_piezas, payload_hash
        )
        VALUES ($1, 'Ordinario', $2::text[], $3, $4, $5, $6)
        ON CONFLICT (cluesimb, created_day, payload_hash)
        DO UPDATE SET total_renglones = EXCLUDED.total_renglones
        RETURNING id::text AS id, (xmax = 0) AS inserted
      `, [
        canonical.cluesimb,
        canonical.tiposInsumo,
        canonical.periodo || null,
        totalRenglones,
        totalPiezas,
        payloadHash,
      ]);

      const solicitudId = header.rows[0].id;
      const wasInserted = header.rows[0].inserted;

      if (wasInserted) {
        const detalleValores: unknown[] = [];
        const detalleFilas = canonical.articulos.map((item, index) => {
          const base = index * 4;
          detalleValores.push(solicitudId, item.clave, null, item.cantidad);
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
        });
        await client.query(`
          INSERT INTO public.solicitud_bitacora_detalle
            (solicitud_id, clave, unidad_medida, cantidad)
          VALUES ${detalleFilas.join(', ')}
        `, detalleValores);
      }

      // Una solicitud deduplicada conserva un solo contexto, actualizado por el flujo de Primer Nivel.
      await client.query(
        'DELETE FROM public.solicitud_primer_nivel_contexto WHERE solicitud_id = $1::uuid',
        [solicitudId]
      );
      const contextoValores: unknown[] = [];
      const contextoFilas = input.contextosCaptura.map((item, index) => {
        const base = index * 5;
        contextoValores.push(
          solicitudId,
          normalizeUpper(item.clave),
          item.cantidad,
          item.origenCaptura,
          item.referenciaCaptura ? normalizeUpper(item.referenciaCaptura) : null
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      });
      await client.query(`
        INSERT INTO public.solicitud_primer_nivel_contexto
          (solicitud_id, clave, cantidad_capturada, origen_captura, referencia_captura)
        VALUES ${contextoFilas.join(', ')}
      `, contextoValores);

      await client.query('COMMIT');
      return { solicitudId, wasInserted, payloadHash };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al crear bitácora de Primer Nivel:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
