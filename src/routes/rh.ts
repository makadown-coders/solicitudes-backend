import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth';
import { requireRhAccess } from '../auth/requireRhAccess';
import RhController from '../controllers/rh.controller';

const router = Router();
const controller = new RhController();

// Autogestión del empleado autenticado (/rh): requiere sesión válida y persona institucional activa,
// sin exigir rol administrativo RECURSOS_HUMANOS ni ADMIN_TIC.
router.get(
  '/mi-contexto',
  requireAuth,
  controller.miContexto.bind(controller)
);

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
  '/unidades/:unidadId/personal/:adscripcionId',
  requireAuth,
  requireRhAccess(),
  controller.fichaPersonalPorUnidad.bind(controller)
);

router.patch(
  '/unidades/:unidadId/personal/:adscripcionId/laboral',
  requireAuth,
  requireRhAccess(),
  controller.updateAdscripcionLaboralPorUnidad.bind(controller)
);

router.post(
  '/unidades/:unidadId/personal/:adscripcionId/revelar-identificadores',
  requireAuth,
  requireRhAccess(),
  controller.revelarIdentificadoresPorUnidad.bind(controller)
);

router.patch(
  '/unidades/:unidadId/personal/:adscripcionId/identificacion',
  requireAuth,
  requireRhAccess(),
  controller.updateIdentificacionPersonalPorUnidad.bind(controller)
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
