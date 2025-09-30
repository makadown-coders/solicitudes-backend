// src/controllers/dispositivos.controller.ts
import { Request, Response } from 'express';
import DispositivosService from '../services/dispositivos.service';

export default class DispositivosController {
  private svc = new DispositivosService();

  list = async (req: Request, res: Response) => {
    try {
      const pageSize = Math.min(Number(req.query.pageSize ?? 20), 100);
      const page = Math.max(Number(req.query.page ?? 1), 1);
      const unidad_medica_id = req.query.unidad_medica_id ? Number(req.query.unidad_medica_id) : null;
      const tipo_dispositivo_id = req.query.tipo_dispositivo_id ? Number(req.query.tipo_dispositivo_id) : null;
      const estado_dispositivo_id= req.query.estado_dispositivo_id ? Number(req.query.estado_dispositivo_id) : null;
      const q = req.query.q ? String(req.query.q) : null;

      const out = await this.svc.listPaged({
        unidad_medica_id, tipo_dispositivo_id, estado_dispositivo_id, q, page, pageSize
      });

      res.json(out);
    } catch (e) {
      res.status(500).json({ message: 'Error al listar dispositivos' });
    }
  };

  create = async (req: Request, res: Response) => {
    try { res.status(201).json(await this.svc.create(req.body)); }
    catch (e: any) { res.status(400).json({ error: e?.message || 'Error al crear dispositivo' }); }
  };

  byId = async (req: Request, res: Response) => {
    try {
      const out = await this.svc.byId(Number(req.params.id));
      if (!out) return res.sendStatus(404);
      res.json(out);
    } catch { res.status(500).json({ message: 'Error al obtener dispositivo' }); }
  };
}
