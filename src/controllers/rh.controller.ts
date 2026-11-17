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

export default class RhController {
  private readonly service = new RhService();

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
}
