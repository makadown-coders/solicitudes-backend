// src/routes/kits-claves.ts
import { Router } from 'express';
import KitsClavesController from '../controllers/kitsClaves.controller';

const router = Router({ mergeParams: true });
const controller = new KitsClavesController();

// GET /api/kits/:kitId/claves
router.get('/', controller.listByKit.bind(controller));
// POST /api/kits/:kitId/claves
router.post('/', controller.addClave.bind(controller));
// DELETE /api/kits/:kitId/claves
router.delete('/:id', controller.deleteClave.bind(controller));

export default router;