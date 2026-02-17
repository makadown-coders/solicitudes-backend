import { Request, Response } from 'express';
import HomologosService from '../services/homologos.service';

export default class HomologosController {
  private svc = new HomologosService();

  /** GET /api/homologos?clave=... */
  getByClave = async (req: Request, res: Response) => {
    try {
      const clave = String(req.query.clave || '').trim().toUpperCase();
      if (!clave) return res.status(400).json({ error: 'missing_clave' });

      const rows = await this.svc.getByClave(clave);
      res.json({ rows });
    } catch (e: any) {
      res.status(500).json({ error: 'get_homologos_failed', detail: e?.message });
    }
  };

  /** POST /api/homologos/batch  { claves: [...] } */
  batch = async (req: Request, res: Response) => {
    try {
      const claves = (req.body?.claves ?? []) as string[];
      const rows = await this.svc.batch(claves);
      res.json({ rows });
    } catch (e: any) {
      res.status(500).json({ error: 'batch_homologos_failed', detail: e?.message });
    }
  };
}
