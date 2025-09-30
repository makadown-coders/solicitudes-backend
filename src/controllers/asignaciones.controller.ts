// src/controllers/asignaciones.controller.ts

import { Request, Response } from 'express';
import AsignacionesService from '../services/asignaciones.service';

export default class AsignacionesController {
  private svc = new AsignacionesService();

  historial = async (req: Request, res: Response) => {
    try { res.json(await this.svc.historialPorDispositivo(Number(req.params.id))); }
    catch { res.status(500).json({ message: 'Error al obtener historial' }); }
  };

  crear = async (req: Request, res: Response) => {
    try { res.status(201).json(await this.svc.crear(Number(req.params.id), req.body)); }
    catch (e: any) { res.status(400).json({ error: e?.message || 'Error al crear asignación' }); }
  };
}
