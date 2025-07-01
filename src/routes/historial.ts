import { Router } from 'express';
import HistorialesController from '../controllers/historiales.controller';

const router = Router();
const controller = new HistorialesController();

router.post('/', controller.postArchivoSolicitud.bind(controller));

export default router;