import { Request, Response } from 'express';
import IbOncoService from '../services/ib-onco.service';

class IbOncoController {
  private service: IbOncoService;

  constructor() {
    this.service = new IbOncoService();
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
      rows: data.rows,
    };
  }

  async unidades(_req: Request, res: Response): Promise<void> {
    try {
      const data = await this.service.obtenerUnidades();
      res.json({ ok: true, count: data.length, data });
    } catch (error: any) {
      console.error('Error al obtener unidades IB-ONCO:', error);
      res.status(500).json({ ok: false, error: 'ib_onco_unidades_failed', detail: error?.message });
    }
  }

  async claves(req: Request, res: Response): Promise<void> {
    try {
      const cluesimb = req.query.cluesimb ? String(req.query.cluesimb) : undefined;
      const data = await this.service.obtenerClaves(cluesimb);
      res.json({ ok: true, count: data.length, data });
    } catch (error: any) {
      console.error('Error al obtener claves IB-ONCO:', error);
      res.status(500).json({ ok: false, error: 'ib_onco_claves_failed', detail: error?.message });
    }
  }

  async abastoCpm(req: Request, res: Response): Promise<void> {
    try {
      const { cluesimb, clave_cnis, estado_abasto, search } = req.query as Record<string, string | undefined>;
      const data = await this.service.obtenerAbastoCpm({
        cluesimb,
        clave_cnis,
        estado_abasto,
        search,
        ...this.parsePagination(req),
      });

      res.json(this.paginatedResponse(data));
    } catch (error: any) {
      console.error('Error al obtener abasto CPM IB-ONCO:', error);
      res.status(500).json({ ok: false, error: 'ib_onco_abasto_cpm_failed', detail: error?.message });
    }
  }

  async citasPendientes(req: Request, res: Response): Promise<void> {
    try {
      const { cluesimb, clave_cnis } = req.query as Record<string, string | undefined>;
      const windowDays = req.query.window_days ? Number(req.query.window_days) : undefined;
      const data = await this.service.obtenerCitasPendientes({
        cluesimb,
        clave_cnis,
        window_days: windowDays,
        ...this.parsePagination(req),
      });

      res.json(this.paginatedResponse(data));
    } catch (error: any) {
      console.error('Error al obtener citas pendientes IB-ONCO:', error);
      res.status(500).json({ ok: false, error: 'ib_onco_citas_pendientes_failed', detail: error?.message });
    }
  }

  async resumen(req: Request, res: Response): Promise<void> {
    try {
      const windowDays = req.query.window_days ? Number(req.query.window_days) : undefined;
      const data = await this.service.obtenerResumen(windowDays);
      res.json({ ok: true, count: data.length, data });
    } catch (error: any) {
      console.error('Error al obtener resumen IB-ONCO:', error);
      res.status(500).json({ ok: false, error: 'ib_onco_resumen_failed', detail: error?.message });
    }
  }
}

export default IbOncoController;
