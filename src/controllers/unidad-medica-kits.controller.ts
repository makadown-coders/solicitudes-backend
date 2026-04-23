import { Request, Response } from 'express';
import UnidadMedicaKitsService from "../services/unidad-medica-kits.service";

class UnidadMedicaKitsController {
    private service: UnidadMedicaKitsService;

    constructor() {
        this.service = new UnidadMedicaKitsService();
    }

    async getUnidadesByKit(req: Request, res: Response): Promise<void> {
        try {
            const kitId = parseInt(req.params.kitId, 10);
            if (!kitId) {
                res.status(400).json({ ok: false, msg: 'kitId requerido' });
                return;
            }

            const rows = await this.service.getUnidadesByKit(kitId);
            res.json({ ok: true, rows });
        } catch (error: any) {
            console.error('Error en getUnidadesByKit:', error);
            res.status(500).json({ error: 'Error al obtener las unidades del kit' });
        }
    }

    async setUnidadesByKitUsingClues(req: Request, res: Response): Promise<void> {
        try {
            const kitId = parseInt(req.params.kitId, 10);
            const { cluesimb } = req.body as { cluesimb: string[] };

            if (!kitId) {
                res.status(400).json({ ok: false, msg: 'kitId requerido' });
                return;
            }
            if (!Array.isArray(cluesimb)) {
                res.status(400).json({ ok: false, msg: 'cluesimb debe ser un arreglo' });
                return;
            }

            await this.service.setUnidadesByKitUsingClues(kitId, cluesimb);
            res.json({ ok: true });
        } catch (error: any) {
            console.error('Error en setUnidadesByKitUsingClues:', error);
            res.status(500).json({ error: 'Error al actualizar las unidades del kit' });
        }
    }

    async getKitsByUnidad(req: Request, res: Response): Promise<void> {
        try {
            const unidadId = parseInt(req.params.unidadId, 10);
            if (!unidadId) {
                res.status(400).json({ ok: false, msg: 'unidadId requerido' });
                return;
            }

            const rows = await this.service.getKitsByUnidad(unidadId);
            res.json({ ok: true, rows });
        } catch (error: any) {
            console.error('Error en getKitsByUnidad:', error);
            res.status(500).json({ error: 'Error al obtener los kits de la unidad' });
        }
    }
}

export default UnidadMedicaKitsController;
