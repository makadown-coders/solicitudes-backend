import type { Response } from 'express';
import type { RhAuthenticatedRequest } from '../auth/requireRhAccess';
import RhService, { RhHttpError } from '../services/rh.service';

function isInvalidNonStringQuery(val: unknown): boolean {
  return val !== undefined && val !== null && typeof val !== 'string';
}

function extractSingleStringQuery(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') return val;
  return null;
}

function parseUnidadIdParam(rawParam: unknown): number | null {
  if (typeof rawParam !== 'string' || !/^\d+$/.test(rawParam.trim())) {
    return null;
  }
  const parsed = Number(rawParam.trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parsePaginationAndSearchQuery(
  query: Record<string, unknown>
): { ok: boolean; q?: string | null; page?: number; pageSize?: number; error?: string } {
  if (
    isInvalidNonStringQuery(query.q) ||
    isInvalidNonStringQuery(query.page) ||
    isInvalidNonStringQuery(query.pageSize)
  ) {
    return { ok: false, error: 'Parámetros de consulta inválidos' };
  }

  const rawPage = extractSingleStringQuery(query.page);
  const rawPageSize = extractSingleStringQuery(query.pageSize);

  let page = 1;
  if (rawPage !== null && rawPage.trim() !== '') {
    const parsedPage = Number(rawPage);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      return { ok: false, error: 'Parámetro page inválido' };
    }
    page = parsedPage;
  }

  let pageSize = 20;
  if (rawPageSize !== null && rawPageSize.trim() !== '') {
    const parsedPageSize = Number(rawPageSize);
    if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1) {
      return { ok: false, error: 'Parámetro pageSize inválido' };
    }
    pageSize = Math.min(parsedPageSize, 100);
  }

  const q = extractSingleStringQuery(query.q)?.trim() || null;
  if (q && q.length > 200) {
    return { ok: false, error: 'Parámetro q excede la longitud permitida' };
  }

  return { ok: true, q, page, pageSize };
}

const ALLOWED_CREATE_ADSCRIPCION_KEYS: ReadonlySet<string> = new Set([
  'persona_id',
  'matricula',
  'puesto',
  'turno',
  'jornada',
  'horario',
  'vigente_desde',
  'vigente_hasta',
]);

const ALLOWED_UPDATE_ADSCRIPCION_KEYS: ReadonlySet<string> = new Set([
  'matricula',
  'puesto',
  'turno',
  'jornada',
  'horario',
  'vigente_desde',
  'vigente_hasta',
  'activo',
  'observaciones',
]);

const ALLOWED_UPDATE_IDENTIFICACION_KEYS: ReadonlySet<string> = new Set([
  'nombres',
  'apellidos',
  'nombre_completo',
  'rfc',
  'curp',
]);

const ALLOWED_CREATE_PERSONA_KEYS: ReadonlySet<string> = new Set([
  'nombres',
  'apellidos',
  'rfc',
  'curp',
  'cargo',
  'correo_principal',
  'unidad_medica_id',
  'fecha_ingreso',
]);

const ALLOWED_UPDATE_PERSONA_ESTADO_KEYS: ReadonlySet<string> = new Set(['activo']);

const ALLOWED_LIST_PERSONAS_QUERY_KEYS: ReadonlySet<string> = new Set([
  'q',
  'page',
  'pageSize',
  'estado',
  'unidadId',
]);

const ALLOWED_UPDATE_PERSONA_GENERAL_KEYS: ReadonlySet<string> = new Set([
  'nombres',
  'apellidos',
  'cargo',
  'correo_principal',
  'unidad_medica_id',
  'curp',
  'rfc',
  'fecha_ingreso',
]);

const ALLOWED_CREATE_COMISION_KEYS: ReadonlySet<string> = new Set([
  'adscripcion_origen_id',
  'unidad_destino_id',
  'area_destino_texto',
  'fecha_inicio',
  'fecha_fin',
  'motivo',
  'oficio_referencia',
  'observaciones',
]);

const ALLOWED_CONCLUIR_COMISION_KEYS: ReadonlySet<string> = new Set([
  'fecha_fin',
  'observaciones',
]);

