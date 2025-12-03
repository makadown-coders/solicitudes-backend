import { Router } from 'express';
import KitsController from '../controllers/kits.controller';

const router = Router();

const controller = new KitsController();

// GET /api/kits?search=...
router.get('/', controller.listKits.bind(controller));
// POST /api/kits
router.post('/', controller.createKit.bind(controller));
// PUT /api/kits/:id
router.put('/:id', controller.updateKit.bind(controller));
// DELETE /api/kits/:id
router.delete('/:id', controller.deleteKit.bind(controller));

export default router;

