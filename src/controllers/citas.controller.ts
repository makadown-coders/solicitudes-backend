import { Request, Response } from 'express';
import CitasService from '../services/citas.service';
import { PaginationQuery } from '../models/PaginationQuery';

class CitasController {
  private citasService = new CitasService();

  async obtenerPaginado(req: Request, res: Response): Promise<void> {
    try {
      const query: PaginationQuery = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as 'ASC' | 'DESC',
        search: req.query.search as string
      };

      const result = await this.citasService.obtenerCitas(query);
      res.json(result);
    } catch (err: any) {
      console.error('Error en obtenerPaginado:', err.message);
      res.status(500).json({ error: 'Error al obtener citas' });
    }
  }
}

export default CitasController;
