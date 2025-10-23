import express from 'express';
import CitasController from '../controllers/citas.controller';

const router = express.Router();
const controller = new CitasController();

router.post('/init', controller.init.bind(controller));     // ?reset=true|false  (default true)
router.post('/batch', controller.batch.bind(controller));   // { rows: Row[] }
// en vias de deprecación
router.get('/full', controller.obtenerDesdePowerAutomate64.bind(controller));

export default router;
