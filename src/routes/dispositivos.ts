// src/routes/dispositivos.ts
import { Router } from 'express';
import DispositivosController from '../controllers/dispositivos.controller';
import { requireAuth } from '../auth/requireAuth';
import { requireTiAdminGlobal } from '../auth/requireRole';

const router = Router();
const c = new DispositivosController();

router.get('/', requireAuth, requireTiAdminGlobal(), c.list.bind(c));
router.post('/', requireAuth, requireTiAdminGlobal(), c.create.bind(c));
router.get('/:id', requireAuth, requireTiAdminGlobal(), c.byId.bind(c));
router.put('/:id', requireAuth, requireTiAdminGlobal(), c.updateBasic.bind(c));
router.post('/:id/asignacion', requireAuth, requireTiAdminGlobal(), c.cambiarAsignacion.bind(c));
router.post('/:id/monitores', requireAuth,
     requireTiAdminGlobal(), c.agregarMonitor.bind(c));
router.put('/:id/monitores/:monitorId', requireAuth,
     requireTiAdminGlobal(), c.actualizarMonitor.bind(c));
router.post('/:id/perifericos', requireAuth, requireTiAdminGlobal(), c.agregarPeriferico.bind(c));
router.put('/:id/perifericos/:perifericoId', requireAuth,
     requireTiAdminGlobal(), c.actualizarPeriferico.bind(c));
router.delete('/:id/monitores/:monitorId', requireAuth,
     requireTiAdminGlobal(), c.eliminarMonitor.bind(c));
router.delete('/:id/perifericos/:perifericoId', requireAuth,
     requireTiAdminGlobal(), c.eliminarPeriferico.bind(c));

export default router;
