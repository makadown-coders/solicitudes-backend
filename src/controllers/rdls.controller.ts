import { Request, Response } from 'express';
import RdlsService from '../services/rdls.service';

class RdlsController {
  private service = new RdlsService();

  salidasExterior = async (req: Request, res: Response): Promise<void> => {
    try {
      const { desde, hasta, ventanaDias, limit, cursor } = req.query as any;
      if (!desde || !hasta) {
        res.status(400).json({ error: 'Parámetros requeridos: desde, hasta (YYYY-MM-DD)' });
        return;
      }

      let cursorFecha: string | null = null;
      let cursorId: number | null = null;
      if (cursor) {
        const [f, i] = String(cursor).split(',');
        cursorFecha = f || null;
        cursorId = i ? Number(i) : null;
      }

      const result = await this.service.salidasExteriorPorRango({
        desde: String(desde),
        hasta: String(hasta),
        ventanaDias: ventanaDias ? Number(ventanaDias) : undefined,
        limit: limit ? Number(limit) : undefined,
        cursorFecha,
        cursorId
      });

      res.json(result);
    } catch (err) {
      console.error('Error /api/rdls/salidas-exterior:', err);
      res.status(500).json({ error: 'Error procesando solicitud' });
    }
  };
}

export default RdlsController;
