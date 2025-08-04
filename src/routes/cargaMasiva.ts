import { Router } from 'express';
import CargaMasivaController from '../controllers/cargaMasiva.controller';

const router = Router();
const controller = new CargaMasivaController();

router.post('/entradas/init', controller.initEntradas.bind(controller));
router.post('/entradas/batch', controller.batchEntradas.bind(controller));

router.post('/traspasos/init', controller.initTraspasos.bind(controller));
router.post('/traspasos/batch', controller.batchTraspasos.bind(controller));

router.post('/salidas/init', controller.initSalidas.bind(controller));
router.post('/salidas/batch', controller.batchSalidas.bind(controller));

export default router;
