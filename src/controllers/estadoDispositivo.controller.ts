// src/controllers/estadoDispositivo.controller.ts
import { Request, Response } from 'express';
import EstadoDispositivoService from '../services/estadoDispositivo.service';

export default class EstadoDispositivoController {
  private svc = new EstadoDispositivoService();
  getAll = async (_req: Request, res: Response) => {
    try { res.json(await this.svc.getAll()); }
    catch (e) { res.status(500).json({ message: 'Error al obtener estados de dispositivo' }); }
  };
}
