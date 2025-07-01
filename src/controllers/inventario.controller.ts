import { Request, Response } from 'express';
import InventarioService from "../services/inventario.service";

class InventarioController {
  private inventarioService: InventarioService;
  constructor() {
    this.inventarioService = new InventarioService();
  }

  /**
   * (TEST) Regresa el inventario de Power Automate en formato base64
   * @param req 
   * @param res 
   */
  async obtenerDesdePowerAutomate64(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64();
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerDesdePowerAutomate64:', error);
      res.status(500).json({ error: 'Error al obtener inventario' });
    }
  }
}

export default InventarioController;