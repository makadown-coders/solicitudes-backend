import { Router } from 'express';

import { requireAuth } from '../auth/requireAuth';
import { requireTiAdminGlobal } from '../auth/requireRole';
import TipoPerifericoController from '../controllers/tipoPeriferico.controller';

const router = Router();
const c = new TipoPerifericoController();

router.get('/', requireAuth, requireTiAdminGlobal(), c.getAll.bind(c));

export default router;
