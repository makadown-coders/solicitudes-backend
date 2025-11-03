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

  byId = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const out = await this.svc.byId(id);
      if (!out) return res.sendStatus(404);
      res.json(out);
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Error al obtener persona' });
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      const { nombre_completo, unidad_medica_id, correos } = req.body || {};
      if (!nombre_completo?.trim()) return res.status(400).json({ ok: false, error: 'nombre_completo requerido' });

      const out = await this.svc.create({
        nombre_completo: String(nombre_completo).trim(),
        unidad_medica_id: unidad_medica_id ?? null,
        correos: Array.isArray(correos) ? correos : []
      });
      res.status(201).json(out);
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e?.message || 'No se pudo crear persona' });
    }
  };

  update = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { nombre_completo, unidad_medica_id, correos } = req.body || {};
      const out = await this.svc.update(id, {
        nombre_completo: nombre_completo ?? undefined,
        unidad_medica_id: unidad_medica_id ?? undefined,
        correos: Array.isArray(correos) ? correos : undefined
      });
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e?.message || 'No se pudo actualizar persona' });
    }
  };

  softDelete = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const out = await this.svc.softDelete(id);
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e?.message || 'No se pudo eliminar (soft-delete)' });
    }
  };
}