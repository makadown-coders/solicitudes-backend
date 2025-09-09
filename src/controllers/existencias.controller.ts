import { Request, Response } from 'express';
import ExistenciasService from '../services/existencias.service';

export default class ExistenciasController {
  private svc = new ExistenciasService();

  init = async (req: Request, res: Response) => {
    try {
      const reset = String(req.query.reset ?? 'true') === 'true';
      const out = await this.svc.init(reset);
      res.json(out);
    } catch (e:any) {
      res.status(500).json({ error: 'init_failed', detail: e?.message });
    }
  };

  batch = async (req: Request, res: Response) => {
    try {
      const rows = req.body?.rows ?? [];
      const out = await this.svc.batch(rows);
      console.log('Enviando batch de existencias exitosamente con', out.inserted, 'registros');
      res.json(out);
    } catch (e:any) {
      console.error('Error al insertar batch de existencias');
      console.error(e);
      res.status(500).json({ error: 'batch_failed', detail: e?.message });
    }
  };
}
