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
}

export default CpmController;