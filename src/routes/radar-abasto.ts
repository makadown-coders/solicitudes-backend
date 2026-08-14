import { Router } from 'express';
import RadarAbastoController from '../controllers/radar-abasto.controller';

const router = Router();
const ctrl = new RadarAbastoController();

router.post('/eventos', ctrl.crearEvento);
router.get('/eventos', ctrl.listarEventos);
router.get('/global/snapshot', ctrl.listarGlobalSnapshot);
router.get('/global/timeline', ctrl.listarGlobalTimeline);
router.get('/global/claves-riesgo', ctrl.listarGlobalClavesRiesgo);
router.get('/v2/claves', ctrl.listarGlobalV2);
router.get('/v2/export', ctrl.exportarGlobalV2);
router.post('/v2/export/detalles', ctrl.exportarGlobalV2Detalles);
router.get('/v2/claves/:clues/:clave/ordenes', ctrl.listarGlobalV2Ordenes);
router.get('/v2/claves/:clues/:clave/salidas', ctrl.listarGlobalV2Salidas);
router.get('/eventos/:id', ctrl.getEventoDetalle);
router.patch('/eventos/:id', ctrl.patchEvento);
router.post('/eventos/:id/recalcular', ctrl.recalcularEvento);

export default router;

