import { Request, Response } from 'express';
import SolicitudesService from "../services/solicitudes.service";

export class SolicitudesController {
    private service: SolicitudesService;

    constructor() {
        this.service = new SolicitudesService();
    }

    async postCrearBitacora(req: Request, res: Response) {
        try {
            const body = req.body ?? {};

            const result = await this.service.crearBitacora({
                cluesimb: body.cluesimb,
                tipoPedido: body.tipoPedido,
                tipoInsumo: body.tipoInsumo,
                periodo: body.periodo,
                articulos: body.articulos,
            });

            res.status(201).json({
                ok: true,
                solicitudId: result.solicitudId,
                deduped: !result.wasInserted,
                payloadHash: result.payloadHash,
            });
        } catch (err: any) {
            res.status(400).json({
                ok: false,
                error: err?.message ?? 'Error creando bitácora',
            });
        }
    }

    async getBitacora(req: Request, res: Response) {
        try {
            const desde = (req.query.desde ?? '').toString();
            const hasta = (req.query.hasta ?? '').toString();
            const cluesimb = (req.query.cluesimb ?? '').toString();

            const rows = await this.service.listarBitacora({ desde, hasta, cluesimb });
            res.status(200).json(rows);
        } catch (err: any) {
            res.status(400).json({
                ok: false,
                error: err?.message ?? 'Error consultando bitácora',
            });
        }
    }

    async getBitacoraDetalle(req: Request, res: Response) {
        try {
            const id = (req.params.id ?? '').toString();
            const rows = await this.service.getDetalleBitacora(id);
            res.status(200).json(rows);
        } catch (err: any) {
            res.status(400).json({
                ok: false,
                error: err?.message ?? 'Error consultando detalle',
            });
        }
    }

    async getMovimientos(req: Request, res: Response) {
        try {
            const cluesimb = (req.query.cluesimb ?? '').toString();
            const desde = (req.query.desde ?? '').toString();
            const hasta = (req.query.hasta ?? '').toString();
            const clave = (req.query.clave ?? '').toString();
            const tipo = (req.query.tipo ?? '').toString() as any;

            const rows = await this.service.listarMovimientos({ cluesimb, desde, hasta, clave, tipo });
            res.status(200).json(rows);
        } catch (err: any) {
            res.status(400).json({ ok: false, error: err?.message ?? 'Error consultando movimientos' });
        }
    }

    async getMovimientosResumen(req: Request, res: Response) {
        try {
            const cluesimb = (req.query.cluesimb ?? '').toString();
            const desde = (req.query.desde ?? '').toString();
            const hasta = (req.query.hasta ?? '').toString();
            const clave = (req.query.clave ?? '').toString();
            const tipo = (req.query.tipo ?? '').toString() as any;

            const rows = await this.service.resumenMovimientos({ cluesimb, desde, hasta, clave, tipo });
            res.status(200).json(rows);
        } catch (err: any) {
            res.status(400).json({ ok: false, error: err?.message ?? 'Error consultando resumen' });
        }
    }
}