const ALLOWED_LIST_COMISIONES_QUERY_KEYS: ReadonlySet<string> = new Set([
  'estado',
  'page',
  'pageSize',
]);

const ALLOWED_LIST_VACACIONES_QUERY_KEYS: ReadonlySet<string> = new Set([
  'anio_ciclo',
  'estado',
  'page',
  'pageSize',
]);

const ALLOWED_CREATE_VACACION_KEYS: ReadonlySet<string> = new Set([
  'adscripcion_id',
  'anio_ciclo',
  'periodo_referencia',
  'fecha_inicio',
  'fecha_fin',
  'dias_registrados',
  'documento_referencia',
  'observaciones',
]);

const ALLOWED_ANULAR_VACACION_KEYS: ReadonlySet<string> = new Set([
  'motivo_anulacion',
]);

const ALLOWED_LIST_ADSCRIPCIONES_PERSONA_QUERY_KEYS: ReadonlySet<string> = new Set([
  'estado',
  'page',
  'pageSize',
]);

export default class RhController {
  private readonly service = new RhService();

  async miContexto(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const queryKeys = Object.keys((req.query ?? {}) as Record<string, unknown>);
    if (queryKeys.length > 0) {
      res.status(400).json({
        error: `Parámetro de consulta no permitido en mi-contexto: ${queryKeys[0]}`,
      });
      return;
    }

    try {
      const result = await this.service.getMiContextoEmpleado(req.user.sub.trim());
      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en GET /api/rh/mi-contexto');
      res.status(500).json({ error: 'Error interno al consultar el contexto del empleado' });
    }
  }

  async unidadesAutorizadas(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    try {
      const result = await this.service.getUnidadesAutorizadas(req.rhAccess);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error en GET /api/rh/unidades-autorizadas:', err);
      res.status(500).json({ error: 'Error interno al consultar unidades autorizadas de RH' });
    }
  }

