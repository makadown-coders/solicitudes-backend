import { RequestHandler } from 'express';
import { Request } from 'express';
import CpmDiferenciasService from '../services/cpm-diferencias.service';

class CpmDiferenciasController {
  private service: CpmDiferenciasService;

  constructor() {
    this.service = new CpmDiferenciasService();
  }

  private parsePagination(req: Request) {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;

    return { page, limit, offset };
  }

  private paginatedResponse(data: {
    rows: any[];
    total: number;
    page: number;
    limit: number;
    offset: number;
    totalPages: number;
  }) {
    return {
      count: data.rows.length,
      total: data.total,
      page: data.page,
      limit: data.limit,
      offset: data.offset,
      totalPages: data.totalPages,
      hasNextPage: data.page < data.totalPages,
      hasPrevPage: data.page > 1,
      rows: data.rows
    };
  }

  /**
   * GET /api/cpms-dif?cluesimb=...&observacion=...&search=...&page=...&limit=...&offset=...
   */
  diferencias: RequestHandler = async (req, res) => {
    try {
      const { cluesimb, observacion, search } = req.query as Record<string, string | undefined>;
      const { page, limit, offset } = this.parsePagination(req);

      const data = await this.service.getDiferencias({
        cluesimb,
        observacion,
        search,
        page,
        limit,
        offset
      });

      res.json(this.paginatedResponse(data));
    } catch (e: any) {
      console.error('❌ Error en diferencias:', e);
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };

  /**
   * GET /api/cpms-dif/resumen?page=...&limit=...&offset=...
   */
  resumen: RequestHandler = async (req, res) => {
    try {
      const { page, limit, offset } = this.parsePagination(req);
      const data = await this.service.getResumen({ page, limit, offset });
      res.json(this.paginatedResponse(data));
    } catch (e: any) {
      console.error('❌ Error en resumen:', e);
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };

  /**
   * GET /api/cpms-dif/indicadores
   */
  indicadores: RequestHandler = async (_req, res) => {
    try {
      const data = await this.service.getIndicadores();
      res.json(data);
    } catch (e: any) {
      console.error('Error en indicadores:', e);
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };

  /**
   * GET /api/cpms-dif/:cluesimb?search=...&page=...&limit=...&offset=...
   */
  byCluesimb: RequestHandler = async (req, res) => {
    try {
      const { cluesimb } = req.params;
      const search = req.query.search ? String(req.query.search) : undefined;
      const { page, limit, offset } = this.parsePagination(req);

      const data = await this.service.getDiferencias({
        cluesimb,
        search,
        page,
        limit,
        offset
      });

      res.json(this.paginatedResponse(data));
    } catch (e: any) {
      console.error('❌ Error en byCluesimb:', e);
      res.status(400).json({ error: e?.message || 'Bad request' });
    }
  };
}

export default CpmDiferenciasController;
