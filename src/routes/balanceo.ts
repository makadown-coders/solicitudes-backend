import express from 'express';
import BalanceoController from '../controllers/balanceo.controller';

const router = express.Router();
const controller = new BalanceoController();

// Ejecutar balanceo
router.post('/ejecutar', controller.ejecutarBalanceo.bind(controller));

// Info de la última ejecución
router.get('/ultima-ejecucion', controller.obtenerUltimaEjecucion.bind(controller));

// Resumen y detalle de la última ejecución (tab del dashboard)
router.get('/resumen-actual', controller.obtenerResumenActual.bind(controller));
router.get('/detalle-actual', controller.obtenerDetalleActual.bind(controller));

// Histórico por ejecucion_id (si luego quieres un tab de historial)
// router.get('/:ejecucionId/resumen', controller.obtenerResumenPorEjecucion);
// router.get('/:ejecucionId/detalle', controller.obtenerDetallePorEjecucion);

export default router;
