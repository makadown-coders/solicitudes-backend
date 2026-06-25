import { Request, Response } from 'express';
import CatalogoClavesService from '../services/catalogo-claves.service';

export default class CatalogoClavesController {
  private service = new CatalogoClavesService();

  async reporte(_req: Request, res: Response): Promise<void> {
    try {
      const data = await this.service.obtenerReporte();
      res.json({ ok: true, ...data });
    } catch (error: any) {
      console.error('Error al generar reporte de catalogo de claves:', error);
      res.status(500).json({
        ok: false,
        error: 'catalogo_claves_reporte_failed',
        detail: error?.message,
      });
    }
  }
}
