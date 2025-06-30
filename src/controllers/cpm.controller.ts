import { Request, Response } from 'express';
import CpmService from "../services/cpm.service";

class CpmController {
    private CpmService: CpmService;
    constructor() {
        this.CpmService = new CpmService();
    }

    /**
     * (TEST) Regresa el Cpm de Power Automate en formato base64
     * @param req 
     * @param res 
     */
    async obtenerDesdePowerAutomate64(req: Request, res: Response): Promise<void> {
        try {
          const cpms = await this.CpmService.obtenerCpmDePowerAutomate64();
          res.json( {cpms} );
        } catch (error: any) {
          console.error('❌ Error en obtenerDesdePowerAutomate64:', error);
          res.status(500).json({ error: 'Error al obtener cpms' });
        }
      }
}

export default CpmController;