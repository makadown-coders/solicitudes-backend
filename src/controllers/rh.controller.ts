import type { Response } from 'express';
import type { RhAuthenticatedRequest } from '../auth/requireRhAccess';
import RhService from '../services/rh.service';

export default class RhController {
  private readonly service = new RhService();

  async unidadesAutorizadas(req: RhAuthenticatedRequest, res: Response): Promise<void> {
    if (!req.rhAccess) {
      res.status(403).json({ error: 'Permiso insuficiente' });
      return;
    }

    try {
      const result = await this.service.getUnidadesAutorizadas(req.rhAccess);
      res.status(200).json(result);
    } catch (err) {
      console.error('Error en GET /api/rh/unidades-autorizadas:', err);
      res.status(500).json({ error: 'Error interno al consultar unidades autorizadas de RH' });
    }
  }
}
