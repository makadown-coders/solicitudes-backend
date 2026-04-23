import express from 'express';
import HomologosController from '../controllers/homologos.controller';

const router = express.Router();
const controller = new HomologosController();

router.get('/', controller.getByClave.bind(controller));
router.post('/batch', controller.batch.bind(controller));
router.post('/batch-forward', controller.batchForward.bind(controller));
router.get('/crud', controller.listarCrud.bind(controller));
router.get('/crud/:id', controller.obtenerCrudById.bind(controller));
router.post('/crud', controller.crearCrud.bind(controller));
router.put('/crud/:id', controller.actualizarCrud.bind(controller));
router.delete('/crud/:id', controller.eliminarCrud.bind(controller));

export default router;
