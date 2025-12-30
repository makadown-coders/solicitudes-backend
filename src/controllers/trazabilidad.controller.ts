// src/controllers/trazabilidad.controller.ts
import { Request, Response } from 'express';
import TrazabilidadService from '../services/trazabilidad.service';

class TrazabilidadController {
  private service = new TrazabilidadService();

  async getMovimientosPorClaveYClues(req: Request, res: Response) {
    const clave = req.query.clave as string;
    const cluesimb = req.query.cluesimb as string;

    if (!clave || !cluesimb) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos: clave y cluesimb' });
    }

    try {
      const movimientos = await this.service.obtenerMovimientosPorClaveYClues(clave, cluesimb);
      res.json(movimientos);
    } catch (error) {
      console.error('Error en getMovimientosPorClaveYClues:', error);
      res.status(500).json({ error: 'Error al obtener la trazabilidad de la clave' });
    }
  }

  async getAllFactoresDeConversion(req: Request, res: Response) {
    try {
      const factoresMap = await this.service.obtenerTodosFactoresConversion();
      // Convertir Map a objeto para JSON
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

}

export default TrazabilidadController;
