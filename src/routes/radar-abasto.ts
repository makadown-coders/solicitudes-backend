import { Router } from 'express';
import RadarAbastoController from '../controllers/radar-abasto.controller';

const router = Router();
const ctrl = new RadarAbastoController();

router.post('/eventos', ctrl.crearEvento);
router.get('/eventos', ctrl.listarEventos);
router.get('/global/snapshot', ctrl.listarGlobalSnapshot);
router.get('/global/timeline', ctrl.listarGlobalTimeline);
router.get('/global/claves-riesgo', ctrl.listarGlobalClavesRiesgo);
router.get('/eventos/:id', ctrl.getEventoDetalle);
router.patch('/eventos/:id', ctrl.patchEvento);
router.post('/eventos/:id/recalcular', ctrl.recalcularEvento);

export default router;

