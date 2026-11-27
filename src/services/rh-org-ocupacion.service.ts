import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { RhHttpError, type RhAuditMeta } from './rh.service';

const unidadPiloto = 177;
type Estado = 'OCUPADO' | 'VACANTE' | 'SIN_VINCULAR';

interface Ocupacion {
  puesto_id: number;
  denominacion: string;
  puesto_padre_id: number | null;
  estado: Estado;
  persona_id: number | null;
  nombre_ocupante: string | null;
  puesto_laboral_referencia: string | null;
  unidad_medica_id: number;
  actualizado_en: string | null;
}

const alcance = `p.id = $1 AND v.unidad_medica_id = $2
  AND v.activo IS TRUE AND v.estado = 'VIGENTE'`;
const adscripcionVigente = `al.activo IS TRUE AND al.vigente_desde <= CURRENT_DATE
  AND (al.vigente_hasta IS NULL OR al.vigente_hasta >= CURRENT_DATE)`;

function esId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
}

function validarCambio(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RhHttpError(400, 'Payload inválido');
  }
  const campos = ['estado', 'persona_id', 'revision_esperada', 'motivo'];
  if (Object.keys(body).length !== campos.length ||
    !campos.every((campo) => Object.prototype.hasOwnProperty.call(body, campo))) {
    throw new RhHttpError(400, 'Se requieren exclusivamente estado, persona_id, revision_esperada y motivo');
  }
  const { estado, persona_id, revision_esperada, motivo } = body as Record<string, unknown>;
  if (estado !== 'OCUPADO' && estado !== 'VACANTE' && estado !== 'SIN_VINCULAR') {
    throw new RhHttpError(400, 'Estado de ocupación inválido');
  }
  if (estado === 'OCUPADO' ? !esId(persona_id) : persona_id !== null) {
    throw new RhHttpError(400, 'OCUPADO requiere persona_id válido. VACANTE y SIN_VINCULAR requieren null');
  }
  if (revision_esperada !== null && (typeof revision_esperada !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(revision_esperada))) {
    throw new RhHttpError(400, 'revision_esperada debe ser null o el valor de actualizado_en devuelto por la API');
  }
  if (typeof motivo !== 'string' || !motivo.trim() || motivo.trim().length > 500) {
    throw new RhHttpError(400, 'El motivo administrativo debe contener entre 1 y 500 caracteres');
  }
  return { estado, persona_id, revision_esperada, motivo: motivo.trim() };
}

export class RhOrgOcupacionService {
  async consultar(puestoId: number, db: Pick<PoolClient, 'query'> = pool): Promise<Ocupacion> {
    if (!esId(puestoId)) throw new RhHttpError(400, 'puestoId inválido');
    const { rows } = await db.query<Ocupacion>(
      `SELECT p.id AS puesto_id, p.denominacion, p.puesto_padre_id, v.unidad_medica_id,
              COALESCE(o.estado, 'SIN_VINCULAR') AS estado, o.persona_id,
              persona.nombre_completo AS nombre_ocupante, laboral.puesto AS puesto_laboral_referencia,
              to_char(o.actualizado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS actualizado_en
         FROM public.rh_org_puesto p
         JOIN public.rh_org_version v ON v.id = p.version_id
         LEFT JOIN public.rh_org_ocupacion o ON o.puesto_id = p.id
         LEFT JOIN public.persona persona ON persona.id = o.persona_id
         LEFT JOIN LATERAL (
           SELECT CASE WHEN COUNT(*) = 1 THEN MIN(NULLIF(BTRIM(al.puesto), '')) END AS puesto
             FROM public.rh_adscripcion_laboral al
            WHERE al.persona_id = o.persona_id AND al.unidad_medica_id = v.unidad_medica_id
              AND ${adscripcionVigente}
         ) laboral ON TRUE
        WHERE ${alcance}`,
      [puestoId, unidadPiloto]
    );
    if (!rows[0]) throw new RhHttpError(404, 'Puesto fuera del organigrama vigente de Coordinación Estatal o inexistente');
    return rows[0];
  }

