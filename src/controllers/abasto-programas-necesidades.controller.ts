import { Request, Response } from 'express';
import AbastoProgramasNecesidadesService from '../services/abasto-programas-necesidades.service';

export default class AbastoProgramasNecesidadesController {
  private readonly service = new AbastoProgramasNecesidadesService();

  consultar = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.service.consultar({
        modalidad: req.query.modalidad,
        mes: req.query.mes,
        desde: req.query.desde,
        jurisdiccion: req.query.jurisdiccion,
        municipio: req.query.municipio,
        clues: req.query.clues,
        vertiente: req.query.vertiente,
        programa: req.query.programa,
        azmDesde: req.query.azmDesde,
        azmHasta: req.query.azmHasta,
        aztDesde: req.query.aztDesde,
        aztHasta: req.query.aztHasta,
        azeDesde: req.query.azeDesde,
        azeHasta: req.query.azeHasta,
        page: req.query.page,
        pageSize: req.query.pageSize,
      }));
    } catch (error: any) {
      console.error('Error consultando necesidades de Abasto por Programas:', error);
      const status = error instanceof RangeError ? 400 : 500;
      res.status(status).json({
        ok: false,
        error: 'necesidades_abasto_programas_failed',
        detail: status === 400 ? error.message : 'No fue posible consultar las necesidades programáticas.',
      });
    }
  };
}
