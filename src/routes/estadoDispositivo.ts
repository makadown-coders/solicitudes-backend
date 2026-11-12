// src/routes/estadoDispositivo.ts
import { Router } from 'express';
import EstadoDispositivoController from '../controllers/estadoDispositivo.controller';
import { requireAuth } from '../auth/requireAuth';
import { requireTiAdminGlobal } from '../auth/requireRole';

const router = Router();
const c = new EstadoDispositivoController();

router.get('/', requireAuth, requireTiAdminGlobal(), c.getAll.bind(c));

export default router;
