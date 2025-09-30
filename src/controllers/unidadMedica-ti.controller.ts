// src/controllers/unidadMedica-ti.controller.ts
import { Request, Response } from 'express';
import UnidadMedicaService from '../services/unidadMedica.service';

class UnidadMedicaTIController {
  private svc: UnidadMedicaService;

  constructor() {
    this.svc = new UnidadMedicaService();
  }

  search = async (req: Request, res: Response) => {
    try {
      const out = await this.svc.searchForTI({
        tipo_unidad_id:  req.query.tipo_unidad_id ? Number(req.query.tipo_unidad_id) : null,
        municipio_id:    req.query.municipio_id ? Number(req.query.municipio_id) : null,
        localidad_id:    req.query.localidad_id ? Number(req.query.localidad_id) : null,
        q:               req.query.q ? String(req.query.q) : null,
        page:            req.query.page ? Number(req.query.page) : 1,
        pageSize:        req.query.pageSize ? Number(req.query.pageSize) : 20
      });
      res.json(out);
    } catch (e) {
      res.status(500).json({ message: 'Error al buscar unidades médicas' });
    }
  };
}

export default UnidadMedicaTIController;