  async personalPorUnidad(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    const unidadId = parseUnidadIdParam(req.params?.unidadId);
    if (unidadId === null) {
      res.status(400).json({ error: 'Identificador de unidad de trabajo inválido' });
      return;
    }

    const parsedQuery = parsePaginationAndSearchQuery((req.query ?? {}) as Record<string, unknown>);
    if (!parsedQuery.ok) {
      res.status(400).json({ error: parsedQuery.error });
      return;
    }

    try {
      const result = await this.service.listPersonalPorUnidad(req.rhAccess, unidadId, {
        q: parsedQuery.q,
        page: parsedQuery.page,
        pageSize: parsedQuery.pageSize,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en GET /api/rh/unidades/:unidadId/personal:', err);
      res.status(500).json({ error: 'Error interno al consultar el padrón laboral de la unidad' });
    }
  }

  async personasCandidatasPorUnidad(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    const unidadId = parseUnidadIdParam(req.params?.unidadId);
    if (unidadId === null) {
      res.status(400).json({ error: 'Identificador de unidad de trabajo inválido' });
      return;
    }

    const parsedQuery = parsePaginationAndSearchQuery((req.query ?? {}) as Record<string, unknown>);
    if (!parsedQuery.ok) {
      res.status(400).json({ error: parsedQuery.error });
      return;
    }

    try {
      const result = await this.service.listPersonasCandidatasPorUnidad(req.rhAccess, unidadId, {
        q: parsedQuery.q,
        page: parsedQuery.page,
        pageSize: parsedQuery.pageSize,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en GET /api/rh/unidades/:unidadId/personas-candidatas:', err);
      res.status(500).json({ error: 'Error interno al consultar personas candidatas para la unidad' });
    }
  }

  async createAdscripcionPorUnidad(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS') {
      res.status(403).json({
        error: 'Solo el personal operativo con rol RECURSOS_HUMANOS puede registrar adscripciones laborales',
      });
      return;
    }

    const unidadId = parseUnidadIdParam(req.params?.unidadId);
    if (unidadId === null) {
      res.status(400).json({ error: 'Identificador de unidad de trabajo inválido' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    for (const key of Object.keys(body)) {
      if (!ALLOWED_CREATE_ADSCRIPCION_KEYS.has(key)) {
        res.status(400).json({ error: `Propiedad no permitida: ${key}` });
        return;
      }
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const created = await this.service.createAdscripcionLaboral(
        req.rhAccess,
        unidadId,
        {
          persona_id: body.persona_id,
          matricula: body.matricula,
          puesto: body.puesto,
          turno: body.turno,
          jornada: body.jornada,
          horario: body.horario,
          vigente_desde: body.vigente_desde,
          vigente_hasta: body.vigente_hasta,
        },
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      res.status(201).json(created);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en POST /api/rh/unidades/:unidadId/adscripciones:', err);
      res.status(500).json({ error: 'Error interno al registrar la adscripción laboral' });
    }
  }

  async fichaPersonalPorUnidad(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    const unidadId = parseUnidadIdParam(req.params?.unidadId);
    if (unidadId === null) {
      res.status(400).json({ error: 'Identificador de unidad de trabajo inválido' });
      return;
    }

    const adscripcionId = parseUnidadIdParam(req.params?.adscripcionId);
    if (adscripcionId === null) {
      res.status(400).json({ error: 'Identificador de adscripción laboral inválido' });
      return;
    }

    try {
      const result = await this.service.getFichaPersonalAdscripcion(
        req.rhAccess,
        unidadId,
        adscripcionId
      );
      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en GET /api/rh/unidades/:unidadId/personal/:adscripcionId:', err);
      res.status(500).json({ error: 'Error interno al consultar la ficha del trabajador' });
    }
  }

  async updateAdscripcionLaboralPorUnidad(
    req: RhAuthenticatedRequest,
    res: Response
  ): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS') {
      res.status(403).json({
        error: 'Solo el personal operativo con rol RECURSOS_HUMANOS puede modificar información laboral',
      });
      return;
    }

    const unidadId = parseUnidadIdParam(req.params?.unidadId);
    if (unidadId === null) {
      res.status(400).json({ error: 'Identificador de unidad de trabajo inválido' });
      return;
    }

    const adscripcionId = parseUnidadIdParam(req.params?.adscripcionId);
    if (adscripcionId === null) {
      res.status(400).json({ error: 'Identificador de adscripción laboral inválido' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    const keys = Object.keys(body);
    if (keys.length === 0) {
      res.status(400).json({
        error: 'Debe especificar al menos una propiedad laboral permitida para actualizar',
      });
      return;
    }

    for (const key of keys) {
      if (!ALLOWED_UPDATE_ADSCRIPCION_KEYS.has(key)) {
        res.status(400).json({ error: `Propiedad no permitida: ${key}` });
        return;
      }
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const updated = await this.service.updateAdscripcionLaboral(
        req.rhAccess,
        unidadId,
        adscripcionId,
        body as Record<string, unknown>,
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      res.status(200).json(updated);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/laboral:', err);
      res.status(500).json({ error: 'Error interno al actualizar la información laboral' });
    }
  }

  async revelarIdentificadoresPorUnidad(
    req: RhAuthenticatedRequest,
    res: Response
  ): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para revelar identificadores sensibles',
      });
      return;
    }

    const unidadId = parseUnidadIdParam(req.params?.unidadId);
    if (unidadId === null) {
      res.status(400).json({ error: 'Identificador de unidad de trabajo inválido' });
      return;
    }

    const adscripcionId = parseUnidadIdParam(req.params?.adscripcionId);
    if (adscripcionId === null) {
      res.status(400).json({ error: 'Identificador de adscripción laboral inválido' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido: se requiere un objeto JSON vacío {}' });
      return;
    }

    const keys = Object.keys(body);
    if (keys.length > 0) {
      res.status(400).json({
        error: `Propiedad no permitida en revelación de identificadores: ${keys[0]}`,
      });
      return;
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const revealed = await this.service.revelarIdentificadoresSensiblesAdscripcion(
        req.rhAccess,
        unidadId,
        adscripcionId,
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(revealed);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en POST /api/rh/unidades/:unidadId/personal/:adscripcionId/revelar-identificadores');
      res.status(500).json({ error: 'Error interno al revelar identificadores del trabajador' });
    }
  }

  async updateIdentificacionPersonalPorUnidad(
    req: RhAuthenticatedRequest,
    res: Response
  ): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para modificar datos de identificación personal',
      });
      return;
    }

    const unidadId = parseUnidadIdParam(req.params?.unidadId);
    if (unidadId === null) {
      res.status(400).json({ error: 'Identificador de unidad de trabajo inválido' });
      return;
    }

    const adscripcionId = parseUnidadIdParam(req.params?.adscripcionId);
    if (adscripcionId === null) {
      res.status(400).json({ error: 'Identificador de adscripción laboral inválido' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    const keys = Object.keys(body);
    if (keys.length === 0) {
      res.status(400).json({
        error: 'Debe especificar al menos una propiedad de identificación permitida para actualizar',
      });
      return;
    }

    for (const key of keys) {
      if (!ALLOWED_UPDATE_IDENTIFICACION_KEYS.has(key)) {
        res.status(400).json({ error: `Propiedad no permitida: ${key}` });
        return;
      }
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const updated = await this.service.updatePersonaIdentificacionAdscripcion(
        req.rhAccess,
        unidadId,
        adscripcionId,
        body as Record<string, unknown>,
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(updated);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en PATCH /api/rh/unidades/:unidadId/personal/:adscripcionId/identificacion');
      res.status(500).json({ error: 'Error interno al actualizar la identificación del trabajador' });
    }
  }

  async createPersona(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para registrar personas en el padrón institucional',
      });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    for (const key of Object.keys(body)) {
      if (!ALLOWED_CREATE_PERSONA_KEYS.has(key)) {
        res.status(400).json({ error: `Propiedad no permitida: ${key}` });
        return;
      }
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const created = await this.service.createPersonaInstitucional(
        req.rhAccess,
        body as Record<string, unknown>,
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en POST /api/rh/personas');
      res.status(500).json({ error: 'Error interno al registrar la persona en el padrón' });
    }
  }

  async updatePersonaEstado(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para modificar el estado administrativo de personas',
      });
      return;
    }

    const personaId = parseUnidadIdParam(req.params?.personaId);
    if (personaId === null) {
      res.status(400).json({ error: 'Identificador de persona inválido' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    const keys = Object.keys(body);
    if (keys.length !== 1 || !ALLOWED_UPDATE_PERSONA_ESTADO_KEYS.has(keys[0])) {
      res.status(400).json({
        error: 'El cuerpo debe contener únicamente la propiedad booleana "activo"',
      });
      return;
    }

    if (typeof body.activo !== 'boolean') {
      res.status(400).json({ error: 'El campo "activo" debe ser un booleano real (true o false)' });
      return;
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const updated = await this.service.updatePersonaEstadoAdministrativo(
        req.rhAccess,
        personaId,
        body.activo,
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(updated);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en PATCH /api/rh/personas/:personaId/estado');
      res.status(500).json({ error: 'Error interno al actualizar el estado administrativo de la persona' });
    }
  }

  async listPersonasPadron(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar el padrón institucional completo',
      });
      return;
    }

    const query = (req.query ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(query)) {
      if (!ALLOWED_LIST_PERSONAS_QUERY_KEYS.has(key)) {
        res.status(400).json({ error: `Parámetro de consulta no permitido: ${key}` });
        return;
      }
    }

    const parsedPagination = parsePaginationAndSearchQuery(query);
    if (!parsedPagination.ok) {
      res.status(400).json({ error: parsedPagination.error });
      return;
    }

    if (isInvalidNonStringQuery(query.estado) || isInvalidNonStringQuery(query.unidadId)) {
      res.status(400).json({ error: 'Parámetros de consulta inválidos' });
      return;
    }

    let estado: 'activas' | 'inactivas' | 'todas' = 'todas';
    const rawEstado = extractSingleStringQuery(query.estado);
    if (rawEstado !== null && rawEstado.trim() !== '') {
      const normEstado = rawEstado.trim().toLowerCase();
      if (normEstado !== 'activas' && normEstado !== 'inactivas' && normEstado !== 'todas') {
        res.status(400).json({
          error: 'El parámetro "estado" debe ser "activas", "inactivas" o "todas"',
        });
        return;
      }
      estado = normEstado;
    }

    let unidadId: number | null = null;
    const rawUnidadId = extractSingleStringQuery(query.unidadId);
    if (rawUnidadId !== null && rawUnidadId.trim() !== '') {
      const parsedUnidad = parseUnidadIdParam(rawUnidadId);
      if (parsedUnidad === null) {
        res.status(400).json({ error: 'El parámetro "unidadId" debe ser un entero positivo válido' });
        return;
      }
      unidadId = parsedUnidad;
    }

    try {
      const result = await this.service.listPersonasPadronInstitucional(req.rhAccess, {
        q: parsedPagination.q,
        page: parsedPagination.page,
        pageSize: parsedPagination.pageSize,
        estado,
        unidadId,
      });

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en GET /api/rh/personas');
      res.status(500).json({ error: 'Error interno al consultar el padrón institucional' });
    }
  }

  async updatePersonaGeneral(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para editar datos generales del padrón institucional',
      });
      return;
    }

    const personaId = parseUnidadIdParam(req.params?.personaId);
    if (personaId === null) {
      res.status(400).json({ error: 'Identificador de persona inválido' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    const keys = Object.keys(body);
    if (keys.length === 0) {
      res.status(400).json({
        error:
          'Debe especificar al menos una propiedad general permitida para actualizar (cargo, correo_principal o unidad_medica_id)',
      });
      return;
    }

    for (const key of keys) {
      if (!ALLOWED_UPDATE_PERSONA_GENERAL_KEYS.has(key)) {
        res.status(400).json({ error: `Propiedad no permitida: ${key}` });
        return;
      }
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const updated = await this.service.updatePersonaGeneralDatos(
        req.rhAccess,
        personaId,
        body as Record<string, unknown>,
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(updated);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en PATCH /api/rh/personas/:personaId/general');
      res.status(500).json({ error: 'Error interno al actualizar datos generales de la persona' });
    }
  }

  async listComisionesPersona(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar comisiones laborales',
      });
      return;
    }

    const personaId = parseUnidadIdParam(req.params?.personaId);
    if (personaId === null) {
      res.status(400).json({ error: 'Identificador de persona inválido' });
      return;
    }

    const query = (req.query ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(query)) {
      if (!ALLOWED_LIST_COMISIONES_QUERY_KEYS.has(key)) {
        res.status(400).json({ error: `Parámetro de consulta no permitido: ${key}` });
        return;
      }
    }

    const parsedPagination = parsePaginationAndSearchQuery(query);
    if (!parsedPagination.ok) {
      res.status(400).json({ error: parsedPagination.error });
      return;
    }

    if (isInvalidNonStringQuery(query.estado)) {
      res.status(400).json({ error: 'Parámetro estado inválido' });
      return;
    }

    let estado: 'todas' | 'vigentes' | 'futuras' | 'concluidas' = 'todas';
    const rawEstado = extractSingleStringQuery(query.estado);
    if (rawEstado !== null && rawEstado.trim() !== '') {
      const norm = rawEstado.trim().toLowerCase();
      if (norm !== 'todas' && norm !== 'vigentes' && norm !== 'futuras' && norm !== 'concluidas') {
        res.status(400).json({
          error: 'El parámetro "estado" debe ser "todas", "vigentes", "futuras" o "concluidas"',
        });
        return;
      }
      estado = norm;
    }

    try {
      const result = await this.service.listComisionesPorPersona(req.rhAccess, personaId, {
        estado,
        page: parsedPagination.page,
        pageSize: parsedPagination.pageSize,
      });

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en GET /api/rh/personas/:personaId/comisiones');
      res.status(500).json({ error: 'Error interno al consultar las comisiones laborales' });
    }
  }

  async createComisionPersona(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para registrar comisiones laborales',
      });
      return;
    }

    const personaId = parseUnidadIdParam(req.params?.personaId);
    if (personaId === null) {
      res.status(400).json({ error: 'Identificador de persona inválido' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    for (const key of Object.keys(body)) {
      if (!ALLOWED_CREATE_COMISION_KEYS.has(key)) {
        res.status(400).json({ error: `Propiedad no permitida: ${key}` });
        return;
      }
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const created = await this.service.createComisionLaboral(
        req.rhAccess,
        personaId,
        body as Record<string, unknown>,
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en POST /api/rh/personas/:personaId/comisiones');
      res.status(500).json({ error: 'Error interno al registrar la comisión laboral' });
    }
  }

  async concluirComisionPersona(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para concluir comisiones laborales',
      });
      return;
    }

    const personaId = parseUnidadIdParam(req.params?.personaId);
    if (personaId === null) {
      res.status(400).json({ error: 'Identificador de persona inválido' });
      return;
    }

    const comisionId = parseUnidadIdParam(req.params?.comisionId);
    if (comisionId === null) {
      res.status(400).json({ error: 'Identificador de comisión inválido' });
      return;
    }

    const body = req.body ?? {};
    if (typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    for (const key of Object.keys(body)) {
      if (!ALLOWED_CONCLUIR_COMISION_KEYS.has(key)) {
        res.status(400).json({ error: `Propiedad no permitida: ${key}` });
        return;
      }
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const updated = await this.service.concluirComisionLaboral(
        req.rhAccess,
        personaId,
        comisionId,
        body as Record<string, unknown>,
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(updated);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en PATCH /api/rh/personas/:personaId/comisiones/:comisionId/concluir');
      res.status(500).json({ error: 'Error interno al concluir la comisión laboral' });
    }
  }

  async listVacacionesPersona(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar vacaciones',
      });
      return;
    }

    const personaId = parseUnidadIdParam(req.params?.personaId);
    if (personaId === null) {
      res.status(400).json({ error: 'Identificador de persona inválido' });
      return;
    }

    const queryObj = (req.query ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(queryObj)) {
      if (!ALLOWED_LIST_VACACIONES_QUERY_KEYS.has(key)) {
        res.status(400).json({ error: `Parámetro de consulta no permitido: ${key}` });
        return;
      }
    }

    if (isInvalidNonStringQuery(queryObj.estado) || isInvalidNonStringQuery(queryObj.anio_ciclo)) {
      res.status(400).json({ error: 'Parámetros de consulta inválidos' });
      return;
    }

    const rawEstado = extractSingleStringQuery(queryObj.estado)?.trim().toLowerCase() ?? 'todos';
    if (!['todos', 'registrados', 'anulados'].includes(rawEstado)) {
      res.status(400).json({ error: 'Parámetro estado inválido (permitidos: todos, registrados, anulados)' });
      return;
    }

    let anioCiclo: number | undefined;
    const rawAnio = extractSingleStringQuery(queryObj.anio_ciclo)?.trim() ?? '';
    if (rawAnio !== '') {
      if (!/^\d{4}$/.test(rawAnio)) {
        res.status(400).json({ error: 'Parámetro anio_ciclo inválido' });
        return;
      }
      anioCiclo = Number(rawAnio);
      if (anioCiclo < 1990 || anioCiclo > 2100) {
        res.status(400).json({ error: 'Parámetro anio_ciclo fuera de rango permitido (1990-2100)' });
        return;
      }
    }

    const parsedPagination = parsePaginationAndSearchQuery(queryObj);
    if (!parsedPagination.ok) {
      res.status(400).json({ error: parsedPagination.error });
      return;
    }

    try {
      const result = await this.service.listVacacionesPorPersona(req.rhAccess, personaId, {
        anioCiclo,
        estado: rawEstado as 'todos' | 'registrados' | 'anulados',
        page: parsedPagination.page,
        pageSize: parsedPagination.pageSize,
      });

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en GET /api/rh/personas/:personaId/vacaciones');
      res.status(500).json({ error: 'Error interno al consultar los registros vacacionales' });
    }
  }

