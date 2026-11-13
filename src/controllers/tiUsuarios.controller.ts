import { Request, Response } from 'express';
import TiUsuariosService, { TiUsuarioHttpError } from '../services/tiUsuarios.service';

function isInvalidNonStringQuery(val: unknown): boolean {
  return val !== undefined && val !== null && typeof val !== 'string';
}

function extractSingleStringQuery(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') return val;
  return null;
}

export default class TiUsuariosController {
  private readonly svc = new TiUsuariosService();

  listRoles = async (_req: Request, res: Response): Promise<void> => {
    try {
      const roles = await this.svc.listRoles();
      res.json(roles);
    } catch {
      res.status(500).json({ ok: false, error: 'Error al consultar roles' });
    }
  };

  listUsuarios = async (req: Request, res: Response): Promise<void> => {
    try {
      if (
        isInvalidNonStringQuery(req.query.q) ||
        isInvalidNonStringQuery(req.query.status) ||
        isInvalidNonStringQuery(req.query.page) ||
        isInvalidNonStringQuery(req.query.pageSize)
      ) {
        res.status(400).json({ ok: false, error: 'Parámetros de consulta inválidos' });
        return;
      }

      const rawPage = extractSingleStringQuery(req.query.page);
      const rawPageSize = extractSingleStringQuery(req.query.pageSize);

      let page = 1;
      if (rawPage !== null && rawPage.trim() !== '') {
        const parsedPage = Number(rawPage);
        if (!Number.isInteger(parsedPage) || parsedPage < 1) {
          res.status(400).json({ ok: false, error: 'Parámetro page inválido' });
          return;
        }
        page = parsedPage;
      }

      let pageSize = 20;
      if (rawPageSize !== null && rawPageSize.trim() !== '') {
        const parsedPageSize = Number(rawPageSize);
        if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1) {
          res.status(400).json({ ok: false, error: 'Parámetro pageSize inválido' });
          return;
        }
        pageSize = Math.min(parsedPageSize, 100);
      }

      const q = extractSingleStringQuery(req.query.q)?.trim() || null;
      const status = extractSingleStringQuery(req.query.status)?.trim() || null;

      if (q && q.length > 200) {
        res.status(400).json({ ok: false, error: 'Parámetro q excede la longitud permitida' });
        return;
      }

      if (status && status.length > 50) {
        res.status(400).json({ ok: false, error: 'Parámetro status inválido' });
        return;
      }

      const out = await this.svc.listUsuariosPaged({
        q,
        status,
        page,
        pageSize,
      });

      res.json(out);
    } catch {
      res.status(500).json({ ok: false, error: 'Error al listar usuarios' });
    }
  };

  updateStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ ok: false, error: 'Payload inválido' });
        return;
      }

      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== 'status' || typeof body.status !== 'string') {
        res.status(400).json({ ok: false, error: 'Solo se admite la propiedad "status" como cadena válida' });
        return;
      }

      const out = await this.svc.updateUsuarioStatus(String(req.params.id ?? ''), body.status);
      res.json(out);
    } catch (err: unknown) {
      if (err instanceof TiUsuarioHttpError) {
        res.status(err.status).json({ ok: false, error: err.message });
        return;
      }
      res.status(500).json({ ok: false, error: 'Error al actualizar el estado de la cuenta' });
    }
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ ok: false, error: 'Payload inválido' });
        return;
      }

      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== 'password' || typeof body.password !== 'string') {
        res.status(400).json({ ok: false, error: 'Solo se admite la propiedad "password" como cadena válida' });
        return;
      }

      const out = await this.svc.resetUsuarioPassword(String(req.params.id ?? ''), body.password);
      res.json(out);
    } catch (err: unknown) {
      if (err instanceof TiUsuarioHttpError) {
        res.status(err.status).json({ ok: false, error: err.message });
        return;
      }
      res.status(500).json({ ok: false, error: 'Error al restablecer la contraseña' });
    }
  };

  updateRoles = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ ok: false, error: 'Payload inválido' });
        return;
      }

      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== 'roles' || !Array.isArray(body.roles)) {
        res.status(400).json({ ok: false, error: 'Solo se admite la propiedad "roles" como arreglo válido' });
        return;
      }

      const out = await this.svc.updateUsuarioRoles(String(req.params.id ?? ''), body.roles);
      res.json(out);
    } catch (err: unknown) {
      if (err instanceof TiUsuarioHttpError) {
        res.status(err.status).json({ ok: false, error: err.message });
        return;
      }
      res.status(500).json({ ok: false, error: 'Error al actualizar los roles de la cuenta' });
    }
  };

  createUsuario = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ ok: false, error: 'Payload inválido' });
        return;
      }

      const ALLOWED_KEYS = new Set(['persona_id', 'email', 'name', 'password', 'status']);
      for (const key of Object.keys(body)) {
        if (!ALLOWED_KEYS.has(key)) {
          res.status(400).json({ ok: false, error: `Propiedad no permitida: ${key}` });
          return;
        }
      }

      const out = await this.svc.createUsuario({
        persona_id: body.persona_id,
        email: body.email,
        name: body.name,
        password: body.password,
        status: body.status,
      });
      res.status(201).json(out);
    } catch (err: unknown) {
      if (err instanceof TiUsuarioHttpError) {
        res.status(err.status).json({ ok: false, error: err.message });
        return;
      }
      res.status(500).json({ ok: false, error: 'Error al crear la cuenta SSO' });
    }
  };

  createRole = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ ok: false, error: 'Payload inválido' });
        return;
      }

      const ALLOWED_KEYS = new Set(['code', 'description']);
      for (const key of Object.keys(body)) {
        if (!ALLOWED_KEYS.has(key)) {
          res.status(400).json({ ok: false, error: `Propiedad no permitida: ${key}` });
          return;
        }
      }

      const out = await this.svc.createRole({
        code: body.code,
        description: body.description,
      });
      res.status(201).json(out);
    } catch (err: unknown) {
      if (err instanceof TiUsuarioHttpError) {
        res.status(err.status).json({ ok: false, error: err.message });
        return;
      }
      res.status(500).json({ ok: false, error: 'Error al crear el rol' });
    }
  };
}
