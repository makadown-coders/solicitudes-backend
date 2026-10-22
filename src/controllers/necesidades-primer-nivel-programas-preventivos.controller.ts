import { Request, Response } from 'express';
import NecesidadesPrimerNivelProgramasPreventivosService, {
  ProgramaPreventivoNoEncontradoError,
  ProgramaPreventivoValidacionError,
} from '../services/necesidades-primer-nivel-programas-preventivos.service';

export class NecesidadesPrimerNivelProgramasPreventivosController {
  constructor(private readonly service = new NecesidadesPrimerNivelProgramasPreventivosService()) {}

  async getProgramas(req: Request, res: Response): Promise<void> {
    try {
      console.log('getProgramas called with cluesimb:', req.query.cluesimb);
      res.status(200).json(await this.service.listar(String(req.query.cluesimb ?? '')));
    } catch (error) {
      console.error('Error consultando programas preventivos:', error);
      res.status(500).json({ ok: false, error: 'No se pudieron consultar los programas preventivos' });
    }
  }

  async getPrograma(req: Request, res: Response): Promise<void> {
    try {
      const resultado = await this.service.obtenerDetalle(
        String(req.params.codigo ?? ''),
        String(req.query.cluesimb ?? '')
      );
      if (!resultado) {
        res.status(404).json({ ok: false, error: 'Programa no disponible' });
        return;
      }
      res.status(200).json(resultado);
    } catch (error: any) {
      if (error instanceof ProgramaPreventivoNoEncontradoError) {
        res.status(404).json({ ok: false, error: error.message });
        return;
      }
      if (error instanceof ProgramaPreventivoValidacionError) {
        res.status(400).json({ ok: false, error: error.message });
        return;
      }
      console.error('Error consultando programa preventivo:', error);
      res.status(500).json({ ok: false, error: 'No se pudo consultar el programa preventivo' });
    }
  }

  async postResolver(req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json(await this.service.resolver(req.body ?? {}));
    } catch (error: any) {
      if (error instanceof ProgramaPreventivoNoEncontradoError) {
        res.status(404).json({ ok: false, error: error.message });
        return;
      }
      if (error instanceof ProgramaPreventivoValidacionError) {
        res.status(400).json({ ok: false, error: error.message });
        return;
      }
      console.error('Error resolviendo programa preventivo:', error);
      res.status(500).json({ ok: false, error: 'No se pudo resolver el programa preventivo' });
    }
  }
}
