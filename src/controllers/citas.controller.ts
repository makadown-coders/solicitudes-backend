// src/controllers/citas.controller.ts
import { Request, Response } from 'express';
import CitasService from '../services/citas.service';
import { CitaSlimInventario } from '../models/CitaSlimInventario';

class CitasController {
  private citasService = new CitasService();
  init = async (req: Request, res: Response) => {
    try {
      const reset = String(req.query.reset ?? 'true') === 'true';
      const out = await this.citasService.init(reset);
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: 'init_failed', detail: e?.message });
    }
  };

  batch = async (req: Request, res: Response) => {
    try {
      const rows = req.body?.rows ?? [];
      const out = await this.citasService.batch(rows);
      res.json(out);
    } catch (e: any) {
      console.error('Error al insertar batch de citas');
      console.error(e);
      res.status(500).json({ error: 'batch_failed', detail: e?.message });
    }
  };

  async search(req: Request, res: Response) {
    try {
      const out = await this.citasService.search(req.query);
      res.json(out);
    } catch (e: any) {
      console.error('GET /citas error:', e);
      res.status(500).json({ error: 'search_failed', detail: e?.message });
    }
  }

  async obtenerXClave(req: Request, res: Response) {
    try {
      const out = await this.citasService.obtenerXClave(req.query);
      res.json(out);
    } catch (err: any) {
      console.error('GET /citas/xclave error:', err?.message, err?.stack);
      res.status(500).json({ ok: false, error: 'xclave_failed', message: err?.message });
    }
  }

  async statsResumen(req: Request, res: Response) {
    try {
      const out = await this.citasService.statsResumen(req.query);
      res.json(out);
    } catch (e: any) {
      console.error('GET /citas/stats/resumen error:', e);
      res.status(500).json({ error: 'stats_failed', detail: e?.message });
    }
  }

  // 🔹 NUEVO: /stats/proveedores
  async statsProveedores(req: Request, res: Response) {
    try {
      const out = await this.citasService.statsProveedores(req.query);
      res.json(out);
    } catch (e: any) {
      console.error('GET /citas/stats/proveedores error:', e);
      res.status(500).json({ error: 'stats_failed', detail: e?.message });
    }
  }

  // 🔹 NUEVO: /stats/cumplimiento-claves
  async statsCumplimientoClaves(req: Request, res: Response) {
    try {
      const out = await this.citasService.statsCumplimientoClaves(req.query);
      res.json(out);
    } catch (e: any) {
      console.error('GET /citas/stats/cumplimiento-claves error:', e);
      res.status(500).json({ error: 'stats_failed', detail: e?.message });
    }
  }

  async refreshMaterializedViews(req: Request, res: Response) {
    try {
      // (Opcional) llavero simple via header
      const key = req.headers['x-admin-key'];
      const expected = process.env.ADMIN_KEY?.trim();
      if (expected && key !== expected) {
        return res.status(401).json({ error: 'unauthorized' });
      }

      const out = await this.citasService.refreshMaterializedViews();
      res.json(out);
    } catch (e: any) {
      console.error('POST /citas/stats/refresh-mv error:', e);
      res.status(500).json({ error: 'refresh_failed', detail: e?.message });
    }
  }

  /**
   * En vias de deprecación!
   * Regresa todas las citas de Power Automate en formato base64.
   * Unico método activo para obtener las citas del archivo excel del
   * heróico cuerpo del Abasto.
   * @param req 
   * @param res 
   */
  async obtenerDesdePowerAutomate64(req: Request, res: Response): Promise<void> {
    try {
      const citas = await this.citasService.obtenerCitasDePowerAutomate64();
      res.json({ citas });
    } catch (error: any) {
      console.error('❌ Error en obtenerDesdePowerAutomate64:', error);
      res.status(500).json({ error: 'Error al obtener citas' });
    }
  }

  /**
   * Regresa un 
   * @returns { data: { ok: boolean , total: number, rows: CitaSlimInventario[] } }
   * @param req 
   * @param res 
   */
  async getSlimParaExistencias(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.citasService.getSlimParaExistencias();
      res.json({ data });
    } catch (error: any) {
      console.error('❌ Error en getSlimParaExistencias:', error);
      res.status(500).json({ error: 'Error al obtener citas slim para existencias' });
    }
  }
}

export default CitasController;
