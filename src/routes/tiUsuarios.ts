// src/routes/tiUsuarios.ts
import { Router } from 'express';
import TiUsuariosController from '../controllers/tiUsuarios.controller';
import { requireAuth } from '../auth/requireAuth';
import { requireTiAdminGlobal } from '../auth/requireRole';

const router = Router();
const c = new TiUsuariosController();

// Consulta de roles disponibles en el sistema (solo lectura, exclusivamente ADMIN_TIC GLOBAL)
router.get('/roles', requireAuth, requireTiAdminGlobal(), c.listRoles.bind(c));

// Consulta paginada de cuentas SSO con persona y roles vinculados (solo lectura, exclusivamente ADMIN_TIC GLOBAL)
router.get('/usuarios', requireAuth, requireTiAdminGlobal(), c.listUsuarios.bind(c));

// Administración de estado, restablecimiento de contraseña y roles (exclusivamente ADMIN_TIC GLOBAL)
router.patch('/usuarios/:id/status', requireAuth, requireTiAdminGlobal(), c.updateStatus.bind(c));
router.put('/usuarios/:id/password', requireAuth, requireTiAdminGlobal(), c.resetPassword.bind(c));
router.put('/usuarios/:id/roles', requireAuth, requireTiAdminGlobal(), c.updateRoles.bind(c));

export default router;
