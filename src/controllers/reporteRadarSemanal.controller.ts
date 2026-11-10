import { Request, Response } from 'express';
import ReporteRadarSemanalService, { ReporteRadarError } from '../services/reporteRadarSemanal.service';
import ReporteRadarSemanalUnMesService from '../services/reporteRadarSemanalUnMes.service';

export default class ReporteRadarSemanalController {
  private readonly service: ReporteRadarSemanalService;
  private readonly unMes?: ReporteRadarSemanalUnMesService;

  constructor(service?: ReporteRadarSemanalService, unMes?: ReporteRadarSemanalUnMesService) {
    this.service = service ?? new ReporteRadarSemanalService();
    // Las pruebas y consumidores que inyectan el servicio conservan la ruta anterior.
    // El controlador productivo usa las vistas materializadas para el reporte operativo fijo de un mes.
    this.unMes = unMes ?? (service ? undefined : new ReporteRadarSemanalUnMesService());
  }

  reporte = async (req: Request, res: Response): Promise<void> => { await this.handle(req, res, false); };
  reporteExcel = async (req: Request, res: Response): Promise<void> => { await this.handle(req, res, true); };
  prepararExcel = async (_req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    if (!this.unMes) { res.status(503).json({ ok: false, error: 'reporte_radar_no_disponible' }); return; }
    const estado = this.unMes.preparar();
    res.status(estado.status).json(estado);
  };
  estadoExcel = async (_req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    if (!this.unMes) { res.status(503).json({ ok: false, error: 'reporte_radar_no_disponible' }); return; }
    res.json(this.unMes.estado());
  };

  private async handle(req: Request, res: Response, excel: boolean): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const value = req.query.months;
      if (value !== undefined && (typeof value !== 'string' || !/^(?:[1-9]|1[0-2])$/.test(value))) {
        throw new ReporteRadarError(400, 'invalid_months', 'months debe ser un entero entre 1 y 12.');
      }
      const months = value === undefined ? 1 : Number(value);
      const version = req.query.versionDatos;
      if (version !== undefined && (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version))) {
        throw new ReporteRadarError(400, 'invalid_version_datos', 'versionDatos debe ser la versión devuelta por el reporte JSON.');
      }
      if (!excel) {
        res.json(months === 1 && this.unMes
          ? await this.unMes.obtenerReporte()
          : await this.service.obtenerReporte(months));
        return;
      }
      const { archivo, limpiar, reporte } = months === 1 && this.unMes && version === undefined
        ? await this.unMes.generarExcel()
        : await this.service.generarExcel(months, version as string | undefined);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${reporte.nombreArchivo}"`);
      res.setHeader('X-Reporte-Nombre-Archivo', reporte.nombreArchivo);
      if (reporte.versionDatos) res.setHeader('X-Reporte-Version', reporte.versionDatos);
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
