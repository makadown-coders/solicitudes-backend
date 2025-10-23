// src/controllers/tipoPeriferico.controller.ts
import { Request, Response } from 'express';
import TipoPerifericoService from '../services/tipoPeriferico.service';

export default class TipoPerifericoController {
    private svc = new TipoPerifericoService();
    getAll = async (_req: Request, res: Response) => {
        try { res.json(await this.svc.getAll()); }
        catch (e) { res.status(500).json({ message: 'Error al obtener tipos de periférico' }); }
    }
}
