// src/s/balanceo..ts
import { Request, Response } from 'express';
import { BalanceoService } from '../services/balanceo.service';

class BalanceoController {
    private balanceoService: BalanceoService;

    constructor() {
        this.balanceoService = new BalanceoService();
    }

    async ejecutarBalanceo(req: Request, res: Response) {
        try {
            const ejecucionId = await this.balanceoService.ejecutarBalanceoExistencias();
            res.json({ ok: true, ejecucionId });
        } catch (error) {
            console.error('Error al ejecutar balanceo:', error);
            res.status(500).json({
                ok: false,
                message: 'Error al ejecutar el balanceo de existencias',
            });
        }
    }

    async obtenerUltimaEjecucion(
        req: Request,
        res: Response
    ) {
        try {
            const ejecucion = await this.balanceoService.obtenerUltimaEjecucion();
            res.json({ ok: true, ejecucion });
        } catch (error) {
            console.error('Error al obtener última ejecución:', error);
            res.status(500).json({
                ok: false,
                message: 'Error al obtener la última ejecución de balanceo',
            });
        }
    }

    async obtenerResumenActual(
        req: Request,
        res: Response
    ) {
        try {
            const resumen = await this.balanceoService.obtenerResumenActual();
            res.json({ ok: true, resumen });
        } catch (error) {
            console.error('Error al obtener resumen actual:', error);
            res.status(500).json({
                ok: false,
                message: 'Error al obtener el resumen actual de balanceo',
            });
        }
    }

    async obtenerDetalleActual(
        req: Request,
        res: Response
    ) {
        try {
            const { clave_cnis, jurisdiccion_almacen } = req.query;

            const detalle = await this.balanceoService.obtenerDetalleActual({
                clave_cnis: clave_cnis as string | undefined,
                jurisdiccion_almacen: jurisdiccion_almacen as string | undefined,
            });

            res.json({ ok: true, detalle });
        } catch (error) {
            console.error('Error al obtener detalle actual:', error);
            res.status(500).json({
                ok: false,
                message: 'Error al obtener el detalle actual de balanceo',
            });
        }
    }

    // Opcionales: histórico por ejecucion_id

    async obtenerResumenPorEjecucion(
        req: Request,
        res: Response
    ) {
        try {
            const ejecucionId = Number(req.params.ejecucionId);
            if (!ejecucionId) {
                return res
                    .status(400)
                    .json({ ok: false, message: 'ejecucionId inválido' });
            }

            const resumen = await this.balanceoService.obtenerResumenPorEjecucion(
                ejecucionId
            );
            res.json({ ok: true, resumen });
        } catch (error) {
            console.error('Error al obtener resumen histórico:', error);
            res.status(500).json({
                ok: false,
                message: 'Error al obtener el resumen histórico de balanceo',
            });
        }
    }

    async obtenerDetallePorEjecucion(
        req: Request,
        res: Response
    ) {
        try {
            const ejecucionId = Number(req.params.ejecucionId);
            if (!ejecucionId) {
                return res
                    .status(400)
                    .json({ ok: false, message: 'ejecucionId inválido' });
            }

            const { clave_cnis, jurisdiccion_almacen } = req.query;

            const detalle = await this.balanceoService.obtenerDetallePorEjecucion({
                ejecucionId,
                clave_cnis: clave_cnis as string | undefined,
                jurisdiccion_almacen: jurisdiccion_almacen as string | undefined,
            });

            res.json({ ok: true, detalle });
        } catch (error) {
            console.error('Error al obtener detalle histórico:', error);
            res.status(500).json({
                ok: false,
                message: 'Error al obtener el detalle histórico de balanceo',
            });
        }
    }
}

export default BalanceoController;