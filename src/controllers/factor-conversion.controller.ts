import { Request, Response } from 'express';
import FactorConversionService from '../services/factor-conversion.service';

class FactorConversionController {
    private service = new FactorConversionService();

    obtener(req: Request, res: Response) {
        const { clave } = req.params;
        if (!clave) return res.status(400).json({ error: 'Falta clave' });

        this.service.obtenerPorClave(clave)
            .then(fc => res.json(fc))
            .catch(err => {
                console.error(err);
                res.status(500).json({ error: 'Error consultando factor' });
            });
    }

    async obtenerPorClaveYClues(req: Request, res: Response) {
        try {
            const clave = String(req.query.clave || '').trim();
            const clues = String(req.query.clues || '').trim();

            if (!clave || !clues) {
                return res.status(400).json({ error: 'Parámetros requeridos: clave, clues' });
            }

            const factor = await this.service.obtenerPorClaveYClues(clave, clues);
            return res.json(factor);
        } catch (err) {
            console.error('Error /api/factores/factor:', err);
            return res.status(500).json({ error: 'Error al obtener factor de conversión' });
        }
    }
}

export default FactorConversionController;
