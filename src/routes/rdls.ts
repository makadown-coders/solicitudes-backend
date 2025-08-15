// src/routes/rdls.ts
import { Router } from 'express';
import RdlsController from '../controllers/rdls.controller';

const router = Router();
const controller = new RdlsController();

router.get('/salidas-exterior', controller.salidasExterior.bind(controller));

export default router;
