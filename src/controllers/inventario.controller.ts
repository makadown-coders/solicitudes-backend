import { Request, Response } from 'express';
import InventarioService from "../services/inventario.service";
import { AzureEndpoint } from '../enums/AzureEndpoint.enum';

class InventarioController {
  private inventarioService: InventarioService;
  constructor() {
    this.inventarioService = new InventarioService();
  }

  /**
   * (TEST) Regresa el inventario de los 3 almacenes de Power Automate en formato base64
   * @param req 
   * @param res 
   */
  async obtenerDesdePowerAutomate64(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64();
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerDesdePowerAutomate64:', error);
      res.status(500).json({ error: 'Error al obtener info de existencias de almacenes' });
    }
  }
 

  async obtenerHGENS(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64(AzureEndpoint.HGENS);
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerHGENS:', error);
      res.status(500).json({ error: 'Error al obtener existencias' });
    }
  }

  async obtenerHGMXL(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64(AzureEndpoint.HGMXL);
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerHGMXL:', error);
      res.status(500).json({ error: 'Error al obtener existencias' });
    }
  }

  async obtenerHGTKT(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64(AzureEndpoint.HGTKT);
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerHGTKT:', error);
      res.status(500).json({ error: 'Error al obtener existencias' });
    }
  }

  async obtenerHGTIJ(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64(AzureEndpoint.HGTIJ);
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerHGTIJ:', error);
      res.status(500).json({ error: 'Error al obtener existencias' });
    }
  }

  async obtenerHMITIJ(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64(AzureEndpoint.HMITIJ);
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerHMITIJ:', error);
      res.status(500).json({ error: 'Error al obtener existencias' });
    }
  }


  async obtenerHGPR(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64(AzureEndpoint.HGPR);
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerHGPR:', error);
      res.status(500).json({ error: 'Error al obtener existencias' });
    }
  }

  async obtenerHMIMXL(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64(AzureEndpoint.HMIMXL);
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerHMIMXL:', error);
      res.status(500).json({ error: 'Error al obtener existencias' });
    }
  }

  async obtenerUOMXL(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64(AzureEndpoint.UOMXL);
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerUOMXL:', error);
      res.status(500).json({ error: 'Error al obtener existencias' });
    }
  }

  async obtenerHGTZE(req: Request, res: Response): Promise<void> {
    try {
      const inventario = await this.inventarioService.obtenerInventarioDePowerAutomate64(AzureEndpoint.HGTZE);
      res.json({ inventario });
    } catch (error: any) {
      console.error('❌ Error en obtenerHGTZE:', error);
      res.status(500).json({ error: 'Error al obtener existencias' });
    }
  }

}

export default InventarioController;