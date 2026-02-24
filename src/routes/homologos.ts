import { Router } from 'express';
import HomologosController from '../controllers/homologos.controller';

const router = Router();
const ctrl = new HomologosController();

router.get('/', ctrl.getByClave.bind(ctrl));
router.post('/batch', ctrl.batch.bind(ctrl));
router.post('/batch-forward', ctrl.batchForward.bind(ctrl));
router.get('/crud', ctrl.listarCrud.bind(ctrl));
router.get('/crud/:id', ctrl.obtenerCrudById.bind(ctrl));
router.post('/crud', ctrl.crearCrud.bind(ctrl));
router.put('/crud/:id', ctrl.actualizarCrud.bind(ctrl));
router.delete('/crud/:id', ctrl.eliminarCrud.bind(ctrl));

export default router;
