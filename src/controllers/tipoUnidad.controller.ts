import { Request, Response } from 'express';
import TipoUnidadService from '../services/tipoUnidad.service';

class TipoUnidadController {
  private service: TipoUnidadService;

  constructor() {
    this.service = new TipoUnidadService();
  }

  async getAll(_req: Request, res: Response) {
    try {
      const tipos = await this.service.getAll();
      res.json(tipos);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener tipos de unidad', error });
    }
  }
}

export default TipoUnidadController;
