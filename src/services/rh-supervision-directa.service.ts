import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { RhHttpError, type RhAuditMeta } from './rh.service';

const unidadPiloto = 177;
type Consulta = Pick<PoolClient, 'query'>;

export class RhSupervisionError extends RhHttpError {
  constructor(status: RhHttpError['status'], readonly codigo: string, message: string) {
    super(status, message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface Persona {
  nombre_completo: string;
  activo: boolean;
  adscripciones: number;
}

interface Relacion {
  persona_supervisora_id: number | null;
  nombre_supervisor: string | null;
  motivo: string;
  actualizado_en: string;
}

interface Puesto {
  puesto_id: number;
  denominacion: string;
  puesto_padre_id: number | null;
}

interface Sugerencia {
  persona_id: number;
  nombre_completo: string;
  puesto_id: number;
  denominacion: string;
}

const contarAdscripciones = `(SELECT COUNT(*)::integer FROM public.rh_adscripcion_laboral al
  WHERE al.persona_id = p.id AND al.unidad_medica_id = $1
    AND al.activo IS TRUE AND al.vigente_desde <= CURRENT_DATE
    AND (al.vigente_hasta IS NULL OR al.vigente_hasta >= CURRENT_DATE))`;

const fechaRevision = `to_char(s.actualizado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

function esId(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0 && valor <= 2147483647;
}

function validarRuta(unidadId: number, personaId: number): void {
  if (!esId(unidadId) || !esId(personaId)) {
    throw new RhSupervisionError(400, 'IDENTIFICADOR_INVALIDO', 'Unidad o persona inválida');
  }
  if (unidadId !== unidadPiloto) {
    throw new RhSupervisionError(404, 'UNIDAD_FUERA_DE_PILOTO', 'La supervisión directa está limitada a Coordinación Estatal');
  }
}

function esRevision(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(valor)) return false;
  const milisegundos = valor.slice(0, 23) + 'Z';
  const fecha = new Date(milisegundos);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString() === milisegundos;
}

function validarCambio(body: unknown, personaId: number) {
  const campos = ['persona_supervisora_id', 'motivo', 'revision_esperada'];
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== campos.length ||
      !campos.every((campo) => Object.prototype.hasOwnProperty.call(body, campo))) {
    throw new RhSupervisionError(400, 'CUERPO_INVALIDO', 'Se requieren exclusivamente persona_supervisora_id, motivo y revision_esperada');
  }
  const { persona_supervisora_id: supervisorId, motivo, revision_esperada: revision } = body as Record<string, unknown>;
  if (supervisorId !== null && !esId(supervisorId)) {
    throw new RhSupervisionError(400, 'SUPERVISOR_INVALIDO', 'persona_supervisora_id debe ser un entero positivo o null');
  }
  if (supervisorId === personaId) {
    throw new RhSupervisionError(409, 'AUTORREFERENCIA', 'Una persona no puede supervisarse a sí misma');
  }
  if (revision !== null && !esRevision(revision)) {
    throw new RhSupervisionError(400, 'REVISION_INVALIDA', 'revision_esperada debe ser null o una revisión devuelta por la API');
  }
  if (typeof motivo !== 'string' || !motivo.trim() || Array.from(motivo.trim()).length > 500 || motivo.includes('\0')) {
    throw new RhSupervisionError(400, 'MOTIVO_INVALIDO', 'El motivo debe contener entre 1 y 500 caracteres');
  }
  return { supervisorId: esId(supervisorId) ? supervisorId : null, motivo: motivo.trim(), revision };
}

async function validarUnidad(db: Consulta, unidadId: number, bloquear: boolean): Promise<void> {
  const { rows } = await db.query(
    `SELECT id FROM public.unidad_medica WHERE id = $1 AND activo IS TRUE
       ${bloquear ? 'FOR NO KEY UPDATE' : ''}`, [unidadId]
  );
  if (!rows.length) throw new RhSupervisionError(404, 'UNIDAD_NO_DISPONIBLE', 'Coordinación Estatal no está disponible');
}

async function validarPersona(db: Consulta, unidadId: number, personaId: number, supervisor = false): Promise<Persona> {
  const { rows: [persona] } = await db.query<Persona>(
    `SELECT p.nombre_completo, p.activo, ${contarAdscripciones} AS adscripciones
       FROM public.persona p WHERE p.id = $2`, [unidadId, personaId]
  );
  const prefijo = supervisor ? 'SUPERVISOR' : 'TRABAJADOR';
  const sujeto = supervisor ? 'La persona supervisora' : 'La persona trabajadora';
  if (!persona) throw new RhSupervisionError(404, `${prefijo}_NO_EXISTE`, `${sujeto} no existe`);
  if (!persona.activo) throw new RhSupervisionError(409, `${prefijo}_INACTIVO`, `${sujeto} está inactiva`);
  if (persona.adscripciones === 0) {
    throw new RhSupervisionError(409, `${prefijo}_SIN_ADSCRIPCION_VIGENTE`, `${sujeto} no tiene adscripción vigente en Coordinación Estatal`);
  }
  if (persona.adscripciones > 1) {
    throw new RhSupervisionError(409, `${prefijo}_ADSCRIPCION_AMBIGUA`, `${sujeto} tiene varias adscripciones vigentes en Coordinación Estatal`);
  }
  return persona;
}

async function leerRelacion(db: Consulta, unidadId: number, personaId: number): Promise<Relacion | null> {
  const { rows: [relacion] } = await db.query<Relacion>(
    `SELECT s.persona_supervisora_id, p.nombre_completo AS nombre_supervisor, s.motivo,
            ${fechaRevision} AS actualizado_en
       FROM public.rh_supervision_directa s
       LEFT JOIN public.persona p ON p.id = s.persona_supervisora_id
      WHERE s.unidad_medica_id = $1 AND s.persona_supervisada_id = $2`, [unidadId, personaId]
  );
  return relacion ?? null;
}

async function generaCiclo(db: Consulta, unidadId: number, personaId: number, supervisorId: number): Promise<boolean> {
  const { rows: [result] } = await db.query<{ ciclo: boolean }>(
    `WITH RECURSIVE cadena (persona_id, ruta, repetida) AS (
       SELECT $3::integer, ARRAY[$3::integer], FALSE
       UNION ALL
       SELECT s.persona_supervisora_id, c.ruta || s.persona_supervisora_id,
              s.persona_supervisora_id = ANY(c.ruta)
         FROM cadena c
         JOIN public.rh_supervision_directa s
           ON s.unidad_medica_id = $1 AND s.persona_supervisada_id = c.persona_id
        WHERE NOT c.repetida AND c.persona_id <> $2 AND s.persona_supervisora_id IS NOT NULL
     )
     SELECT bool_or(repetida OR persona_id = $2) AS ciclo FROM cadena`,
    [unidadId, personaId, supervisorId]
  );
  return result.ciclo;
}

async function leerEstructura(db: Consulta, unidadId: number, personaId: number) {
  const { rows: [fila] } = await db.query<Puesto & { sugerencia: Sugerencia | null }>(
    `WITH puestos AS (
       SELECT hijo.id, hijo.denominacion, hijo.puesto_padre_id, hijo.version_id
         FROM public.rh_org_ocupacion o
         JOIN public.rh_org_puesto hijo ON hijo.id = o.puesto_id AND hijo.activo IS TRUE
         JOIN public.rh_org_version v ON v.id = hijo.version_id
        WHERE o.persona_id = $2 AND o.estado = 'OCUPADO'
          AND v.unidad_medica_id = $1 AND v.activo IS TRUE AND v.estado = 'VIGENTE'
        LIMIT 2
     )
     SELECT hijo.id AS puesto_id, hijo.denominacion, hijo.puesto_padre_id,
            CASE WHEN p.id IS NOT NULL AND ${contarAdscripciones} = 1
                 THEN jsonb_build_object('persona_id', p.id, 'nombre_completo', p.nombre_completo,
                                         'puesto_id', padre.id, 'denominacion', padre.denominacion)
            END AS sugerencia
       FROM puestos hijo
       LEFT JOIN public.rh_org_puesto padre ON padre.id = hijo.puesto_padre_id
             AND padre.version_id = hijo.version_id AND padre.activo IS TRUE
       LEFT JOIN public.rh_org_ocupacion o ON o.puesto_id = padre.id AND o.estado = 'OCUPADO'
       LEFT JOIN public.persona p ON p.id = o.persona_id AND p.activo IS TRUE AND p.id <> $2
      WHERE (SELECT COUNT(*) FROM puestos) = 1`, [unidadId, personaId]
  );
  if (!fila) return { puesto_estructural: null, sugerencia: null };
  const { sugerencia, ...puesto_estructural } = fila;
  return {
    puesto_estructural,
    sugerencia: sugerencia && !(await generaCiclo(db, unidadId, personaId, sugerencia.persona_id))
      ? sugerencia : null,
  };
}

async function respuesta(db: Consulta, unidadId: number, personaId: number, persona: Persona, relacion: Relacion | null) {
  return {
    unidad_medica_id: unidadId,
    persona_supervisada_id: personaId,
    nombre_trabajador: persona.nombre_completo,
    estado: !relacion ? 'PENDIENTE' : relacion.persona_supervisora_id === null ? 'SIN_JEFE_ASIGNADO' : 'ASIGNADO',
    persona_supervisora_id: relacion?.persona_supervisora_id ?? null,
    nombre_supervisor: relacion?.nombre_supervisor ?? null,
    actualizado_en: relacion?.actualizado_en ?? null,
    revision: relacion?.actualizado_en ?? null,
    ...await leerEstructura(db, unidadId, personaId),
  };
}

export class RhSupervisionDirectaService {
  async consultar(unidadId: number, personaId: number) {
    validarRuta(unidadId, personaId);
    await validarUnidad(pool, unidadId, false);
    const persona = await validarPersona(pool, unidadId, personaId);
    return respuesta(pool, unidadId, personaId, persona, await leerRelacion(pool, unidadId, personaId));
  }

  async actualizar(unidadId: number, personaId: number, body: unknown, audit: RhAuditMeta) {
    validarRuta(unidadId, personaId);
    const { supervisorId, motivo, revision } = validarCambio(body, personaId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      // Sentencia separada para que la lectura posterior vea el último commit de la unidad.
      await validarUnidad(client, unidadId, true);
      const anterior = await leerRelacion(client, unidadId, personaId);
      if ((anterior?.actualizado_en ?? null) !== revision) {
        throw new RhSupervisionError(409, 'REVISION_OBSOLETA', 'La supervisión cambió. Actualiza los datos antes de guardar');
      }
      const persona = await validarPersona(client, unidadId, personaId);
      if (supervisorId !== null) {
        await validarPersona(client, unidadId, supervisorId, true);
        if (await generaCiclo(client, unidadId, personaId, supervisorId)) {
          throw new RhSupervisionError(409, 'CICLO_SUPERVISION', 'La cadena de supervisión contiene o formaría un ciclo');
        }
      }
      if (anterior?.persona_supervisora_id === supervisorId && anterior.motivo === motivo) {
        const actual = await respuesta(client, unidadId, personaId, persona, anterior);
        await client.query('COMMIT');
        return actual;
      }

      await client.query(
        `INSERT INTO public.rh_supervision_directa AS s
           (unidad_medica_id, persona_supervisada_id, persona_supervisora_id, motivo, actualizado_por, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, clock_timestamp())
         ON CONFLICT (unidad_medica_id, persona_supervisada_id) DO UPDATE
         SET persona_supervisora_id = EXCLUDED.persona_supervisora_id, motivo = EXCLUDED.motivo,
             actualizado_por = EXCLUDED.actualizado_por,
             actualizado_en = GREATEST(clock_timestamp(), s.actualizado_en + INTERVAL '1 microsecond')`,
        [unidadId, personaId, supervisorId, motivo, audit.userId]
      );
      const nueva = await leerRelacion(client, unidadId, personaId);
      if (!nueva) throw new Error('No se pudo leer la supervisión guardada');
      await client.query(
        `INSERT INTO public.app_audit_logs (user_id, action, resource, ip, user_agent, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [audit.userId, 'RH_ORG_UPDATE_SUPERVISION_DIRECTA', 'rh_supervision_directa', audit.ip, audit.userAgent,
          JSON.stringify({
            unidad_medica_id: unidadId,
            persona_supervisada_id: personaId,
            relacion_anterior_existia: anterior !== null,
            supervisor_anterior_id: anterior?.persona_supervisora_id ?? null,
            supervisor_nuevo_id: supervisorId,
            motivo,
            actualizado_en: nueva.actualizado_en,
          })]
      );
      const actual = await respuesta(client, unidadId, personaId, persona, nueva);
      await client.query('COMMIT');
      return actual;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
