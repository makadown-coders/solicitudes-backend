import { Request, Response } from 'express';
import { KitMatrixRow } from "../models/kit-matrix";
import KitsService from "../services/kits.service";

export default class KitsBulkController {
    private svc = new KitsService();

    async importMatrix(req: Request, res: Response): Promise<void> {
        try {
            const { rows } = req.body as { rows: KitMatrixRow[] };

            if (!rows || !Array.isArray(rows) || rows.length === 0) {
                res.status(400).json({ ok: false, message: 'Body inválido o sin filas' });
                return;
            }

            const result = await this.svc.bulkUpsertFromMatrix(rows);
            res.json({ ok: true, ...result });
        } catch (err) {
            console.error('Error en KitsBulkController.importMatrix:', err);
            res.status(500).json({ ok: false, message: 'Error interno al importar matriz de kits' });
        }
    }

    async importSingle(req: Request, res: Response): Promise<void> {
        try {
            const { codigo, claves } = req.body as { codigo: string; claves: string[] };

            const result = await this.svc.upsertSingleKit({ codigo, claves });
            res.json(result);
        } catch (err) {
            console.error('Error en KitsBulkSingleController.importSingle:', err);
            res.status(500).json({ ok: false, message: 'Error interno al importar kit' });
        }
    }
}
