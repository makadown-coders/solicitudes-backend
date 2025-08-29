import type { Request, Response } from 'express';
import AuthService from '../services/auth.service';

export default class AuthController {
  private service = new AuthService();

  login = async (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    try {
      const out = await this.service.login(email, password);
      return res.json(out);
    } catch (e: any) {
      return res.status(401).json({ error: e.message });
    }
  };

  refresh = async (req: Request, res: Response) => {
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });
    try {
      const out = await this.service.refresh(refresh_token);
      return res.json(out);
    } catch (e: any) {
      return res.status(401).json({ error: e.message });
    }
  };

  me = async (req: Request, res: Response) => {
    if (!req.user?.sub) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const out = await this.service.me(req.user.sub);
      return res.json({ auth_user_id: req.user.sub, email: req.user.email, ...out });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  logout = async (_req: Request, res: Response) => {
    // Si usas cookies HttpOnly limpia aquí; si no, el front borra sus tokens
    return res.json({ ok: true });
  };
}
