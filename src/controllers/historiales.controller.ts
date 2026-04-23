import { Request, Response } from 'express';
import HistorialesService from "../services/historiales.service";
import fs from 'fs';
import { SolicitudArchivo } from '../models/solicitudArchivo.model';
import { SolicitudEncuestaPiloto } from '../models/solicitudEncuestaPiloto';

class HistorialesController {
    private historialesService: HistorialesService
    constructor() {
        this.historialesService = new HistorialesService();
    }

    async postArchivoSolicitud(req: Request, res: Response): Promise<void> {
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
                res.status(400).json({ error: 'Faltan datos requeridos' });
                return;
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

            res.json({ exito: true, resultado: result });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al enviar archivo a Power Automate' });
        }
    }

    async postEncuestaPiloto(req: Request, res: Response): Promise<void> {
        try {
            const b = req.body as Partial<SolicitudEncuestaPiloto>;

            const required = ['timestamp', 'cluesimb', 'pilot_site', 'evento', 'facilidad_1_5', 'termino_sin_trabas', 'csat_1_5'] as const;
            for (const k of required) {
                if ((b as any)[k] === undefined || (b as any)[k] === null) {
                    res.status(400).json({ error: `Falta campo requerido: ${k}` });
                    return;
                }
            }
            if (Number.isNaN(Date.parse(String(b.timestamp)))) {
                res.status(400).json({ error: 'timestamp inválido (ISO requerido)' });
                return;
            }
            const f = Number(b.facilidad_1_5);
            const c = Number(b.csat_1_5);
            if (!Number.isInteger(f) || f < 1 || f > 5) {
                res.status(400).json({ error: 'facilidad_1_5 debe ser entero 1..5' });
                return;
            }
            if (!Number.isInteger(c) || c < 1 || c > 5) {
                res.status(400).json({ error: 'csat_1_5 debe ser entero 1..5' });
                return;
            }
            if (typeof b.termino_sin_trabas !== 'boolean') {
                res.status(400).json({ error: 'termino_sin_trabas debe ser boolean' });
                return;
            }
            if (b.comentario && String(b.comentario).length > 500) {
                res.status(400).json({ error: 'comentario excede 500 caracteres' });
                return;
            }

            const payload: SolicitudEncuestaPiloto = {
                timestamp: String(b.timestamp),
                cluesimb: String(b.cluesimb),
                pilot_site: String(b.pilot_site),
                evento: String(b.evento),
                facilidad_1_5: f,
                termino_sin_trabas: Boolean(b.termino_sin_trabas),
                csat_1_5: c,
                comentario: b.comentario ? String(b.comentario).slice(0, 500) : undefined,
                app_version: b.app_version ? String(b.app_version) : undefined,
            };

            const result = await this.historialesService.enviarEncuestaASharePoint(payload);
            res.json({ exito: true, resultado: result });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Error al enviar encuesta a Power Automate' });
        }
    }
}

export default HistorialesController;
