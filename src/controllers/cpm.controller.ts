import type { RequestHandler } from 'express';
import { Request, Response } from 'express';
import CpmService from "../services/cpm.service";

class CpmController {
  private service: CpmService;
  constructor() {
    this.service = new CpmService();
  }

  /**
   * (TEST) Regresa el Cpm de Power Automate en formato base64
   * @param req 
   * @param res 
   */
  async obtenerDesdePowerAutomate64(req: Request, res: Response): Promise<void> {
    try {
      const cpms = await this.service.obtenerCpmDePowerAutomate64();
      res.json({ cpms });
    } catch (error: any) {
      console.error('❌ Error en obtenerDesdePowerAutomate64:', error);
      res.status(500).json({ error: 'Error al obtener cpms' });
    }
  }

  /** GET /api/cpms/expected-vs?cluesimb=...&cluessa=...&kit=KIT_147&clave=010...&limit=...&offset=... */
  expectedVs: RequestHandler = async (req, res) => {
    try {
      const { cluesimb, cluessa, kit, clave } = req.query as Record<string, string | undefined>;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;

      const data = await this.service.getExpectedVsCpm({ cluesimb, cluessa, kit, clave, limit, offset });
      res.json({ count: data.length, rows: data });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };

  /** 
   * GET /api/cpms/by-unidad?cluesimb=... | /api/cpms/by-unidad?cluessa=...  (sólo cpm>0) 
   * */
  byUnidadGt0: RequestHandler = async (req, res) => {
    try {
      const { cluesimb, cluessa } = req.query as Record<string, string | undefined>;
      const data = await this.service.getUnidadCpmGt0({ cluesimb, cluessa });
      res.json({ count: data.length, rows: data });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };

  /** GET /api/cpms/by-unidad-all?cluesimb=... | ?cluessa=...  (incluye cpm=0) */
  byUnidadAll: RequestHandler = async (req, res) => {
    try {
      const { cluesimb, cluessa } = req.query as Record<string, string | undefined>;
      const rows = await this.service.getUnidadCpmAll({ cluesimb, cluessa });
      res.json({ count: rows.length, rows });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };

  byUnidadRealAll: RequestHandler = async (req, res) => {
    try {
      const { cluesimb, cluessa } = req.query as Record<string, string | undefined>;
      const rows = await this.service.getUnidadCpmRealAll({ cluesimb, cluessa });
      res.json({ count: rows.length, rows });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };

  /** PATCH /api/cpms  body: { um: string, clave: string, cpm: number, fuente?: string } */
  upsertOne: RequestHandler = async (req, res): Promise<void> => {
    try {
      const { um, clave, cpm, fuente } = req.body ?? {};
      if (!um || !clave || cpm === undefined || cpm === null) {
        res.status(400).json({ error: 'um, clave y cpm son requeridos' });
        return;
      }
      await this.service.upsertOne(um, clave, cpm, fuente);
      res.json({ ok: true });
      return;
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Bad request' });
      return;
    }
  };

  /** POST /api/cpms/batch  body: { um: string, items: [{clave, cpm, fuente?}] } */
  upsertBatch: RequestHandler = async (req, res) => {
    try {
      const { um, items } = req.body || {};
      const count = await this.service.upsertBatch(um, items);
      res.json({ ok: true, count });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };

  initCluesCpmReset: RequestHandler = async (req, res) => {
    try {
      const { cluesimb } = req.query as Record<string, string | undefined>;
      const { ok, deletedRows } = await this.service.initCluesCpmReset(cluesimb!);
      res.json({ ok, deletedRows });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };

  /** GET /api/cpms/rutas-salud-claves?kits=KIT_180,KIT_96,... */
  rutasSaludClaves: RequestHandler = async (req, res) => {
    try {
      const kitsParam = (req.query.kits as string | undefined) ?? '';
      const kits = kitsParam
        ? kitsParam.split(',').map(k => k.trim()).filter(Boolean)
        : undefined;

      const claves = await this.service.getRutasSaludClaves(kits);
      res.json({ count: claves.length, claves });
    } catch (e: any) {
      console.error('Error en rutasSaludClaves:', e);
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };
}

export default CpmController;