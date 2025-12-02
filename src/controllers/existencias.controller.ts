import { Request, Response } from 'express';
import ExistenciasService from '../services/existencias.service';

export default class ExistenciasController {
    private svc = new ExistenciasService();

    init = async (req: Request, res: Response) => {
        try {
            const reset = String(req.query.reset ?? 'true') === 'true';
            const out = await this.svc.init(reset);
            res.json(out);
        } catch (e: any) {
            res.status(500).json({ error: 'init_failed', detail: e?.message });
        }
    };

    batch = async (req: Request, res: Response) => {
        try {
            const rows = req.body?.rows ?? [];
            const out = await this.svc.batch(rows);
            console.log('Enviando batch de existencias exitosamente con', out.inserted, 'registros');
            res.json(out);
        } catch (e: any) {
            console.error('Error al insertar batch de existencias');
            console.error(e);
            res.status(500).json({ error: 'batch_failed', detail: e?.message });
        }
    };

    /** NUEVO: GET /api/existencias-temp/by-unidad?cluesimb=... */
    byUnidad = async (req: Request, res: Response) => {
        try {
            const cluesimb = String(req.query.cluesimb || '').trim().toUpperCase();
            if (!cluesimb) return res.status(400).json({ error: 'missing_cluesimb' });

            const rows = await this.svc.getByUnidad(cluesimb);
            res.json({ rows });
        } catch (e: any) {
            res.status(500).json({ error: 'by_unidad_failed', detail: e?.message });
        }
    };

    /** Opcional: saber si hay staging para la unidad */
    hasByUnidad = async (req: Request, res: Response) => {
        try {
            const cluesimb = String(req.query.cluesimb || '').trim().toUpperCase();
            if (!cluesimb) return res.status(400).json({ error: 'missing_cluesimb' });

            const ok = await this.svc.hasForUnidad(cluesimb);
            res.json({ has: ok });
        } catch (e: any) {
            res.status(500).json({ error: 'has_by_unidad_failed', detail: e?.message });
        }
    };

    /** NUEVO: GET /api/existencias-temp/by-unidad-full?cluesimb=... */
    getByUnidadFull = async (req: Request, res: Response) => {
        try {
            const cluesimb = String(req.query.cluesimb || '').trim().toUpperCase();
            if (!cluesimb) return res.status(400).json({ error: 'missing_cluesimb' });

            const rows = await this.svc.getByUnidadFull(cluesimb);
            res.json({ rows });
        } catch (e: any) {
            res.status(500).json({ error: 'get_by_unidad_full_failed', detail: e?.message });
        }
    };

    /** NUEVO: GET /api/existencias-temp/almacenes-full */
    getAlmacenesFull = async (req: Request, res: Response) => {
        try {
            // no necesita parametros 
            const rows = await this.svc.getAlmacenesFull();
            res.json({ rows });
        } catch (e: any) {
            res.status(500).json({ error: 'almacenes_full_failed', detail: e?.message });
        }
    };
}
