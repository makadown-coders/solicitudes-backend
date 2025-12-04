import { Request, Response } from 'express';
import KitsService from "../services/kits.service";

class KitsController {

    private kitsService;

    constructor() {
        this.kitsService = new KitsService();
    }

    // GET /api/kits?search=...
    async listKits(req: Request, res: Response): Promise<void> {
        try {
            const search = (req.query.search as string) || undefined;
            const rows = await this.kitsService.listKits(search);
            res.json({ ok: true, rows });
        } catch (error: any) {
            console.error('❌ Error en listKits:', error);
            res.status(500).json({ error: 'Error al listar los kits' });
        }
    }

    // POST /api/kits
    async createKit(req: Request, res: Response): Promise<void> {
        try {
            const { codigo, nombre } = req.body;
            const newKit = await this.kitsService.createKit(codigo, nombre);
            res.status(201).json({ ok: true, kit: newKit });
        } catch (error: any) {
            console.error('❌ Error en createKit:', error);
            res.status(500).json({ error: 'Error al crear el kit' });
        }
    }

    // PUT /api/kits/:id
    async updateKit(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10);
            const { codigo, nombre } = req.body;
            if (!id || !codigo) { res.status(400).json({ ok: false, msg: 'id/codigo requeridos' }); }

            const row = await this.kitsService.updateKit(id, codigo, nombre);
            res.json({ ok: true, kit: row });
        } catch (error: any) {
            console.error('❌ Error en updateKit:', error);
            res.status(500).json({ error: 'Error al actualizar el kit' });
        }
    }

    // DELETE /api/kits/:id
    async deleteKit(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id, 10);
            if (!id) { res.status(400).json({ ok: false, msg: 'id requerido' }); }
            const ok = await this.kitsService.deleteKit(id);
            if (!ok) { res.status(404).json({ ok: false, msg: 'Kit no encontrado' }); }
            res.json({ ok: ok });
        } catch (error: any) {
            console.error('❌ Error en deleteKit:', error);
            res.status(500).json({ error: 'Error al eliminar el kit' });
        }
    }

}

export default KitsController