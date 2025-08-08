// src/routes/historial.routes.ts
import { Router } from 'express';
import HistorialesController from '../controllers/historiales.controller';

const router = Router();
const controller = new HistorialesController();

/************************ PARA ABASTO *******************************/
router.post('/', controller.postArchivoSolicitud.bind(controller));

export default router;