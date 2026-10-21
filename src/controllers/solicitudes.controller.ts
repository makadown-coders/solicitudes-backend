import { Request, Response } from 'express';
import SolicitudesService from "../services/solicitudes.service";
import NecesidadesPrimerNivelService from '../services/necesidades-primer-nivel.service';

export class SolicitudesController {
    private service: SolicitudesService;
    private necesidadesPrimerNivel = new NecesidadesPrimerNivelService();

    constructor() {
        this.service = new SolicitudesService();
    }

    async postEnviarNecesidadesPrimerNivel(req: Request, res: Response) {
        try {
            const resultado = await this.necesidadesPrimerNivel.enviar(req.body ?? {});
            res.status(201).json({ ok: true, ...resultado });
        } catch (err: any) {
            console.error('Error enviando necesidades de Primer Nivel:', err);
            const mensaje = err?.message ?? 'No se pudo enviar la lista para revisión';
            const esErrorExterno = err?.isAxiosError === true;
            res.status(esErrorExterno ? 502 : 400).json({ ok: false, error: mensaje });
        }
    }

    async postVistaPreviaNecesidadesPrimerNivel(req: Request, res: Response) {
        const hostname = req.hostname.toLowerCase();
        const esLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
        if (!esLocal || process.env.NODE_ENV === 'production') {
            res.status(404).json({ ok: false, error: 'Ruta no disponible' });
            return;
        }

        try {
            const resultado = await this.necesidadesPrimerNivel.generarVistaPrevia(req.body ?? {});
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${resultado.nombreArchivo}"`);
            res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Preview-Result');
            res.setHeader('X-Preview-Result', Buffer.from(JSON.stringify({
                solicitudId: resultado.solicitudId,
                folio: resultado.folio,
                cluesimb: resultado.cluesimb,
                unidad: resultado.unidad,
                periodo: resultado.periodo,
                totalInsumos: resultado.totalInsumos,
                totalPiezas: resultado.totalPiezas,
                recibidoEn: resultado.recibidoEn,
            })).toString('base64'));
            res.status(200).send(resultado.buffer);
        } catch (err: any) {
            console.error('Error generando vista previa de necesidades de Primer Nivel:', err);
            res.status(400).json({ ok: false, error: err?.message ?? 'No se pudo generar la vista previa' });
        }
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
