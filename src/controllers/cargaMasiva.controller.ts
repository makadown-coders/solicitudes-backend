import { Request, Response } from 'express';
import CargaMasivaService from '../services/cargaMasiva.service';


class CargaMasivaController {
    private service: CargaMasivaService;

    constructor() {
        this.service = new CargaMasivaService();
    }

    async initEntradas(req: Request, res: Response): Promise<void> {
        try {
            await this.service.limpiarTabla('entrada');
            res.json({ message: 'Tabla entradas limpia y lista' });
        } catch (error) {
            res.status(500).json({ error: 'Error al limpiar entradas' });
        }
    }

    async batchEntradas(req: Request, res: Response): Promise<void> {
        try {
            console.info('Entrando a batchEntradas');
            const datos = req.body;
            await this.service.insertarBatchGenerico('entrada', datos);
            res.json({ message: `Batch de entradas insertado (${datos.length} registros)` });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al insertar batch de entradas' });
        }
    }

    async initSalidas(req: Request, res: Response): Promise<void> {
        try {
            await this.service.limpiarTabla('salida');
            res.json({ message: 'Tabla salidas limpia y lista' });
        } catch (error) {
            res.status(500).json({ error: 'Error al limpiar salidas' });
        }
    }

    async batchSalidas(req: Request, res: Response): Promise<void> {
        try {
            console.info('Entrando a batchSalidas');
            const datos = req.body;
            await this.service.insertarBatchGenerico('salida', datos);
            res.json({ message: `Batch de salidas insertado (${datos.length} registros)` });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al insertar batch de salidas' });
        }
    }

    async initTraspasos(req: Request, res: Response): Promise<void> {
        try {
            await this.service.limpiarTabla('traspaso');
            res.json({ message: 'Tabla traspaso limpia y lista' });
        } catch (error) {
            res.status(500).json({ error: 'Error al limpiar traspasos' });
        }
    }

    async batchTraspasos(req: Request, res: Response): Promise<void> {
        try {
            console.info('Entrando a batchTraspasos');
            const datos = req.body;
            await this.service.insertarBatchGenerico('traspaso', datos);
            res.json({ message: `Batch de traspasos insertado (${datos.length} registros)` });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al insertar batch de traspasos' });
        }
    }

    // 🔹 NUEVOS
    async initInventarioInicial(req: Request, res: Response): Promise<void> {
        try {
            // Si quieres borrar TODO (todos los años):
            await this.service.limpiarTabla('inventario_inicial');
            res.json({ message: 'Tabla inventario_inicial limpia y lista' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al limpiar inventario_inicial' });
        }
    }

    async batchInventarioInicial(req: Request, res: Response): Promise<void> {
        try {
            const { anio, resetAnio = true } = req.query;
            if (!anio) {
                res.status(400).json({ error: 'Falta parámetro ?anio=YYYY' });
                return;
            }

            const datos = req.body; // array de objetos normalizados desde tu front
            await this.service.insertarInventarioInicial(datos, Number(anio), String(resetAnio) !== 'false');

            res.json({ message: `Inventario inicial insertado (${datos.length} registros)`, anio: Number(anio) });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error al insertar inventario_inicial' });
        }
    }
}

export default CargaMasivaController;
