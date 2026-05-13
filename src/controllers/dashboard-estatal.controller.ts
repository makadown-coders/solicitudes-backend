import { Request, Response } from 'express';
import DashboardEstatalService from '../services/dashboard-estatal.service';

class DashboardEstatalController {
  private service: DashboardEstatalService;

  constructor() {
    this.service = new DashboardEstatalService();
  }

  async claves(req: Request, res: Response): Promise<void> {
    try {
      const search = req.query.search ? String(req.query.search) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const data = await this.service.buscarClaves(search, limit);

      res.json({ ok: true, count: data.length, data });
    } catch (error: any) {
      console.error('Error al buscar claves dashboard estatal:', error);
      res.status(500).json({ ok: false, error: 'dashboard_estatal_claves_failed', detail: error?.message });
    }
  }

  async resumenClave(req: Request, res: Response): Promise<void> {
    try {
      const claveCnis = req.query.clave_cnis ? String(req.query.clave_cnis) : '';
      if (!claveCnis.trim()) {
        res.status(400).json({ ok: false, error: 'clave_cnis_required' });
        return;
      }

      const windowDays = req.query.window_days ? Number(req.query.window_days) : undefined;
      const data = await this.service.obtenerResumenClave(claveCnis, windowDays);

      if (!data) {
        res.status(404).json({ ok: false, error: 'clave_cnis_not_found' });
        return;
      }

      res.json({ ok: true, data });
    } catch (error: any) {
      console.error('Error al obtener resumen dashboard estatal:', error);
      res.status(500).json({ ok: false, error: 'dashboard_estatal_resumen_clave_failed', detail: error?.message });
    }
  }

  async top(req: Request, res: Response): Promise<void> {
    try {
      const windowDays = req.query.window_days ? Number(req.query.window_days) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const data = await this.service.obtenerTop(windowDays, limit);

      res.json({ ok: true, data });
    } catch (error: any) {
      console.error('Error al obtener tops dashboard estatal:', error);
      res.status(500).json({ ok: false, error: 'dashboard_estatal_top_failed', detail: error?.message });
    }
  }

  async ordenesPendientes(req: Request, res: Response): Promise<void> {
    try {
      const claveCnis = req.query.clave_cnis ? String(req.query.clave_cnis) : '';
      if (!claveCnis.trim()) {
        res.status(400).json({ ok: false, error: 'clave_cnis_required' });
        return;
      }

      const windowDays = req.query.window_days ? Number(req.query.window_days) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const data = await this.service.obtenerOrdenesPendientes(claveCnis, windowDays, limit);

      res.json({ ok: true, count: data.length, data });
    } catch (error: any) {
      console.error('Error al obtener ordenes pendientes dashboard estatal:', error);
      res.status(500).json({ ok: false, error: 'dashboard_estatal_ordenes_pendientes_failed', detail: error?.message });
    }
  }
}

export default DashboardEstatalController;
