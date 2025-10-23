import { Request, Response } from 'express';
import CitasService from '../services/citas.service';

class CitasController {
  private citasService = new CitasService();
  init = async (req: Request, res: Response) => {
    try {
      const reset = String(req.query.reset ?? 'true') === 'true';
      const out = await this.citasService.init(reset);
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: 'init_failed', detail: e?.message });
    }
  };

  batch = async (req: Request, res: Response) => {
    try {
      const rows = req.body?.rows ?? [];
      const out = await this.citasService.batch(rows);
      console.log('Enviando batch de citas exitosamente con', out.inserted, 'registros');
      res.json(out);
    } catch (e: any) {
      console.error('Error al insertar batch de citas');
      console.error(e);
      res.status(500).json({ error: 'batch_failed', detail: e?.message });
    }
  };

  /**
   * En vias de deprecación!
   * Regresa todas las citas de Power Automate en formato base64.
   * Unico método activo para obtener las citas del archivo excel del
   * heróico cuerpo del Abasto.
   * @param req 
   * @param res 
   */
  async obtenerDesdePowerAutomate64(req: Request, res: Response): Promise<void> {
    try {
      const citas = await this.citasService.obtenerCitasDePowerAutomate64();
      res.json({ citas });
    } catch (error: any) {
      console.error('❌ Error en obtenerDesdePowerAutomate64:', error);
      res.status(500).json({ error: 'Error al obtener citas' });
    }
  }

}

export default CitasController;
