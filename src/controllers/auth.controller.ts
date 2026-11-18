import type { Request, Response } from 'express';
import AuthService from '../services/auth.service';
import {
  isAuthBadRequestError,
  isAuthForbiddenError,
  isAuthNotFoundError,
  isAuthUnauthorizedError,
} from '../services/localAuth.service';

export default class AuthController {
  private auth: AuthService;

  constructor(deps?: { auth?: AuthService }) {
    this.auth = deps?.auth ?? new AuthService();
  }

  login = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'email and password required' });
      return;
    }
    try {
      const out = await this.auth.login(email, password);
      res.json(out);
    } catch (e: any) {
      if (isAuthUnauthorizedError(e)) {
        res.status(401).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const { refresh_token } = req.body || {};
    if (!refresh_token) {
      res.status(400).json({ error: 'refresh_token required' });
      return;
    }
    try {
      const out = await this.auth.refresh(refresh_token);
      res.json(out);
    } catch (e: any) {
      if (isAuthUnauthorizedError(e)) {
        res.status(401).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const out = await this.auth.me(req.user.sub);
      res.json({ auth_user_id: req.user.sub, email: req.user.email, ...out });
    } catch (e: any) {
      if (isAuthUnauthorizedError(e)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      res.status(500).json({ error: e?.message || 'Internal server error' });
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refresh_token } = req.body || {};
      const out = await this.auth.logout(refresh_token);
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'logout failed' });
    }
  };

  logoutAll = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.sub) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const out = await this.auth.logoutAll(req.user.sub);
      res.json(out);
    } catch (e: any) {
      if (isAuthUnauthorizedError(e)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      res.status(400).json({ error: e?.message || 'logout failed' });
    }
  };

  changeOwnPassword = async (req: Request, res: Response): Promise<void> => {
    if (typeof req.user?.sub !== 'string' || !req.user.sub.trim()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    const ALLOWED_KEYS = new Set(['current_password', 'new_password']);
    const keys = Object.keys(body);
    for (const key of keys) {
      if (!ALLOWED_KEYS.has(key)) {
        res.status(400).json({ error: `Propiedad no permitida: ${key}` });
        return;
      }
    }

    if (
      keys.length !== 2 ||
      typeof body.current_password !== 'string' ||
      typeof body.new_password !== 'string'
    ) {
      res.status(400).json({
        error: 'Se requieren exclusivamente las propiedades "current_password" y "new_password" como cadenas de texto',
      });
      return;
    }

    try {
      const out = await this.auth.changeOwnPassword(req.user.sub, {
        current_password: body.current_password,
        new_password: body.new_password,
      });
      res.status(200).json(out);
    } catch (e: unknown) {
      if (isAuthBadRequestError(e)) {
        res.status(400).json({ error: e.message });
        return;
      }
      if (isAuthUnauthorizedError(e)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      if (isAuthForbiddenError(e)) {
        res.status(403).json({ error: e.message });
        return;
      }
      if (isAuthNotFoundError(e)) {
        res.status(404).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
