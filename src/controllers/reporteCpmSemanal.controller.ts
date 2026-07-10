import { Request, Response } from 'express';
import ReporteCpmSemanalService, {
  ReporteCpmValidationError,
  ReporteCpmNotFoundError,
} from '../services/reporteCpmSemanal.service';

export default class ReporteCpmSemanalController {
  private readonly service = new ReporteCpmSemanalService();

  init = async (req: Request, res: Response): Promise<void> => {
    try {
      const truncate = req.body?.truncate === true
        || String(req.query.truncate ?? 'false').toLowerCase() === 'true';

      const result = await this.service.init(truncate);
      res.json(result);
    } catch (error: any) {
      console.error('Error al inicializar reporte_cpm_semanal', error);
      res.status(500).json({
        error: 'reporte_cpm_init_failed',
        detail: error?.message,
      });
    }
  };

  batch = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.batch(req.body?.rows);
      res.json(result);
    } catch (error: any) {
      if (error instanceof ReporteCpmValidationError) {
        res.status(400).json({
          error: 'invalid_reporte_cpm_rows',
          details: error.details,
        });
        return;
      }

      console.error('Error al insertar batch de reportes CPM', error);
      res.status(500).json({
        error: 'reporte_cpm_batch_failed',
        detail: error?.message,
      });
    }
  };

  private fecha(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ReporteCpmValidationError([]);
    const [y,m,d]=value.split('-').map(Number); const date=new Date(Date.UTC(y,m-1,d));
    if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d) throw new ReporteCpmValidationError([]);
    return value;
  }

  reporte = async (req: Request, res: Response): Promise<void> => { await this.handleReporte(req,res,false); };
  reporteExcel = async (req: Request, res: Response): Promise<void> => { await this.handleReporte(req,res,true); };
  private async handleReporte(req: Request,res: Response,excel:boolean): Promise<void> {
    let fecha: string|undefined;
    try {
      fecha=this.fecha(req.query.fechaCorte);
      if(excel){ const {buffer,reporte}=await this.service.generarReporteExcel(fecha); res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition',`attachment; filename="${reporte.nombreArchivo}"`); res.setHeader('Cache-Control','no-store'); res.setHeader('X-Reporte-Fecha-Corte',reporte.fechaCorte); res.send(buffer); }
      else res.json(await this.service.obtenerReporteSemanal(fecha));
    } catch(error:any){
      if(error instanceof ReporteCpmValidationError){res.status(400).json({ok:false,error:'invalid_fecha_corte',detail:'fechaCorte debe utilizar el formato YYYY-MM-DD.'});return;}
      if(error instanceof ReporteCpmNotFoundError){res.status(404).json({ok:false,error:'reporte_cpm_not_found',detail:fecha?`No existen registros para la fecha ${fecha}.`:'No existen registros de reporte CPM.'});return;}
      const missing=error?.code==='42P01'; console.error('Error al generar reporte CPM semanal',error); res.status(500).json({ok:false,error:'reporte_cpm_failed',detail:missing?'La tabla public.reporte_cpm_semanal no existe.':(error?.message??'Error inesperado.')});
    }
  }
}
