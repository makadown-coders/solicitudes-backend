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
router.put('/:id', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.updateBasic.bind(c));
router.post('/:id/asignacion', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.cambiarAsignacion.bind(c));
router.post('/:id/monitores', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.agregarMonitor.bind(c));
router.put('/:id/monitores/:monitorId', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.actualizarMonitor.bind(c));
router.post('/:id/perifericos', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.agregarPeriferico.bind(c));
router.put('/:id/perifericos/:perifericoId', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.actualizarPeriferico.bind(c));
router.delete('/:id/monitores/:monitorId', requireAuth, requireRole('ADMIN_TIC','OPER_TIC'), c.eliminarMonitor.bind(c));

export default router;
