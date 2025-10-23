// src/controllers/personas.controller.ts
import { Request, Response } from 'express';
import PersonasService from "../services/personas.service";

export default class PersonasController {
  private svc = new PersonasService();

  list = async (req: Request, res: Response) => {
    try {
      const pageSize = Math.min(Number(req.query.pageSize ?? 20), 100);
      const page = Math.max(Number(req.query.page ?? 1), 1);
      const q = req.query.q ? String(req.query.q) : null;
      const unidad_medica_id = req.query.unidad_medica_id ? Number(req.query.unidad_medica_id) : null;

      const out = await this.svc.listPaged({ q, unidad_medica_id, page, pageSize });
      res.json(out);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'Error al listar personas' });
    }
  };
}