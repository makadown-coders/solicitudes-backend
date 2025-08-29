import { Router } from 'express';
import AuthController from '../controllers/auth.controller';
import { requireAuth } from '../auth/requireAuth';

const router = Router();
const controller = new AuthController();

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', controller.login.bind(controller));

/**
 * POST /api/auth/refresh
 * Body: { refresh_token }
 */
router.post('/refresh', controller.refresh.bind(controller));

/**
 * GET /api/auth/me (protegido con Bearer)
 */
router.get('/me', requireAuth, controller.me.bind(controller));

/**
 * POST /api/auth/logout
 */
router.post('/logout', controller.logout.bind(controller));

export default router;
