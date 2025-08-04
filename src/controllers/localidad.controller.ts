import { Request, Response } from 'express';
import LocalidadService from '../services/localidad.service';

class LocalidadController {
  private service: LocalidadService;

  constructor() {
    this.service = new LocalidadService();
  }

  async getAll(_req: Request, res: Response) {
    try {
      const localidades = await this.service.getAll();
      res.json(localidades);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener localidades', error });
    }
  }

  async getByMunicipio(req: Request, res: Response) {
    try {
      const municipioId = parseInt(req.params.municipioId);
      const localidades = await this.service.getByMunicipio(municipioId);
      res.json(localidades);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener localidades por municipio', error });
    }
  }
}

export default LocalidadController;
