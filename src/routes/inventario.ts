import express from 'express';
import InventarioController from '../controllers/inventario.controller';

const router = express.Router();
const controller = new InventarioController();

router.get('/', controller.obtenerDesdePowerAutomate64.bind(controller));

export default router;