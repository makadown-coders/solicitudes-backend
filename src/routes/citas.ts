import express from 'express';
import CitasController from '../controllers/citas.controller';

const router = express.Router();
const controller = new CitasController();

router.get('/', controller.obtenerPaginado.bind(controller));
router.get('/buscar-orden', controller.buscarPorOrden.bind(controller));
router.post('/refrescar', controller.refrescarDesdePowerAutomate.bind(controller));
router.post('/full', controller.obtenerDesdePowerAutomate.bind(controller));


export default router;
