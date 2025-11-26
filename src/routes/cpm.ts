// src/routes/cpm.ts
import express from 'express';
import CpmController from '../controllers/cpm.controller';

const router = express.Router();
const controller = new CpmController();

/********************** RUTAS DE ABASTO / UNIDADES MEDICAS **********************/
// TODO: meter requireAuth
router.get('/', controller.obtenerDesdePowerAutomate64.bind(controller));
// TODO: meter requireAuth
router.get('/expected-vs', controller.expectedVs.bind(controller));
/**
 * Ejemplos:
 *   /api/cpms/expected-vs?cluesimb=BCIMB001656
 *   /api/cpms/expected-vs?cluessa=BCSSA000123&kit=KIT_147
 *   /api/cpms/expected-vs?cluesimb=BCIMB001656&clave=010.000.5720.01
 */
// TODO: meter requireAuth
router.get('/by-unidad', controller.byUnidadGt0.bind(controller));
// Consulta (todo y >0)
router.get('/by-unidad-all', controller.byUnidadAll.bind(controller));
// Edición
router.patch('/', controller.upsertOne.bind(controller));
router.post('/batch', controller.upsertBatch.bind(controller));
router.get('/rutas-salud-claves', controller.rutasSaludClaves.bind(controller));
/**
 * Ejemplos:
 *   /api/cpms/by-unidad?cluesimb=BCIMB001656
 *   /api/cpms/by-unidad?cluessa=BCSSA000123
 */

export default router;