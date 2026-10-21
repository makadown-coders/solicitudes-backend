import { Request, Response } from 'express';
import NecesidadesPrimerNivelApsService from '../services/necesidades-primer-nivel-aps.service';

export class NecesidadesPrimerNivelApsController {
  constructor(private readonly service = new NecesidadesPrimerNivelApsService()) {}

  async getEstructura(_req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json(await this.service.obtenerEstructura());
    } catch (error: any) {
      console.error('Error consultando estructura APS:', error);
      res.status(500).json({ ok: false, error: 'No se pudo consultar la estructura APS' });
    }
  }

  async getMedicamentos(req: Request, res: Response): Promise<void> {
    try {
      const grupoRaw = req.query.grupo;
      const resultado = await this.service.listarMedicamentos({
        q: String(req.query.q ?? ''),
        grupo: grupoRaw === undefined ? undefined : Number(grupoRaw),
        eje: String(req.query.eje ?? ''),
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 30),
      });
      res.status(200).json(resultado);
    } catch (error: any) {
      res.status(400).json({ ok: false, error: error?.message ?? 'No se pudo consultar el catálogo APS' });
    }
  }

  async getMedicamento(req: Request, res: Response): Promise<void> {
    try {
      const resultado = await this.service.obtenerMedicamento(String(req.params.codigo ?? ''));
      if (!resultado) {
        res.status(404).json({ ok: false, error: 'Medicamento APS no encontrado' });
        return;
      }
      res.status(200).json(resultado);
    } catch (error: any) {
      res.status(400).json({ ok: false, error: error?.message ?? 'No se pudo consultar el medicamento APS' });
    }
  }

  async postResolver(req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json(await this.service.resolver(req.body ?? {}));
    } catch (error: any) {
      res.status(400).json({ ok: false, error: error?.message ?? 'No se pudieron resolver los medicamentos APS' });
    }
  }
}
