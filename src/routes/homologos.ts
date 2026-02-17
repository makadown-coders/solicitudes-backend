import { Router } from 'express';
import HomologosController from '../controllers/homologos.controller';

const router = Router();
const ctrl = new HomologosController();

router.get('/', ctrl.getByClave.bind(ctrl));
router.post('/batch', ctrl.batch.bind(ctrl));

export default router;
