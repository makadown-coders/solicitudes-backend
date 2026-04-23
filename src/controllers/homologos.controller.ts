import { Request, Response } from 'express';
import HomologosService from '../services/homologos.service';

class HomologosController {
  private svc: HomologosService;
  constructor() {
    this.svc = new HomologosService();
  }

  /** GET /api/homologos?clave=... */
  getByClave = async (req: Request, res: Response): Promise<void> => {
    try {
      const clave = String(req.query.clave || '').trim().toUpperCase();
      if (!clave) {
        res.status(400).json({ error: 'missing_clave' });
        return;
      }

      const rows = await this.svc.getByClave(clave);
      res.json({ rows });
    } catch (e: any) {
      res.status(500).json({ error: 'get_homologos_failed', detail: e?.message });
    }
  };

  /** POST /api/homologos/batch  { claves: [...] } */
  batch = async (req: Request, res: Response): Promise<void> => {
    try {
      const claves = (req.body?.claves ?? []) as string[];
      const rows = await this.svc.batch(claves);
      res.json({ rows });
    } catch (e: any) {
      res.status(500).json({ error: 'batch_homologos_failed', detail: e?.message });
    }
  };

  /** POST /api/homologos/batch-forward  { claves: [...] } */
  batchForward = async (req: Request, res: Response): Promise<void> => {
    try {
      const claves = (req.body?.claves ?? []) as string[];
      const rows = await this.svc.batchForward(claves);
      res.json({ rows });
    } catch (e: any) {
      res.status(500).json({ error: 'batch_forward_homologos_failed', detail: e?.message });
    }
  };

  /** GET /api/homologos/crud */
  listarCrud = async (_req: Request, res: Response): Promise<void> => {
    try {
      const rows = await this.svc.listCrud();
      res.json({ rows });
    } catch (e: any) {
      res.status(500).json({ error: 'list_homologos_crud_failed', detail: e?.message });
    }
  };

  /** GET /api/homologos/crud/:id */
  obtenerCrudById = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }

      const row = await this.svc.getCrudById(id);
      if (!row) {
        res.status(404).json({ error: 'homologo_not_found' });
        return;
      }

      res.json({ row });
    } catch (e: any) {
      res.status(500).json({ error: 'get_homologo_crud_failed', detail: e?.message });
    }
  };

  /** POST /api/homologos/crud */
  crearCrud = async (req: Request, res: Response): Promise<void> => {
    try {
      const clave = String(req.body?.clave ?? '').trim();
      const sustituto = String(req.body?.sustituto ?? '').trim();
      const factorRaw = req.body?.factor;

      if (!clave) {
        res.status(400).json({ error: 'missing_clave' });
        return;
      }
      if (!sustituto) {
        res.status(400).json({ error: 'missing_sustituto' });
        return;
      }
      if (factorRaw === undefined || factorRaw === null || String(factorRaw).trim() === '') {
        res.status(400).json({ error: 'missing_factor' });
        return;
      }
      if (!Number.isFinite(Number(factorRaw))) {
        res.status(400).json({ error: 'invalid_factor' });
        return;
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
  actualizarCrud = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }

      const payload: {
        clave?: string;
        sustituto?: string;
        factor?: string | number;
      } = {};

      if (req.body?.clave !== undefined) {
        const clave = String(req.body.clave).trim();
        if (!clave) {
          res.status(400).json({ error: 'invalid_clave' });
          return;
        }
        payload.clave = clave;
      }

      if (req.body?.sustituto !== undefined) {
        const sustituto = String(req.body.sustituto).trim();
        if (!sustituto) {
          res.status(400).json({ error: 'invalid_sustituto' });
          return;
        }
        payload.sustituto = sustituto;
      }

      if (req.body?.factor !== undefined) {
        const factorRaw = req.body.factor;
        if (factorRaw === null || String(factorRaw).trim() === '' || !Number.isFinite(Number(factorRaw))) {
          res.status(400).json({ error: 'invalid_factor' });
          return;
        }
        payload.factor = factorRaw;
      }

      const row = await this.svc.updateCrud(id, payload);
      if (!row) {
        res.status(404).json({ error: 'homologo_not_found' });
        return;
      }

      res.json({ row });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('No hay campos para actualizar')) {
        res.status(400).json({ error: 'no_fields_to_update' });
        return;
      }
      res.status(500).json({ error: 'update_homologo_crud_failed', detail: e?.message });
    }
  };

  /** DELETE /api/homologos/crud/:id */
  eliminarCrud = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'invalid_id' });
        return;
      }

      const ok = await this.svc.deleteCrud(id);
      if (!ok) {
        res.status(404).json({ error: 'homologo_not_found' });
        return;
      }

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: 'delete_homologo_crud_failed', detail: e?.message });
    }
  };
}

export default HomologosController;
