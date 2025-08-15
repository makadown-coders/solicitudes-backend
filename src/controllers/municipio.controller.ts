import { Request, Response } from 'express';
import MunicipioService from '../services/municipio.service';

class MunicipioController {
  private service: MunicipioService;

  constructor() {
    this.service = new MunicipioService();
  }

  async getAll(_req: Request, res: Response) {
    try {
      const municipios = await this.service.getAll();
      res.json(municipios);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener municipios', error });
    }
  }
}

export default MunicipioController;
