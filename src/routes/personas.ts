// src/routes/personas.ts
import { Router } from 'express';
import PersonasController from '../controllers/personas.controller';
import { requireAuth } from '../auth/requireAuth';
import { requireTiAdminGlobal } from '../auth/requireRole';

const router = Router();
const c = new PersonasController();

// Conservamos el prefijo /api/ti/personas que ya usa el front
router.get('/', requireAuth, requireTiAdminGlobal(), c.list.bind(c));
router.get('/:id', requireAuth, requireTiAdminGlobal(), c.byId.bind(c));

// Crear / Actualizar / Eliminar (para tu PersonasApiService)
router.post('/', requireAuth, requireTiAdminGlobal(), c.create.bind(c));
router.put('/:id', requireAuth, requireTiAdminGlobal(), c.update.bind(c));
router.delete('/:id', requireAuth, requireTiAdminGlobal(), c.softDelete.bind(c));

export default router;
