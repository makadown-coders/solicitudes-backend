// src/controllers/tipoDispositivo.controller.ts
import { Request, Response } from 'express';
import TipoDispositivoService from '../services/tipoDispositivo.service';

export default class TipoDispositivoController {
  private svc = new TipoDispositivoService();
  getAll = async (_req: Request, res: Response) => {
    try { res.json(await this.svc.getAll()); }
    catch (e) { res.status(500).json({ message: 'Error al obtener tipos de dispositivo' }); }
  };
}
