// src/routes/personas.ts
import { Router } from 'express';
import PersonasController from '../controllers/personas.controller';
import { requireAuth } from '../auth/requireAuth';
import { requireRole } from '../auth/requireRole';

const router = Router();
const c = new PersonasController();

// Conservamos el prefijo /api/ti/personas que ya usa el front
router.get('/', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.list.bind(c));
router.get('/:id', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.byId.bind(c));

export default router;
