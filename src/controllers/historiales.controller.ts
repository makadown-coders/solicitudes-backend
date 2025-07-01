import { Request, Response } from 'express';
import HistorialesService from "../services/historiales.service";
import fs from 'fs';
import { SolicitudArchivo } from '../models/SolicitudArchivo';

class HistorialesController {
    private historialesService: HistorialesService
    constructor() {
        this.historialesService = new HistorialesService();
    }

    async postArchivoSolicitud(req: Request, res: Response) {
        try {
            const {
                nombreArchivo,
                contenidoBase64,
                nombre,
                unidad,
                clues,
                periodo,
                tipoMime
            } = req.body as SolicitudArchivo;

            if (!contenidoBase64 || !nombreArchivo) {
                return res.status(400).json({ error: 'Faltan datos requeridos' });
            }

            const result = await this.historialesService.enviarArchivoASharePoint({
                nombreArchivo,
                contenidoBase64,
                nombre,
                unidad,
                clues,
                periodo,
                tipoMime,
            });

            return res.json({ exito: true, resultado: result });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al enviar archivo a Power Automate' });
        }
    }
}

export default HistorialesController;