// src/controllers/articulos.controller.ts
import { Request, Response } from 'express';
import ArticulosService from '../services/articulos.service';

class ArticulosController {
  private articulosService: ArticulosService;

  constructor() {
    this.articulosService = new ArticulosService();
  }

  async buscarArticulos(req: Request, res: Response): Promise<void> {
    const q = (req.query.q as string) ?? '';

    if (q.length < 3) {
      res.status(400).json({ error: 'Query demasiado corta' });
      return;
    }

    try {
      const { resultados, total } = await this.articulosService.buscar(q);
      res.json({ resultados, total });
    } catch (error: any) {
      console.error('Error al buscar artículos:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }
}

export default ArticulosController;