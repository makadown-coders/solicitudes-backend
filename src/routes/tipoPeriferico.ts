import { Router } from 'express';

import { requireAuth } from '../auth/requireAuth';
import TipoPerifericoController from '../controllers/tipoPeriferico.controller';

const router = Router();
const c = new TipoPerifericoController();

router.get('/', requireAuth, c.getAll.bind(c));

export default router;