import { Router } from 'express';
import UnidadMedicaKitsController from '../controllers/unidad-medica-kits.controller';

const router  = Router({ mergeParams: true });
const controller = new UnidadMedicaKitsController();

// GET /api/kits/:kitId/unidades
router.get('/', controller.getUnidadesByKit.bind(controller));
// PUT /api/kits/:kitId/unidades
router.put('/', controller.setUnidadesByKitUsingClues.bind(controller));

export default router;