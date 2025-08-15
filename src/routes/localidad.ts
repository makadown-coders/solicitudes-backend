import { Router } from 'express';
import LocalidadController from '../controllers/localidad.controller';

const router = Router();
const controller = new LocalidadController();

router.get('/', controller.getAll.bind(controller));
router.get('/municipio/:municipioId', controller.getByMunicipio.bind(controller));

export default router;
