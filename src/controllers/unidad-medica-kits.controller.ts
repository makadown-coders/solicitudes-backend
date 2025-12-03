import { Request, Response } from 'express';
import UnidadMedicaKitsService from "../services/unidad-medica-kits.service";

class UnidadMedicaKitsController {
    private service: UnidadMedicaKitsService;
    constructor() {
        this.service = new UnidadMedicaKitsService();
    }

    // GET /api/kits/:kitId/unidades
    async getUnidadesByKit(req: Request, res: Response) {
        try {
            const kitId = parseInt(req.params.kitId, 10);
            if (!kitId) {
                return res.status(400).json({ ok: false, msg: 'kitId requerido' });
            }

            const unidades = await this.service.getUnidadesByKit(kitId);
            res.json({ ok: true, unidades });
        } catch (error: any) {
            console.error('❌ Error en getUnidadesByKit:', error);
            res.status(500).json({ error: 'Error al obtener las unidades del kit' });
        }
    }

    // PUT /api/kits/:kitId/unidades
    async setUnidadesByKitUsingClues(req: Request, res: Response) {
        try {
            const kitId = parseInt(req.params.kitId, 10);
            const { cluesimb } = req.body as { cluesimb: string[] };

            if (!kitId) return res.status(400).json({ ok: false, msg: 'kitId requerido' });
            if (!Array.isArray(cluesimb)) {
                return res.status(400).json({ ok: false, msg: 'cluesimb debe ser un arreglo' });
            }

            await this.service.setUnidadesByKitUsingClues(kitId, cluesimb);
            res.json({ ok: true });
        } catch (error: any) {
            console.error('❌ Error en setUnidadesByKitUsingClues:', error);
            res.status(500).json({ error: 'Error al actualizar las unidades del kit' });
        }
    }

    // GET /api/unidades-kits/:unidadId/kits
    async getKitsByUnidad(req: Request, res: Response) {
        try {
            const unidadId = parseInt(req.params.unidadId, 10);
            if (!unidadId) {
                return res.status(400).json({ ok: false, msg: 'unidadId requerido' });
            }

            const kits = await this.service.getKitsByUnidad(unidadId);
            res.json({ ok: true, kits });
        } catch (error: any) {
            console.error('❌ Error en getKitsByUnidad:', error);
        }
    }
}

export default UnidadMedicaKitsController;