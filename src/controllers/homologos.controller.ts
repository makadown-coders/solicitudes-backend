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

  /** POST /api/homologos/batch-forward  { claves: [...] } */
  batchForward = async (req: Request, res: Response) => {
    try {
      const claves = (req.body?.claves ?? []) as string[];
      const rows = await this.svc.batchForward(claves);
      res.json({ rows });
    } catch (e: any) {
      res.status(500).json({ error: 'batch_forward_homologos_failed', detail: e?.message });
    }
  };

  /** GET /api/homologos/crud */
  listarCrud = async (_req: Request, res: Response) => {
    try {
      const rows = await this.svc.listCrud();
      res.json({ rows });
    } catch (e: any) {
      res.status(500).json({ error: 'list_homologos_crud_failed', detail: e?.message });
    }
  };

  /** GET /api/homologos/crud/:id */
  obtenerCrudById = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid_id' });
      }

      const row = await this.svc.getCrudById(id);
      if (!row) return res.status(404).json({ error: 'homologo_not_found' });

      res.json({ row });
    } catch (e: any) {
      res.status(500).json({ error: 'get_homologo_crud_failed', detail: e?.message });
    }
  };

  /** POST /api/homologos/crud */
  crearCrud = async (req: Request, res: Response) => {
    try {
      const clave = String(req.body?.clave ?? '').trim();
      const sustituto = String(req.body?.sustituto ?? '').trim();
      const factorRaw = req.body?.factor;

      if (!clave) return res.status(400).json({ error: 'missing_clave' });
      if (!sustituto) return res.status(400).json({ error: 'missing_sustituto' });
      if (factorRaw === undefined || factorRaw === null || String(factorRaw).trim() === '') {
        return res.status(400).json({ error: 'missing_factor' });
      }
      if (!Number.isFinite(Number(factorRaw))) {
        return res.status(400).json({ error: 'invalid_factor' });
      }

      const row = await this.svc.createCrud({
        clave,
        sustituto,
        factor: factorRaw,
      });
      res.status(201).json({ row });
    } catch (e: any) {
      res.status(500).json({ error: 'create_homologo_crud_failed', detail: e?.message });
    }
  };

  /** PUT /api/homologos/crud/:id */
  actualizarCrud = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid_id' });
      }

      const payload: {
        clave?: string;
        sustituto?: string;
        factor?: string | number;
      } = {};

      if (req.body?.clave !== undefined) {
        const clave = String(req.body.clave).trim();
        if (!clave) return res.status(400).json({ error: 'invalid_clave' });
        payload.clave = clave;
      }

      if (req.body?.sustituto !== undefined) {
        const sustituto = String(req.body.sustituto).trim();
        if (!sustituto) return res.status(400).json({ error: 'invalid_sustituto' });
        payload.sustituto = sustituto;
      }

      if (req.body?.factor !== undefined) {
        const factorRaw = req.body.factor;
        if (factorRaw === null || String(factorRaw).trim() === '' || !Number.isFinite(Number(factorRaw))) {
          return res.status(400).json({ error: 'invalid_factor' });
        }
        payload.factor = factorRaw;
      }

      const row = await this.svc.updateCrud(id, payload);
      if (!row) return res.status(404).json({ error: 'homologo_not_found' });

      res.json({ row });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('No hay campos para actualizar')) {
        return res.status(400).json({ error: 'no_fields_to_update' });
      }
      res.status(500).json({ error: 'update_homologo_crud_failed', detail: e?.message });
    }
  };

  /** DELETE /api/homologos/crud/:id */
  eliminarCrud = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'invalid_id' });
      }

      const ok = await this.svc.deleteCrud(id);
      if (!ok) return res.status(404).json({ error: 'homologo_not_found' });

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: 'delete_homologo_crud_failed', detail: e?.message });
    }
  };
}
