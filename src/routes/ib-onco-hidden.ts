import express from 'express';
import IbOncoController from '../controllers/ib-onco.controller';

const router = express.Router();
const controller = new IbOncoController();

router.get('/actualizar', controller.actualizarSaciaOnco.bind(controller));

export default router;
