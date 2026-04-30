import express from 'express';
import IbOncoController from '../controllers/ib-onco.controller';

const router = express.Router();
const controller = new IbOncoController();

router.get('/unidades', controller.unidades.bind(controller));
router.get('/claves', controller.claves.bind(controller));
router.get('/abasto-cpm', controller.abastoCpm.bind(controller));
router.get('/citas-pendientes', controller.citasPendientes.bind(controller));
router.get('/resumen', controller.resumen.bind(controller));

export default router;
