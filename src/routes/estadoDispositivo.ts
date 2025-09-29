// src/routes/estadoDispositivo.ts
import { Router } from 'express';
import EstadoDispositivoController from '../controllers/estadoDispositivo.controller';
import { requireAuth } from '../auth/requireAuth';

const router = Router();
const c = new EstadoDispositivoController();

router.get('/', requireAuth, c.getAll.bind(c));

export default router;
