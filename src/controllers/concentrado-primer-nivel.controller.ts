import { Request, Response } from 'express';
import ConcentradoPrimerNivelService from '../services/concentrado-primer-nivel.service';

export default class ConcentradoPrimerNivelController {
  private readonly service = new ConcentradoPrimerNivelService();

  consultar = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.consultar({
        months: req.query.months, jurisdiccion: req.query.jurisdiccion,
        clues: req.query.clues, origen: req.query.origen,
        referencia: req.query.referencia, search: req.query.search,
        page: req.query.page, pageSize: req.query.pageSize,
      }));
    } catch (error: any) {
      console.error('Error consultando concentrado de Primer Nivel:', error);
      res.status(400).json({ ok: false, error: 'concentrado_primer_nivel_failed', detail: error?.message });
    }
  };

  exportar = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.consultar({
        months: req.query.months, jurisdiccion: req.query.jurisdiccion,
        clues: req.query.clues, origen: req.query.origen,
        referencia: req.query.referencia, search: req.query.search,
        page: 1, pageSize: 50000, export: true,
      }));
    } catch (error: any) {
      console.error('Error exportando concentrado de Primer Nivel:', error);
      res.status(400).json({ ok: false, error: 'exportar_concentrado_primer_nivel_failed', detail: error?.message });
    }
  };

  matrizDistribucion = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.matrizDistribucion(req.query.months));
    } catch (error: any) {
      console.error('Error generando matriz de distribución de Primer Nivel:', error);
      res.status(400).json({ ok: false, error: 'matriz_distribucion_primer_nivel_failed', detail: error?.message });
    }
  };
}
