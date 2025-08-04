import express from 'express';
import CpmController from '../controllers/cpm.controller';

const router = express.Router();
const controller = new CpmController();

/********************** RUTAS DE ABASTO / UNIDADES MEDICAS **********************/
router.get('/', controller.obtenerDesdePowerAutomate64.bind(controller));

export default router;