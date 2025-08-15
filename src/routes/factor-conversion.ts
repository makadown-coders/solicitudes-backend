import { Router } from 'express';
import FactorConversionController from '../controllers/factor-conversion.controller';

const router = Router();
const controller = new FactorConversionController();

router.get('/factor', controller.obtenerPorClaveYClues.bind(controller));
router.get('/:clave', controller.obtener.bind(controller));

export default router;
