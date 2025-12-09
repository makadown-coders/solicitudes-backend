import { Router } from 'express';
import KitsClavesController from '../controllers/kitsClaves.controller';

const router = Router({ mergeParams: true });
const controller = new KitsClavesController();

// GET /api/kits/:codigo/clavesByCodigo
router.get('/', controller.listByCodigo.bind(controller));

export default router;