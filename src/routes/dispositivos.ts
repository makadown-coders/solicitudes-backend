// src/routes/dispositivos.ts
import { Router } from 'express';
import DispositivosController from '../controllers/dispositivos.controller';
import { requireAuth } from '../auth/requireAuth';
import { requireRole, scopeUnidadQuery } from '../auth/requireRole';

const router = Router();
const c = new DispositivosController();

router.get('/', requireAuth, scopeUnidadQuery(), c.list.bind(c));
router.post('/', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.create.bind(c));
router.get('/:id', requireAuth, c.byId.bind(c));

export default router;
