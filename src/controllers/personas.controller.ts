import { Request, Response } from 'express';
import PersonasService from "../services/personas.service";

export default class PersonasController {
  private svc = new PersonasService();

  list = async (req: Request, res: Response): Promise<void> => {
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

  byId = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const out = await this.svc.byId(id);
      if (!out) {
        res.sendStatus(404);
        return;
      }
      res.json(out);
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Error al obtener persona' });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body || {};
      const { nombre_completo, unidad_medica_id, correo_principal, correos } = body;
      if (!nombre_completo?.trim()) {
        res.status(400).json({ ok: false, error: 'nombre_completo requerido' });
        return;
      }

      const hasCorreoPrincipal = Object.prototype.hasOwnProperty.call(body, 'correo_principal');
      const out = await this.svc.create({
        nombre_completo: String(nombre_completo).trim(),
        unidad_medica_id: unidad_medica_id ?? null,
        correo_principal: hasCorreoPrincipal ? correo_principal : undefined,
        correos: Array.isArray(correos) ? correos : undefined
      });
      res.status(201).json(out);
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e?.message || 'No se pudo crear persona' });
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const body = req.body || {};
      const { nombre_completo, unidad_medica_id, correo_principal, correos } = body;
      const hasUnidad = Object.prototype.hasOwnProperty.call(body, 'unidad_medica_id');
      const hasCorreoPrincipal = Object.prototype.hasOwnProperty.call(body, 'correo_principal');

      const out = await this.svc.update(id, {
        nombre_completo: nombre_completo ?? undefined,
        unidad_medica_id: hasUnidad ? unidad_medica_id : undefined,
        correo_principal: hasCorreoPrincipal ? correo_principal : undefined,
        correos: Array.isArray(correos) ? correos : undefined
      });
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e?.message || 'No se pudo actualizar persona' });
    }
  };

  softDelete = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const out = await this.svc.softDelete(id);
      res.json(out);
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e?.message || 'No se pudo eliminar (soft-delete)' });
    }
  };
}
