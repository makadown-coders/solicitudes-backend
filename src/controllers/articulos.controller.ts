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

  async buscarArticulosAll(req: Request, res: Response): Promise<void> {    

    try {
      const { resultados, total } = await this.articulosService.buscarAll();
      res.json({ resultados, total });
    } catch (error: any) {
      console.error('Error al buscar artículos:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }

  async listarCrud(req: Request, res: Response): Promise<void> {
    try {
      const page = Math.max(Number(req.query.page ?? 1), 1);
      const pageSize = Math.min(Math.max(Number(req.query.pageSize ?? 20), 1), 100);
      const q = req.query.q ? String(req.query.q) : undefined;
      const sortBy = req.query.sortBy ? String(req.query.sortBy) : undefined;
      const sortOrder = req.query.sortOrder ? String(req.query.sortOrder) : undefined;

      const out = await this.articulosService.listCrudPaged({ page, pageSize, q, sortBy, sortOrder });
      res.json(out);
    } catch (error: any) {
      console.error('Error al listar articulos CRUD:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }

  async obtenerCrudById(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'id invalido' });
        return;
      }

      const out = await this.articulosService.getCrudById(id);
      if (!out) {
        res.status(404).json({ error: 'Articulo no encontrado' });
        return;
      }

      res.json(out);
    } catch (error: any) {
      console.error('Error al obtener articulo:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }

  async crearCrud(req: Request, res: Response): Promise<void> {
    try {
      const clave = String(req.body?.clave ?? '').trim();
      const descripcion = String(req.body?.descripcion ?? '').trim();
      const presentacionRaw = req.body?.presentacion;
      const presentacion = presentacionRaw == null ? null : String(presentacionRaw).trim();

      if (!clave) {
        res.status(400).json({ error: 'clave es requerida' });
        return;
      }

      if (!descripcion) {
        res.status(400).json({ error: 'descripcion es requerida' });
        return;
      }

      const out = await this.articulosService.createCrud({ clave, descripcion, presentacion });
      res.status(201).json(out);
    } catch (error: any) {
      console.error('Error al crear articulo:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }

  async actualizarCrud(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'id invalido' });
        return;
      }

      const payload: {
        clave?: string;
        descripcion?: string;
        presentacion?: string | null;
      } = {};

      if (req.body?.clave !== undefined) {
        payload.clave = String(req.body.clave).trim();
      }
      if (req.body?.descripcion !== undefined) {
        payload.descripcion = String(req.body.descripcion).trim();
      }
      if (req.body?.presentacion !== undefined) {
        payload.presentacion = req.body.presentacion == null ? null : String(req.body.presentacion).trim();
      }

      if (payload.clave !== undefined && !payload.clave) {
        res.status(400).json({ error: 'clave no puede ir vacia' });
        return;
      }
      if (payload.descripcion !== undefined && !payload.descripcion) {
        res.status(400).json({ error: 'descripcion no puede ir vacia' });
        return;
      }

      const out = await this.articulosService.updateCrud(id, payload);
      if (!out) {
        res.status(404).json({ error: 'Articulo no encontrado' });
        return;
      }

      res.json(out);
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg.includes('No hay campos para actualizar')) {
        res.status(400).json({ error: msg });
        return;
      }
      console.error('Error al actualizar articulo:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }

  async eliminarCrud(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'id invalido' });
        return;
      }

      const ok = await this.articulosService.deleteCrud(id);
      if (!ok) {
        res.status(404).json({ error: 'Articulo no encontrado' });
        return;
      }

      res.json({ ok: true });
    } catch (error: any) {
      console.error('Error al eliminar articulo:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }

  async reporteCrudResumen(req: Request, res: Response): Promise<void> {
    try {
      const q = req.query.q ? String(req.query.q) : undefined;
      const out = await this.articulosService.getCrudReportSummary(q);
      res.json(out);
    } catch (error: any) {
      console.error('Error al generar reporte de articulos:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }
}

export default ArticulosController;
