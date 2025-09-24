import type { Request, Response } from 'express';
import AuthService from '../services/auth.service';

export default class AuthController {
  private auth = new AuthService();

  login = async (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    try {
      const out = await this.auth.login(email, password);
      return res.json(out);
    } catch (e: any) {
      return res.status(401).json({ error: e.message });
    }
  };

  refresh = async (req: Request, res: Response) => {
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });
    try {
      const out = await this.auth.refresh(refresh_token);
      return res.json(out);
    } catch (e: any) {
      return res.status(401).json({ error: e.message });
    }
  };

  me = async (req: Request, res: Response) => {
    if (!req.user?.sub) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const out = await this.auth.me(req.user.sub);
      return res.json({ auth_user_id: req.user.sub, email: req.user.email, ...out });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  logout = async (req: Request, res: Response) => {
    try {
      const { refresh_token } = req.body || {};
      const out = await this.auth.logout(refresh_token);
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'logout failed' });
    }
  };

  logoutAll = async (req: Request, res: Response) => {
    try {
      const out = await this.auth.logoutAll(req.user.sub);
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'logout failed' });
    }
  }
}
