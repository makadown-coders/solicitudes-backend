import type { Request, Response } from 'express';
import { analizarNecesidades } from '../services/concentrado-segundo-nivel.service';

export async function concentradoSegundoNivel(req: Request, res: Response) {
  const { modalidad, mes, desde, ventanas } = req.body ?? {};
  if ((modalidad !== 'MES_CALENDARIO' && modalidad !== 'ULTIMOS_30_DIAS')
      || (mes !== undefined && typeof mes !== 'string') || (desde !== undefined && typeof desde !== 'string')) {
    res.status(400).json({ error: 'Revise la modalidad y el periodo.' });
    return;
  }
  try {
    res.json(await analizarNecesidades({ modalidad, mes, desde, ventanas }));
  } catch (error) {
    if (error instanceof RangeError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Error consultando Concentrado de Segundo Nivel', error);
    res.status(500).json({ error: 'No fue posible consultar las necesidades hospitalarias.' });
  }
}
