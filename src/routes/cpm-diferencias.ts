import express from 'express';
import CpmDiferenciasController from '../controllers/cpm-diferencias.controller';

const router = express.Router();
const controller = new CpmDiferenciasController();

router.get('/', controller.diferencias.bind(controller));
router.get('/indicadores', controller.indicadores.bind(controller));
router.get('/resumen', controller.resumen.bind(controller));
router.get('/:cluesimb', controller.byCluesimb.bind(controller));

export default router;
