import { Request, Response } from 'express';
import { BalanceoV2Service } from '../services/balanceo-v2.service';

class BalanceoV2Controller {
  private balanceoV2Service: BalanceoV2Service;

  constructor() {
    this.balanceoV2Service = new BalanceoV2Service();
  }

  private obtenerIdNumerico(req: Request, res: Response): number | null {
    const ejecucionId = Number(req.params.id);
    if (!Number.isInteger(ejecucionId) || ejecucionId <= 0) {
      res.status(400).json({ ok: false, message: 'id invalido' });
      return null;
    }

    return ejecucionId;
  }

  async ejecutarBalanceoV2(req: Request, res: Response) {
    try {
      const ejecucionId = await this.balanceoV2Service.ejecutarBalanceoV2();
      res.json({ ok: true, ejecucionId });
    } catch (error) {
      console.error('Error al ejecutar balanceo v2:', error);
      res.status(500).json({
        ok: false,
        message: 'Error al ejecutar el balanceo v2',
      });
    }
  }

  async obtenerEjecuciones(req: Request, res: Response) {
    try {
      const data = await this.balanceoV2Service.obtenerEjecuciones();
      res.json({ ok: true, data });
    } catch (error) {
      console.error('Error al obtener ejecuciones de balanceo v2:', error);
      res.status(500).json({
        ok: false,
        message: 'Error al obtener las ejecuciones de balanceo v2',
      });
    }
  }

  async obtenerUltimaEjecucion(req: Request, res: Response) {
    try {
      const data = await this.balanceoV2Service.obtenerUltimaEjecucion();
      res.json({ ok: true, data });
    } catch (error) {
      console.error('Error al obtener ultima ejecucion de balanceo v2:', error);
      res.status(500).json({
        ok: false,
        message: 'Error al obtener la ultima ejecucion de balanceo v2',
      });
    }
  }

  async obtenerResumenJurisdiccional(req: Request, res: Response) {
    try {
      const ejecucionId = this.obtenerIdNumerico(req, res);
      if (ejecucionId === null) return;

      const data =
        await this.balanceoV2Service.obtenerResumenJurisdiccional(ejecucionId);
      res.json({ ok: true, data });
    } catch (error) {
      console.error('Error al obtener resumen jurisdiccional v2:', error);
      res.status(500).json({
        ok: false,
        message: 'Error al obtener el resumen jurisdiccional de balanceo v2',
      });
    }
  }

  async obtenerDetallePorEjecucion(req: Request, res: Response) {
    try {
      const ejecucionId = this.obtenerIdNumerico(req, res);
      if (ejecucionId === null) return;

      const {
        clave_cnis,
        jurisdiccion_almacen,
        jurisdiccion_destino,
      } = req.query;

      const data = await this.balanceoV2Service.obtenerDetallePorEjecucion({
        ejecucionId,
        clave_cnis: clave_cnis as string | undefined,
        jurisdiccion_almacen: jurisdiccion_almacen as string | undefined,
        jurisdiccion_destino: jurisdiccion_destino as string | undefined,
      });

      res.json({ ok: true, data });
    } catch (error) {
      console.error('Error al obtener detalle de balanceo v2:', error);
      res.status(500).json({
        ok: false,
        message: 'Error al obtener el detalle de balanceo v2',
      });
    }
  }

  async obtenerApartadosPorEjecucion(req: Request, res: Response) {
    try {
      const ejecucionId = this.obtenerIdNumerico(req, res);
      if (ejecucionId === null) return;

      const { clave_cnis, jurisdiccion } = req.query;

      const data = await this.balanceoV2Service.obtenerApartadosPorEjecucion({
        ejecucionId,
        clave_cnis: clave_cnis as string | undefined,
        jurisdiccion: jurisdiccion as string | undefined,
      });

      res.json({ ok: true, data });
    } catch (error) {
      console.error('Error al obtener apartados de balanceo v2:', error);
      res.status(500).json({
        ok: false,
        message: 'Error al obtener los apartados de balanceo v2',
      });
    }
  }

  async obtenerResultadosPorEjecucion(req: Request, res: Response) {
    try {
      const ejecucionId = this.obtenerIdNumerico(req, res);
      if (ejecucionId === null) return;

      const data =
        await this.balanceoV2Service.obtenerResultadosPorEjecucion(ejecucionId);
      res.json({ ok: true, data });
    } catch (error) {
      console.error('Error al obtener resultados de balanceo v2:', error);
      res.status(500).json({
        ok: false,
        message: 'Error al obtener los resultados de balanceo v2',
      });
    }
  }
}

export default BalanceoV2Controller;
