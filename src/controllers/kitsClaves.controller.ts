import { Request, Response } from 'express';
import KitsClavesService from "../services/kits-claves.service";

class KitsClavesController {

    private kitsClavesService;
    constructor() {
        this.kitsClavesService = new KitsClavesService();
    }

    async listByKit(req: Request, res: Response) {
        try {
            const kitId = parseInt(req.params.kitId, 10);
            if (!kitId) { res.status(400).json({ ok: false, msg: 'kitId requerido' }); }

            const rows = await this.kitsClavesService.listByKit(kitId);
            res.json({ ok: true, rows });
        } catch (error: any) {
            console.error('❌ Error en listByKit:', error);
            res.status(500).json({ error: 'Error al listar las claves del kit' });
        }
    }

    async addClave(req: Request, res: Response) {
        try {
            const kitId = parseInt(req.params.kitId, 10);
            const { clave, aplica } = req.body;
            if (!kitId || !clave) { res.status(400).json({ ok: false, msg: 'kitId/clave requeridos' }); }

            const row = await this.kitsClavesService.addClave(kitId, clave, aplica);
            res.json({ ok: true, clave: row });
        } catch (error: any) {
            console.error('❌ Error en addClave:', error);
            res.status(500).json({ error: 'Error al agregar la clave al kit' });
        }
    }

    async deleteClave(req: Request, res: Response) {
        try {
            const id = parseInt(req.params.id, 10);
            if (!id) { res.status(400).json({ ok: false, msg: 'id requerido' }); }

            const ok = await this.kitsClavesService.deleteClave(id);
            res.json({ ok: ok });
        } catch (error: any) {
            console.error('❌ Error en deleteClave:', error);
            res.status(500).json({ error: 'Error al eliminar la clave del kit' });
        }
    }

}

export default KitsClavesController;