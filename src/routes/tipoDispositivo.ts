// src/routes/tipoDispositivo.ts
import { Router } from 'express';
import TipoDispositivoController from '../controllers/tipoDispositivo.controller';
import { requireAuth } from '../auth/requireAuth';
import { requireTiAdminGlobal } from '../auth/requireRole';

const router = Router();
const c = new TipoDispositivoController();

router.get('/', requireAuth, requireTiAdminGlobal(), c.getAll.bind(c));

export default router;
