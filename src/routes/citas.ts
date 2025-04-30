import express from 'express';
import CitasController from '../controllers/citas.controller';

const router = express.Router();
const controller = new CitasController();

router.get('/', controller.obtenerPaginado.bind(controller));
router.get('/buscar-orden', controller.buscarPorOrden.bind(controller));

export default router;
