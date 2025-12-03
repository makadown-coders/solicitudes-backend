// src/routes/unidades-kits.ts
import { Router } from 'express';
import UnidadMedicaKitsController from '../controllers/unidad-medica-kits.controller';

const router = Router();
const controller = new UnidadMedicaKitsController();

// GET /api/unidades-kits/:unidadId/kits
router.get('/:unidadId/kits', controller.getKitsByUnidad.bind(controller));

export default router;