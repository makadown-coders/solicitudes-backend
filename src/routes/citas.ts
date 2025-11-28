// src/routes/citas.ts
import express from 'express';
import CitasController from '../controllers/citas.controller';

const router = express.Router();
const controller = new CitasController();

router.post('/init', controller.init.bind(controller));     // ?reset=true|false  (default true)
router.post('/batch', controller.batch.bind(controller));   // { rows: Row[] }
router.get('/', controller.search.bind(controller));
// 🔹 KPIs + subtotales / resumenes
router.get('/stats/resumen', controller.statsResumen.bind(controller));
router.get('/stats/proveedores', controller.statsProveedores.bind(controller));
router.get('/stats/cumplimiento-claves', controller.statsCumplimientoClaves.bind(controller));
// 🔹 Refrescar materialized views
router.post('/stats/refresh-mv', controller.refreshMaterializedViews.bind(controller));
router.get('/xclave', controller.obtenerXClave.bind(controller));
router.get('/slim-existencia', controller.getSlimParaExistencias.bind(controller));

// en vias de deprecación
router.get('/full', controller.obtenerDesdePowerAutomate64.bind(controller));

export default router;
