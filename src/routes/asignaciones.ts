// src/routes/asignaciones.ts
import { Router } from 'express';
import AsignacionesController from '../controllers/asignaciones.controller';
import { requireAuth } from '../auth/requireAuth';
import { requireTiAdminGlobal } from '../auth/requireRole';

const router = Router();
const c = new AsignacionesController();

router.get('/dispositivos/:id/asignaciones', requireAuth, requireTiAdminGlobal(), c.historial.bind(c));
router.post('/dispositivos/:id/asignaciones', requireAuth, requireTiAdminGlobal(), c.crear.bind(c));
router.post('/dispositivos/:id/asignaciones/:asignacionId/revert', requireAuth, requireTiAdminGlobal(), c.revert.bind(c));

export default router;
