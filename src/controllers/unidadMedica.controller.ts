import { Request, Response } from 'express';
import UnidadMedicaService from '../services/unidadMedica.service';

class UnidadMedicaController {
  private service: UnidadMedicaService;

  constructor() {
    this.service = new UnidadMedicaService();
  }

  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const unidades = await this.service.getAll();
      res.json(unidades);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener unidades médicas', error });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const unidad = await this.service.getById(parseInt(req.params.id));
      if (!unidad) {
        res.status(404).json({ message: 'Unidad no encontrada' });
        return;
      }
      res.json(unidad);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener unidad', error });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const nuevaUnidad = await this.service.create(req.body);
      res.status(201).json(nuevaUnidad);
    } catch (error) {
      res.status(500).json({ message: 'Error al crear unidad médica', error });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const unidadActualizada = await this.service.update(parseInt(req.params.id), req.body);
      res.json(unidadActualizada);
    } catch (error) {
      res.status(500).json({ message: 'Error al actualizar unidad', error });
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      await this.service.delete(parseInt(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: 'Error al eliminar unidad', error });
    }
  }

  async getPrimerNivel(req: Request, res: Response): Promise<void> {
    try {
      const unidadesPrimerNivel = await this.service.getPrimerNivel();
      res.json(unidadesPrimerNivel);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener unidades de primer nivel', error });
    }
  }

  async getAllNiveles(req: Request, res: Response): Promise<void> {
    try {
      const todasUnidades = await this.service.getAllNiveles();
      res.json(todasUnidades);
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener todas las unidades', error });
    }
  }
}

export default UnidadMedicaController;
