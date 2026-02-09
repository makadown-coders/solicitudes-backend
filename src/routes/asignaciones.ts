// src/routes/asignaciones.ts
import { Router } from 'express';
import AsignacionesController from '../controllers/asignaciones.controller';
import { requireAuth } from '../auth/requireAuth';
import { requireRole } from '../auth/requireRole';

const router = Router();
const c = new AsignacionesController();

router.get('/dispositivos/:id/asignaciones', requireAuth, c.historial.bind(c));
router.post('/dispositivos/:id/asignaciones', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.crear.bind(c));
router.post('/dispositivos/:id/asignaciones/:asignacionId/revert', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.revert.bind(c));

export default router;

