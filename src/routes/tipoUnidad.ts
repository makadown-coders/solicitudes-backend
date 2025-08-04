import { Router } from 'express';
import TipoUnidadController from '../controllers/tipoUnidad.controller';

const router = Router();
const controller = new TipoUnidadController();

router.get('/', controller.getAll.bind(controller));

export default router;
