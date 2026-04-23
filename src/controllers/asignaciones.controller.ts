import { Request, Response } from 'express';
import AsignacionesService from '../services/asignaciones.service';
import { parseIntSafe, parseISOorNull } from '../helpers/helper';

export default class AsignacionesController {
  private svc = new AsignacionesService();

  historial = async (req: Request, res: Response): Promise<void> => {
    try {
      const dispositivo_id = Number(req.params.id);
      if (!Number.isFinite(dispositivo_id)) {
        res.status(400).json({ message: 'id inválido' });
        return;
      }

      const page = Math.max(parseIntSafe(req.query.page, 1), 1);
      const pageSize = Math.min(Math.max(parseIntSafe(req.query.pageSize, 10), 1), 100);

      const from = parseISOorNull(req.query.from);
      const to = parseISOorNull(req.query.to);

      res.json(await this.svc.historialPorDispositivoPaged({ dispositivo_id, from, to, page, pageSize }));
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Error al obtener historial' });
    }
  };

  crear = async (req: Request, res: Response): Promise<void> => {
    try {
      const dispositivo_id = Number(req.params.id);
      const creado_por = (req as any)?.user?.email || (req as any)?.user?.nombre || null;
      res.status(201).json(await this.svc.crear(dispositivo_id, req.body, creado_por));
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Error al crear asignación' });
    }
  };

  revert = async (req: Request, res: Response): Promise<void> => {
    try {
      const dispositivo_id = Number(req.params.id);
      const asignacion_id = Number(req.params.asignacionId);
      if (!Number.isFinite(dispositivo_id) || !Number.isFinite(asignacion_id)) {
        res.status(400).json({ message: 'Parámetros inválidos' });
        return;
      }

      const creado_por = (req as any)?.user?.email || (req as any)?.user?.nombre || null;

      const out = await this.svc.revertir({ dispositivo_id, asignacion_id, creado_por });
      res.status(201).json(out);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('NOT_FOUND')) {
        res.status(404).json({ message: 'Asignación no encontrada' });
        return;
      }
      console.error(e);
      res.status(500).json({ message: 'Error al revertir' });
    }
  };
}