  async createVacacionPersona(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para registrar vacaciones',
      });
      return;
    }

    const personaId = parseUnidadIdParam(req.params?.personaId);
    if (personaId === null) {
      res.status(400).json({ error: 'Identificador de persona inválido' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    for (const key of Object.keys(body)) {
      if (!ALLOWED_CREATE_VACACION_KEYS.has(key)) {
        res.status(400).json({ error: `Propiedad no permitida: ${key}` });
        return;
      }
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const created = await this.service.createVacacionRegistro(
        req.rhAccess,
        personaId,
        body as Record<string, unknown>,
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en POST /api/rh/personas/:personaId/vacaciones');
      res.status(500).json({ error: 'Error interno al registrar el periodo vacacional' });
    }
  }

  async anularVacacionPersona(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para anular registros vacacionales',
      });
      return;
    }

    const personaId = parseUnidadIdParam(req.params?.personaId);
    if (personaId === null) {
      res.status(400).json({ error: 'Identificador de persona inválido' });
      return;
    }

    const registroId = parseUnidadIdParam(req.params?.registroId);
    if (registroId === null) {
      res.status(400).json({ error: 'Identificador de registro vacacional inválido' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    for (const key of Object.keys(body)) {
      if (!ALLOWED_ANULAR_VACACION_KEYS.has(key)) {
        res.status(400).json({ error: `Propiedad no permitida: ${key}` });
        return;
      }
    }

    try {
      const userAgent =
        typeof req.get === 'function' ? req.get('User-Agent') ?? null : null;
      const ip = typeof req.ip === 'string' ? req.ip : null;

      const updated = await this.service.anularVacacionRegistro(
        req.rhAccess,
        personaId,
        registroId,
        body as Record<string, unknown>,
        {
          userId: req.user.sub.trim(),
          ip,
          userAgent,
        }
      );

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(updated);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en PATCH /api/rh/personas/:personaId/vacaciones/:registroId/anular');
      res.status(500).json({ error: 'Error interno al anular el registro vacacional' });
    }
  }

  async listAdscripcionesPersona(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    if (req.rhAccess.grantedBy !== 'RECURSOS_HUMANOS' || req.rhAccess.scope !== 'GLOBAL') {
      res.status(403).json({
        error:
          'Solo el personal con alcance estatal RECURSOS_HUMANOS GLOBAL está autorizado para consultar las adscripciones laborales por trabajador',
      });
      return;
    }

    const personaId = parseUnidadIdParam(req.params?.personaId);
    if (personaId === null) {
      res.status(400).json({ error: 'Identificador de persona inválido' });
      return;
    }

    const queryObj = (req.query ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(queryObj)) {
      if (!ALLOWED_LIST_ADSCRIPCIONES_PERSONA_QUERY_KEYS.has(key)) {
        res.status(400).json({ error: `Parámetro de consulta no permitido: ${key}` });
        return;
      }
    }

    if (isInvalidNonStringQuery(queryObj.estado)) {
      res.status(400).json({ error: 'Parámetro estado inválido' });
      return;
    }

    const rawEstado = extractSingleStringQuery(queryObj.estado)?.trim().toLowerCase() ?? 'todas';
    if (!['todas', 'vigentes', 'futuras', 'historicas'].includes(rawEstado)) {
      res.status(400).json({
        error: 'Parámetro estado inválido (permitidos: todas, vigentes, futuras, historicas)',
      });
      return;
    }

    const parsedPagination = parsePaginationAndSearchQuery(queryObj);
    if (!parsedPagination.ok) {
      res.status(400).json({ error: parsedPagination.error });
      return;
    }

    try {
      const result = await this.service.listAdscripcionesPorPersona(req.rhAccess, personaId, {
        estado: rawEstado as 'todas' | 'vigentes' | 'futuras' | 'historicas',
        page: parsedPagination.page,
        pageSize: parsedPagination.pageSize,
      });

      if (typeof res.set === 'function') {
        res.set('Cache-Control', 'no-store');
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof RhHttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error en GET /api/rh/personas/:personaId/adscripciones');
      res.status(500).json({ error: 'Error interno al consultar las adscripciones laborales' });
    }
  }
}
