import { Request, Response } from 'express';
import ReporteRadarSemanalService, { ReporteRadarError } from '../services/reporteRadarSemanal.service';

export default class ReporteRadarSemanalController {
  constructor(private readonly service = new ReporteRadarSemanalService()) {}

  reporte = async (req: Request, res: Response): Promise<void> => { await this.handle(req, res, false); };
  reporteExcel = async (req: Request, res: Response): Promise<void> => { await this.handle(req, res, true); };

  private async handle(req: Request, res: Response, excel: boolean): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const value = req.query.months;
      if (value !== undefined && (typeof value !== 'string' || !/^(?:[1-9]|1[0-2])$/.test(value))) {
        throw new ReporteRadarError(400, 'invalid_months', 'months debe ser un entero entre 1 y 12.');
      }
      const months = value === undefined ? 3 : Number(value);
      const version = req.query.versionDatos;
      if (version !== undefined && (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version))) {
        throw new ReporteRadarError(400, 'invalid_version_datos', 'versionDatos debe ser la versión devuelta por el reporte JSON.');
      }
      if (!excel) {
        res.json(await this.service.obtenerReporte(months));
        return;
      }
      const { archivo, limpiar, reporte } = await this.service.generarExcel(months, version as string | undefined);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${reporte.nombreArchivo}"`);
      res.setHeader('X-Reporte-Version', reporte.versionDatos);
      try {
        if (!res.destroyed) {
          await new Promise<void>((resolve, reject) => {
            res.sendFile(archivo, error => error ? reject(error) : resolve());
          });
        }
      } finally { await limpiar(); }
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      res.removeHeader('Content-Disposition');
      res.removeHeader('Content-Type');
      if (error instanceof ReporteRadarError) {
        if (error.status === 503) res.setHeader('Retry-After', '30');
        res.status(error.status).json({ ok: false, error: error.code, detail: error.message });
        return;
      }
      console.error('Error al generar reporte semanal del radar', error);
      res.status(500).json({ ok: false, error: 'reporte_radar_failed', detail: 'No fue posible generar el reporte del radar.' });
    }
  }
}
