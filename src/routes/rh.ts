import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth';
import { requireRhAccess } from '../auth/requireRhAccess';
import RhController from '../controllers/rh.controller';

const router = Router();
const controller = new RhController();

router.get(
  '/unidades-autorizadas',
  requireAuth,
  requireRhAccess(),
  controller.unidadesAutorizadas.bind(controller)
);

export default router;
