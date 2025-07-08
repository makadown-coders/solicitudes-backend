import express from 'express';
import InventarioController from '../controllers/inventario.controller';

const router = express.Router();
const controller = new InventarioController();

router.get('/', controller.obtenerDesdePowerAutomate64.bind(controller));
router.get('/HGENS', controller.obtenerHGENS.bind(controller));
router.get('/HGMXL', controller.obtenerHGMXL.bind(controller));
router.get('/HGTKT', controller.obtenerHGTKT.bind(controller));
router.get('/HGTIJ', controller.obtenerHGTIJ.bind(controller));
router.get('/HGTZE', controller.obtenerHGTZE.bind(controller));
router.get('/HMITIJ', controller.obtenerHMITIJ.bind(controller));
router.get('/HGPR', controller.obtenerHGPR.bind(controller));
router.get('/HMIMXL', controller.obtenerHMIMXL.bind(controller));
router.get('/UOMXL', controller.obtenerUOMXL.bind(controller));

export default router;