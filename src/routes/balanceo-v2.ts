import express from 'express';
import BalanceoV2Controller from '../controllers/balanceo-v2.controller';

const router = express.Router();
const controller = new BalanceoV2Controller();

router.post('/ejecutar', controller.ejecutarBalanceoV2.bind(controller));
router.get('/ejecuciones', controller.obtenerEjecuciones.bind(controller));
router.get('/ejecuciones/ultima', controller.obtenerUltimaEjecucion.bind(controller));
router.get(
  '/ejecuciones/:id/resumen-jurisdiccional',
  controller.obtenerResumenJurisdiccional.bind(controller)
);
router.get(
  '/ejecuciones/:id/detalle',
  controller.obtenerDetallePorEjecucion.bind(controller)
);
router.get(
  '/ejecuciones/:id/apartados',
  controller.obtenerApartadosPorEjecucion.bind(controller)
);
router.get(
  '/ejecuciones/:id/resultados',
  controller.obtenerResultadosPorEjecucion.bind(controller)
);

export default router;
