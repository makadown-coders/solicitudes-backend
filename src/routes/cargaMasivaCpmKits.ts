import { Router } from 'express';
import CargaMasivaCpmKitsController from '../controllers/cargaMasivaCpmKits.controller';

const router = Router();
const controller = new CargaMasivaCpmKitsController();

// POST /api/carga-masiva/cpm-kits/init
router.post('/init', controller.init.bind(controller));

// POST /api/carga-masiva/cpm-kits/batch
router.post('/batch', controller.batchUpsert.bind(controller));

// POST /api/carga-masiva/cpm-kits/finalize
// router.post('/finalize', controller.finalize.bind(controller));

export default router;