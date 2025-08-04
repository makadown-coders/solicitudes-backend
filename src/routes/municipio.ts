import { Router } from 'express';
import MunicipioController from '../controllers/municipio.controller';

const router = Router();
const controller = new MunicipioController();

router.get('/', controller.getAll.bind(controller));

export default router;
