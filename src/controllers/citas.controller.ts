import { Request, Response } from 'express';
import CitasService from '../services/citas.service';
import { PaginationQuery } from '../models/PaginationQuery';

class CitasController {
  private citasService = new CitasService();

  /**
   * @deprecated Por el momento ya no se usa este backend para gestionar citas
   * Si bien este método funciona, es muy complicado mantener actualizada la
   * base de datos de postgres con las citas de Power Automate debido al volumen
   * y las limitaciones de tiempo de procesamiento en versión gratuita del backend en Koyeb.
   * Se optó por usar otro método.
   * @param req 
   * @param res 
   */
  async obtenerPaginado(req: Request, res: Response): Promise<void> {
    try {
      const query: PaginationQuery = {
        ...req.query,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as 'ASC' | 'DESC',
       // search: req.query.search as string
      };

      const result = await this.citasService.obtenerCitas(query);
      res.json(result);
    } catch (err: any) {
      console.error('Error en obtenerPaginado:', err.message);
      res.status(500).json({ error: 'Error al obtener citas' });
    }
  }

  /**
   * @deprecated Por el momento ya no se usa para gestionar citas.
   * Si bien este método funciona, es muy complicado mantener actualizada la
   * base de datos de postgres con las citas de Power Automate debido al volumen
   * y las limitaciones de tiempo de procesamiento en versión gratuita del backend en Koyeb.
   * Se optó por usar otro método.
   * @param req 
   * @param res 
   * @returns 
   */
  async buscarPorOrden(req: Request, res: Response): Promise<void> {
    try {
      const q = (req.query.q as string)?.trim();
  
      if (!q || q.length < 3) {
        res.status(400).json({ error: 'Query demasiado corta' });
        return;
      }
  
      const resultados = await this.citasService.buscarOrdenes(q);
      res.json(resultados);
    } catch (err: any) {
      console.error('Error en buscarPorOrden:', err.message);
      res.status(500).json({ error: 'Error del servidor' });
    }
  }

  /**
   * @deprecated Por el momento ya no se usa este backend para gestionar citas
   * @param req 
   * @param res 
   */
  async refrescarDesdePowerAutomate(req: Request, res: Response): Promise<void> {
    try {
      const actualizado = await this.citasService.refrescarCitasDesdePowerAutomate();
      res.json({ mensaje: `Proceso terminado. Registros actualizados: ${actualizado}` });
    } catch (error: any) {
      console.error('❌ Error en refrescarDesdePowerAutomate:', error);
      res.status(500).json({ error: 'Error al refrescar citas' });
    }
  }

  /**
   * @deprecated Si bien este método funciona, no es conveniente generar el 
   * json de un archivo de mas de 9000+ citas. Se optó por usar otro método.
   * Regresa todas las citas de Power Automate en formato json
   * @param req 
   * @param res 
   */
  async obtenerDesdePowerAutomate(req: Request, res: Response): Promise<void> {
    try {
      const citas = await this.citasService.obtenerCitasDePowerAutomate();
      res.json( citas );
    } catch (error: any) {
      console.error('❌ Error en obtenerDesdePowerAutomate:', error);
      res.status(500).json({ error: 'Error al obtener citas' });
    }
  }

  /**
   * Regresa todas las citas de Power Automate en formato base64.
   * Unico método activo para obtener las citas del archivo excel del
   * heróico cuerpo del Abasto.
   * @param req 
   * @param res 
   */
  async obtenerDesdePowerAutomate64(req: Request, res: Response): Promise<void> {
    try {
      const citas = await this.citasService.obtenerCitasDePowerAutomate64();
      res.json( {citas} );
    } catch (error: any) {
      console.error('❌ Error en obtenerDesdePowerAutomate64:', error);
      res.status(500).json({ error: 'Error al obtener citas' });
    }
  }
  
}

export default CitasController;
