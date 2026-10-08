import { Request, Response } from 'express';
import CnisGruposTerapeuticosService from '../services/cnis-grupos-terapeuticos.service';

class CnisGruposTerapeuticosController {
  constructor(
    private readonly service: CnisGruposTerapeuticosService = new CnisGruposTerapeuticosService()
  ) {}

  async obtenerGruposUtilizados(_req: Request, res: Response): Promise<void> {
    try {
      res.json(await this.service.obtenerGruposUtilizados());
    } catch (error) {
      console.error('Error al consultar grupos terapéuticos CNIS:', error);
      res.status(500).json({ error: 'Error al consultar grupos terapéuticos CNIS' });
    }
  }

  async obtenerArticulosConGrupo(_req: Request, res: Response): Promise<void> {
    try {
      res.json(await this.service.obtenerArticulosConGrupo());
    } catch (error) {
      console.error('Error al consultar asociaciones de artículos CNIS:', error);
      res.status(500).json({ error: 'Error al consultar asociaciones de artículos CNIS' });
    }
  }

  async obtenerArticulosPorGrupo(req: Request, res: Response): Promise<void> {
    const numeroTexto = req.params.numero;
    const numero = Number(numeroTexto);

    if (!/^-?\d+$/.test(numeroTexto)
      || !Number.isInteger(numero)
      || numero < -2147483648
      || numero > 2147483647) {
      res.status(400).json({ error: 'El número de grupo debe ser un entero de 32 bits' });
      return;
    }

    try {
      res.json(await this.service.obtenerArticulosPorGrupo(numero));
    } catch (error) {
      console.error(`Error al consultar artículos del grupo CNIS ${numero}:`, error);
      res.status(500).json({ error: 'Error al consultar artículos del grupo terapéutico CNIS' });
    }
  }
}

export default CnisGruposTerapeuticosController;