  async actualizar(puestoId: number, body: unknown, audit: RhAuditMeta): Promise<Ocupacion> {
    if (!esId(puestoId)) throw new RhHttpError(400, 'puestoId inválido');
    const cambio = validarCambio(body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      // El puesto existe incluso si todavía no hay una fila de ocupación.
      const { rows: [puesto] } = await client.query<{ activo: boolean }>(
        `SELECT p.activo FROM public.rh_org_puesto p
          JOIN public.rh_org_version v ON v.id = p.version_id
         WHERE ${alcance} FOR UPDATE OF p FOR SHARE OF v`,
        [puestoId, unidadPiloto]
      );
      if (!puesto) throw new RhHttpError(404, 'Puesto fuera del organigrama vigente de Coordinación Estatal o inexistente');
      if (!puesto.activo) throw new RhHttpError(409, 'El puesto estructural está inactivo');

      const anterior = await this.consultar(puestoId, client);
      if (anterior.actualizado_en !== cambio.revision_esperada) {
        throw new RhHttpError(409, 'La ocupación cambió. Consulta el puesto antes de volver a guardar');
      }
      if (anterior.estado === cambio.estado && anterior.persona_id === cambio.persona_id) {
        await client.query('COMMIT');
        return anterior;
      }
      if (cambio.estado === 'OCUPADO') {
        await this.validarOcupante(client, cambio.persona_id, puestoId);
      }
      await client.query(
        `INSERT INTO public.rh_org_ocupacion AS actual (puesto_id, persona_id, estado, actualizado_en)
         VALUES ($1, $2, $3, clock_timestamp())
         ON CONFLICT (puesto_id) DO UPDATE SET persona_id = EXCLUDED.persona_id,
           estado = EXCLUDED.estado,
           actualizado_en = GREATEST(clock_timestamp(), actual.actualizado_en + INTERVAL '1 microsecond')`,
        [puestoId, cambio.persona_id, cambio.estado]
      );
      const nueva = await this.consultar(puestoId, client);
      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [audit.userId, 'RH_ORG_UPDATE_OCUPACION', 'rh_org_ocupacion', audit.ip, audit.userAgent,
          JSON.stringify({
            puesto_id: puestoId,
            anterior: { estado: anterior.estado, persona_id: anterior.persona_id },
            nuevo: { estado: nueva.estado, persona_id: nueva.persona_id },
            motivo: cambio.motivo,
            actualizado_en: nueva.actualizado_en,
          })]
      );
      await client.query('COMMIT');
      return nueva;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  private async validarOcupante(client: PoolClient, personaId: unknown, puestoId: number): Promise<void> {
    // Serializa asignaciones de la misma persona a puestos diferentes.
    const { rows: [persona] } = await client.query<{ activo: boolean }>(
      'SELECT activo FROM public.persona WHERE id = $1 FOR NO KEY UPDATE', [personaId]
    );
    if (!persona) throw new RhHttpError(404, 'La persona no existe');
    if (!persona.activo) throw new RhHttpError(409, 'La persona está inactiva');

    const { rows: adscripciones } = await client.query(
      `SELECT al.id FROM public.rh_adscripcion_laboral al
        WHERE al.persona_id = $1 AND al.unidad_medica_id = $2 AND ${adscripcionVigente}
        LIMIT 2`,
      [personaId, unidadPiloto]
    );
    if (!adscripciones.length) throw new RhHttpError(409, 'La persona no tiene adscripción vigente en Coordinación Estatal');
    if (adscripciones.length > 1) throw new RhHttpError(409, 'La persona tiene varias adscripciones vigentes en Coordinación Estatal');

    const { rows: [otra] } = await client.query<{ puesto_id: number }>(
      `SELECT o.puesto_id FROM public.rh_org_ocupacion o
         JOIN public.rh_org_puesto p ON p.id = o.puesto_id
         JOIN public.rh_org_version v ON v.id = p.version_id
        WHERE o.persona_id = $1 AND o.puesto_id <> $2 AND o.estado = 'OCUPADO'
          AND v.unidad_medica_id = $3 AND v.activo IS TRUE AND v.estado = 'VIGENTE'
        ORDER BY o.puesto_id LIMIT 1`,
      [personaId, puestoId, unidadPiloto]
    );
    if (otra) throw new RhHttpError(409, `La persona ya ocupa el puesto estructural ${otra.puesto_id}`);
  }
}
