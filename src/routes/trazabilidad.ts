// src/routes/trazabilidad.ts
import { Router } from 'express';
import TrazabilidadController from '../controllers/trazabilidad.controller';

const router = Router();
const controller = new TrazabilidadController();

router.get('/', controller.getMovimientosPorClaveYClues.bind(controller));
router.get('/all-factores-conversion', controller.getAllFactoresDeConversion.bind(controller));
router.get('/all-factores-conversion-v2', controller.getAllFactoresDeConversionV2.bind(controller));

export default router;
