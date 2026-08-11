import { Router } from 'express';
import ExistenciasController from '../controllers/existencias.controller';
// Si más adelante proteges con auth: import { requireAuth } from '../auth/requireAuth';

const router = Router();
const controller = new ExistenciasController();

router.post('/init', controller.init.bind(controller));     // ?reset=true|false  (default true)
router.post('/batch', controller.batch.bind(controller));   // { rows: Row[] }
router.get('/by-unidad', controller.byUnidad.bind(controller));
router.get('/has-by-unidad', controller.hasByUnidad.bind(controller));
router.get('/by-unidad-full', controller.getByUnidadFull.bind(controller));
router.get('/almacenes-full', controller.getAlmacenesFull.bind(controller));
router.get('/snapshot-info', controller.getSnapshotInfo.bind(controller));

export default router;
