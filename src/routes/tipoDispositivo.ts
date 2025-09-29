// src/routes/tipoDispositivo.ts
import { Router } from 'express';
import TipoDispositivoController from '../controllers/tipoDispositivo.controller';
import { requireAuth } from '../auth/requireAuth';

const router = Router();
const c = new TipoDispositivoController();

router.get('/', requireAuth, c.getAll.bind(c));

export default router;
