import { Request, Response } from 'express';
import FactorConversionService from '../services/factor-conversion.service';

class FactorConversionController {
    private service = new FactorConversionService();

    obtener(req: Request, res: Response): void {
        const { clave } = req.params;
        if (!clave) {
            res.status(400).json({ error: 'Falta clave' });
            return;
        }

        this.service.obtenerPorClave(clave)
            .then(fc => res.json(fc))
            .catch(err => {
                console.error(err);
                res.status(500).json({ error: 'Error consultando factor' });
            });
    }

    async obtenerPorClaveYClues(req: Request, res: Response): Promise<void> {
        try {
            const clave = String(req.query.clave || '').trim();
            const clues = String(req.query.clues || '').trim();

            if (!clave || !clues) {
                res.status(400).json({ error: 'Parámetros requeridos: clave, clues' });
                return;
            }

            const factor = await this.service.obtenerPorClaveYClues(clave, clues);
            res.json(factor);
        } catch (err) {
            console.error('Error /api/factores/factor:', err);
            res.status(500).json({ error: 'Error al obtener factor de conversión' });
        }
    }
}

export default FactorConversionController;
