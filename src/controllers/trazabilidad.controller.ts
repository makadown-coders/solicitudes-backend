import { Request, Response } from 'express';
import TrazabilidadService from '../services/trazabilidad.service';

class TrazabilidadController {
  private service = new TrazabilidadService();

  async getMovimientosPorClaveYClues(req: Request, res: Response): Promise<void> {
    const clave = req.query.clave as string;
    const cluesimb = req.query.cluesimb as string;

    if (!clave || !cluesimb) {
      res.status(400).json({ error: 'Faltan parámetros requeridos: clave y cluesimb' });
      return;
    }

    try {
      const movimientos = await this.service.obtenerMovimientosPorClaveYClues(clave, cluesimb);
      res.json(movimientos);
    } catch (error) {
      console.error('Error en getMovimientosPorClaveYClues:', error);
      res.status(500).json({ error: 'Error al obtener la trazabilidad de la clave' });
    }
  }

  async getAllFactoresDeConversion(req: Request, res: Response): Promise<void> {
    try {
      const factoresMap = await this.service.obtenerTodosFactoresConversion();
      const factoresObj = Object.fromEntries(factoresMap);

      const factores = {
        success: true,
        data: factoresObj,
        timestamp: new Date().toISOString(),
        message: 'Factores de conversión obtenidos correctamente',
      };
      res.json(factores);
    } catch (error) {
      console.error('Error en getAllFactoresDeConversion:', error);
      res.status(500).json({ success: false, message: 'Error al obtener los factores de conversión' });
    }
  }

  async getAllFactoresDeConversionV2(req: Request, res: Response): Promise<void> {
    try {
      const factores = await this.service.obtenerTodosFactoresConversion_v2();
      const response = {
        success: true,
        data: factores,
        timestamp: new Date().toISOString(),
        message: 'Factores de conversión obtenidos correctamente',
      };
      res.json(response);
    } catch (error) {
      console.error('Error en getAllFactoresDeConversionV2:', error);
      res.status(500).json({ success: false, message: 'Error al obtener los factores de conversión' });
    }
  }
}

export default TrazabilidadController;
