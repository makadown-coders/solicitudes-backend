import { Router } from 'express';
import ExistenciasController from '../controllers/existencias.controller';
// Si más adelante proteges con auth: import { requireAuth } from '../auth/requireAuth';

const router = Router();
const controller = new ExistenciasController();

router.post('/init', controller.init.bind(controller));     // ?reset=true|false  (default true)
router.post('/batch', controller.batch.bind(controller));   // { rows: Row[] }

export default router;
