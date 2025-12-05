import { Router } from 'express';
import KitsController from '../controllers/kits.controller';
import KitsBulkController from '../controllers/kitsBulk.controller';

const router = Router();

const controller = new KitsController();
const bulkController = new KitsBulkController();

// GET /api/kits?search=...
router.get('/', controller.listKits.bind(controller));
// POST /api/kits
router.post('/', controller.createKit.bind(controller));
// PUT /api/kits/:id
router.put('/:id', controller.updateKit.bind(controller));
// DELETE /api/kits/:id
router.delete('/:id', controller.deleteKit.bind(controller));
// masivo (todos los kits en una matriz)
router.post('/import-matrix', bulkController.importMatrix.bind(bulkController));
// por kit
router.post('/import-one', bulkController.importSingle.bind(bulkController));

export default router;

