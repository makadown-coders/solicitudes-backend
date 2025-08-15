// src/routes/trazabilidad.ts
import { Router } from 'express';
import TrazabilidadController from '../controllers/trazabilidad.controller';

const router = Router();
const controller = new TrazabilidadController();

router.get('/', controller.getMovimientosPorClaveYClues.bind(controller));

export default router;
