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

router.get(
  '/unidades/:unidadId/personal',
  requireAuth,
  requireRhAccess(),
  controller.personalPorUnidad.bind(controller)
);

router.get(
  '/unidades/:unidadId/personas-candidatas',
  requireAuth,
  requireRhAccess(),
  controller.personasCandidatasPorUnidad.bind(controller)
);

router.post(
  '/unidades/:unidadId/adscripciones',
  requireAuth,
  requireRhAccess(),
  controller.createAdscripcionPorUnidad.bind(controller)
);

export default router;
